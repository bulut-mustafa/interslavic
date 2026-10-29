/**
 * Current gold score, with every difference shown. Run it to see where the
 * engine stands before deciding what to fix next:
 *   node --experimental-strip-types packages/eval/scripts/score-gold.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { parseConllu } from '../../engine/src/conllu.ts';
import { translate } from '../../engine/src/pipeline.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
const gold = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'packages/eval/data/gold-steenbergen.json'), 'utf8'),
) as { pairs: { id: string; lang?: string; en?: string; ru?: string; uk?: string; isv: string; page: string; tests: string[] }[] };

/** Terminal punctuation is not what gold measures - several pages give their
 *  examples inline, without a final period. Meaning is what is measured. */
const key = (s: string) => s.trim().toLowerCase().replace(/[.!?…]+$/, '');

let matched = 0;
const byLang = new Map<string, { hit: number; all: number }>();
const rows: string[] = [];
for (const p of gold.pairs) {
  const file = path.join(ROOT, 'packages/engine/test/fixtures/parse/gold', `${p.id}.conllu`);
  if (!fs.existsSync(file)) { rows.push(`${p.id}  NO FIXTURE`); continue; }
  const got = translate(parseConllu(fs.readFileSync(file, 'utf8')), lex, { orthography: 'standard' }).text;
  const ok = key(got) === key(p.isv);
  if (ok) matched++;
  const lang = byLang.get(p.lang ?? 'en') ?? { hit: 0, all: 0 };
  lang.all++; if (ok) lang.hit++;
  byLang.set(p.lang ?? 'en', lang);
  rows.push(
    `${ok ? '  ok  ' : '  --  '}${p.id}  ${p.en ?? p.ru ?? p.uk}\n` +
    `         gold: ${p.isv}\n` +
    (ok ? '' : `         ours: ${got}\n`) +
    `         tests: ${p.tests.join(', ')}`,
  );
}
console.log(rows.join('\n'));
console.log(`\n${matched}/${gold.pairs.length} exact matches`);
console.log([...byLang].map(([l, s]) => `  ${l} ${s.hit}/${s.all}`).join('\n'));

// Per-tag pass rate, so a change shows WHICH rule improved.
const tag = new Map<string, { hit: number; all: number }>();
for (const p of gold.pairs) {
  const file = path.join(ROOT, 'packages/engine/test/fixtures/parse/gold', `${p.id}.conllu`);
  if (!fs.existsSync(file)) continue;
  const got = translate(parseConllu(fs.readFileSync(file, 'utf8')), lex, { orthography: 'standard' }).text;
  const ok = key(got) === key(p.isv);
  for (const t of p.tests) {
    const s = tag.get(t) ?? { hit: 0, all: 0 };
    s.all++; if (ok) s.hit++;
    tag.set(t, s);
  }
}
console.log('\nby construction:');
for (const [t, s] of [...tag].sort((a, b) => a[1].hit / a[1].all - b[1].hit / b[1].all)) {
  console.log(`  ${s.hit}/${s.all}  ${t}`);
}
