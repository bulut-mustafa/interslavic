/**
 * Real-world score: Tatoeba sentences with attested Interslavic translations,
 * never chosen by whoever wrote the rules.
 *
 *   node --experimental-strip-types packages/eval/scripts/score-tatoeba.ts [tune|held] [options]
 *     --misses          list every sentence that is not an exact match
 *     --save <file>     write this run's outputs (one JSON line per sentence)
 *     --compare <file>  paired bootstrap of this run against a saved one
 *     --parses <dir>    read the CoNLL-U from <dir>/<lang>/<id>.conllu instead,
 *                       to score another parser on the same sentences
 *
 * Tune on `tune`; report `held`, which no fix may look at. chrF (sacrebleu's
 * default) is the main number; exact match and word F1 stay beside it. All
 * references count: a sentence is scored against its best one. The sample is
 * built by build-tatoeba.py; parses are frozen in data/tatoeba/<lang>/<id>.conllu.
 *
 * No human ceiling: two people wrote 94% of the references, and only one
 * sentence has translations by two different people (checked 2026-11-22).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../../engine/src/conllu.ts';
import { translate } from '../../engine/src/pipeline.ts';
import { chrfStats, corpusChrf, exact, pairedBootstrap, tyRegister, wordF1, type ChrfStats } from './metrics.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DATA = path.join(ROOT, 'packages/eval/data/tatoeba');
const args = process.argv.slice(2);
const split = args.find((a) => a === 'tune' || a === 'held') ?? 'held';
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const savePath = option('--save');
const comparePath = option('--compare');
const parses = option('--parses') ?? DATA;

const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const pairs = JSON.parse(fs.readFileSync(path.join(DATA, 'pairs.json'), 'utf8')) as Record<
  string,
  { id: string; source: string; refs: string[]; by: string[]; split: string }[]
>;
const saved = new Map<string, string>(
  comparePath
    ? fs.readFileSync(comparePath, 'utf8').split('\n').filter(Boolean).map((l) => {
        const r = JSON.parse(l) as { lang: string; id: string; out: string };
        return [`${r.lang}/${r.id}`, r.out];
      })
    : [],
);
const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;
const saveLines: string[] = [];

for (const [lang, all] of Object.entries(pairs)) {
  const chosen = all.filter((p) => p.split === split);
  let hits = 0, f1 = 0, nWords = 0, untranslated = 0, guesses = 0, register = 0;
  const stats: ChrfStats[] = [];
  const before: ChrfStats[] = [];
  const misses: string[] = [];
  for (const p of chosen) {
    const conllu = fs.readFileSync(path.join(parses, lang, `${p.id}.conllu`), 'utf8');
    const out = conllu.split(/\n\s*\n/).filter((b) => b.trim()).map((b) =>
      translate(parseConllu(b), lex, { orthography: 'standard' }));
    const got = out.map((t) => t.text).join(' ');
    for (const t of out) for (const w of t.words) {
      nWords++;
      if (w.validation === 'untranslated') untranslated++;
      if (w.features.some((f) => f.confidence === 'guess')) guesses++;
    }
    stats.push(chrfStats(got, p.refs));
    if (comparePath) {
      const old = saved.get(`${lang}/${p.id}`);
      if (old === undefined) throw new Error(`${comparePath} has no output for ${lang}/${p.id}`);
      before.push(chrfStats(old, p.refs));
    }
    f1 += wordF1(got, p.refs);
    if (tyRegister(got, p.refs)) register++;
    if (exact(got, p.refs)) hits++;
    else if (args.includes('--misses')) misses.push(`  ${p.source}\n        ref:  ${p.refs.join('  |  ')}\n        ours: ${got}`);
    saveLines.push(JSON.stringify({ lang, id: p.id, out: got }));
  }
  if (misses.length) console.log(misses.join('\n'));
  const n = chosen.length;
  console.log(
    `${lang} ${split}: ${n} sentences  chrF ${corpusChrf(stats).toFixed(1)}  exact ${hits} (${pct(hits, n)})  ` +
      `word F1 ${(f1 / n).toFixed(3)}  untranslated ${pct(untranslated, nWords)}  words with a guess ${pct(guesses, nWords)}`,
  );
  console.log(`   ${register} sentences use "vy" where every reference uses "ty" (register, not error: see metrics.ts)`);
  if (comparePath) {
    const b = pairedBootstrap(before, stats);
    const verdict = b.low > 0 ? 'better' : b.high < 0 ? 'worse' : 'no significant change';
    console.log(`   vs ${path.basename(comparePath)}: chrF ${b.delta >= 0 ? '+' : ''}${b.delta.toFixed(2)}  95% interval [${b.low.toFixed(2)}, ${b.high.toFixed(2)}]  ${verdict}`);
  }
}
if (savePath) fs.writeFileSync(savePath, saveLines.join('\n') + '\n');
