/**
 * Generate the preposition-government table from the dictionary.
 *
 * The dictionary states government as numeric codes in the `addition` column
 * (+2=Gen ... +6=Loc) and already splits ambiguous prepositions into separate
 * entries per sense, so the English gloss disambiguates the case:
 *   v + Loc "in, within"  vs  v + Acc "into"
 *
 * Run: node --experimental-strip-types packages/rules/scripts/gen-prepositions.ts
 * Hand edits belong in preposition-government.overrides.json, never here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Lexicon, type Entry } from '../../lexicon/src/reader.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));

const preps: Entry[] = lex.entries.filter((e) => e.pos.raw.startsWith('prep.'));

const byLemma = new Map<string, Entry[]>();
for (const e of preps) {
  let bucket = byLemma.get(e.lemma);
  if (!bucket) byLemma.set(e.lemma, (bucket = []));
  bucket.push(e);
}

const rows = [...byLemma.keys()]
  .sort()
  .flatMap((lemma) =>
    (byLemma.get(lemma) ?? [])
      .filter((e) => e.addition.governs)
      .map((e) => ({
        prep: lemma,
        case: e.addition.governs!,
        en: e.glosses.map((g) => (g.sense ? `${g.text} (${g.sense})` : g.text)),
        freq: e.frequency,
      })),
  );

const multiCase = [...byLemma.entries()].filter(
  ([, es]) => new Set(es.map((e) => e.addition.governs).filter(Boolean)).size > 1,
);

const out = {
  _comment:
    'GENERATED from the dictionary addition column numeric codes (+2=Gen ... +6=Loc). ' +
    'Regenerate with packages/rules/scripts/gen-prepositions.ts. Hand edits belong in ' +
    'preposition-government.overrides.json.',
  _generatedFrom: 'packages/lexicon/data/provenance.json',
  _stats: {
    prepLemmas: byLemma.size,
    governmentRows: rows.length,
    lemmasGoverningMoreThanOneCase: multiCase.length,
  },
  prepositions: rows,
};

fs.writeFileSync(
  path.join(ROOT, 'packages/rules/data/preposition-government.json'),
  `${JSON.stringify(out, null, 2)}\n`,
);

process.stdout.write(
  `wrote ${rows.length} government rows for ${byLemma.size} prepositions ` +
    `(${multiCase.length} govern more than one case)\n`,
);
