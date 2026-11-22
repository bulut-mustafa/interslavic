/**
 * Real-world score: Tatoeba sentences that have an attested Interslavic
 * translation, never chosen by whoever wrote the rules.
 *   node --experimental-strip-types packages/eval/scripts/score-tatoeba.ts [tune|held] [--misses]
 *
 * Tune on the `tune` half, report on the `held` half, which no fix may look at.
 * The references are community translations in free variation ("je"/"jest"),
 * so word overlap (F1) is the measure; exact match is a floor. Both sides are
 * folded to plain lowercase letters, because contributors write in several
 * orthographies. Parses are frozen in data/tatoeba/<lang>/<id>.conllu
 * (Stanza, via parser_service.to_conllu), so the score needs no parser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../../engine/src/conllu.ts';
import { translate } from '../../engine/src/pipeline.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DATA = path.join(ROOT, 'packages/eval/data/tatoeba');
const split = process.argv.find((a) => a === 'tune' || a === 'held') ?? 'held';
const showMisses = process.argv.includes('--misses');

const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const pairs = JSON.parse(fs.readFileSync(path.join(DATA, 'pairs.json'), 'utf8')) as Record<
  string,
  { id: string; source: string; isv: string; split: string }[]
>;

const words = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

function f1(got: string[], want: string[]): number {
  const left = new Map<string, number>();
  for (const w of want) left.set(w, (left.get(w) ?? 0) + 1);
  let common = 0;
  for (const w of got) {
    const n = left.get(w) ?? 0;
    if (n > 0) { common++; left.set(w, n - 1); }
  }
  return common === 0 ? 0 : (2 * common) / (got.length + want.length);
}

for (const [lang, all] of Object.entries(pairs)) {
  let exact = 0, f1sum = 0, nWords = 0, untranslated = 0, guesses = 0;
  const misses: string[] = [];
  const chosen = all.filter((p) => p.split === split);
  for (const p of chosen) {
    const conllu = fs.readFileSync(path.join(DATA, lang, `${p.id}.conllu`), 'utf8');
    const out = conllu.split(/\n\s*\n/).filter((b) => b.trim()).map((b) =>
      translate(parseConllu(b), lex, { orthography: 'standard' }));
    const got = out.map((t) => t.text).join(' ');
    for (const t of out) for (const w of t.words) {
      nWords++;
      if (w.validation === 'untranslated') untranslated++;
      if (w.features.some((f) => f.confidence === 'guess')) guesses++;
    }
    const score = f1(words(got), words(p.isv));
    f1sum += score;
    if (words(got).join(' ') === words(p.isv).join(' ')) exact++;
    else if (showMisses) misses.push(`  ${score.toFixed(2)}  ${p.source}\n        ref:  ${p.isv}\n        ours: ${got}`);
  }
  const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;
  if (showMisses) console.log(misses.sort().join('\n'));
  console.log(
    `${lang} ${split}: ${chosen.length} sentences  exact ${exact} (${pct(exact, chosen.length)})  ` +
      `word F1 ${(f1sum / chosen.length).toFixed(3)}  untranslated ${pct(untranslated, nWords)}  ` +
      `words with a guess ${pct(guesses, nWords)}`,
  );
}
