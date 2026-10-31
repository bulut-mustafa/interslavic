/**
 * Differential audit: our hand-rolled orthography tables vs the official
 * transliterator shipped by the Interslavic org (`@interslavic/utils`, MIT),
 * which is what interslavic-dictionary.com renders with.
 *
 * Tier-3 oracle (see docs/verification/testing-and-oracles.md): where it disagrees with the
 * normative alphabet pages, the pages win - but every disagreement must be
 * looked at, because a silent orthography bug changes every form it touches.
 *
 * Run: node --experimental-strip-types packages/eval/scripts/diff-orthography.ts
 */
import U from '@interslavic/utils';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { paradigm } from '../../morph/src/realize.ts';
import { render, type Orthography } from '../../morph/src/orthography.ts';

/** Our orthography -> the official BCP47 tag that should produce the same text. */
const MAPPING: Array<[Orthography, string]> = [
  ['etymological', 'isv-Latn-x-etymolog'],
  ['standard', 'isv-Latn'],
  ['cyrillic', 'isv-Cyrl'],
  // 'simplified' has no official counterpart - reported separately below.
];

/**
 * Spellings the orthography page explicitly sanctions as equivalent, so a
 * difference here is a choice, not a defect:
 *
 *   "since the letters t́ and d́ do not occur in any language (even in Unicode
 *    they can only be written with the help of a combining diacritic), they may
 *    be written with a haček as well: ť and ď [...] Likewise, ĺ can be written
 *    as ľ."
 *   http://steen.free.fr/interslavic/orthography.html
 *
 * We emit the haček forms because they are single codepoints, which keeps the
 * output font-safe and byte-stable.
 */
const SANCTIONED_VARIANTS: [string, string][] = [
  ['ľ', 'ĺ'], ['Ľ', 'Ĺ'],
  ['ť', 't́'], ['Ť', 'T́'],
  ['ď', 'd́'], ['Ď', 'D́'],
];

const asSanctioned = (text: string): string => {
  let out = text.normalize('NFC');
  for (const [ours, theirs] of SANCTIONED_VARIANTS) out = out.split(ours).join(theirs);
  return out;
};

const lex = Lexicon.fromTsv('packages/lexicon/data/raw/words.tsv');

type Bucket = { count: number; examples: string[] };
const buckets = new Map<string, Bucket>();
const totals = new Map<string, { checked: number; mismatched: number; sanctioned: number }>();
for (const [orth] of MAPPING) totals.set(orth, { checked: 0, mismatched: 0, sanctioned: 0 });

/** Character-level signature of a disagreement, so N forms collapse to K patterns. */
function signature(ours: string, theirs: string): string {
  const a = [...ours];
  const b = [...theirs];
  const diffs = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    diffs.add(`${a[i] ?? '∅'}→${b[j] ?? '∅'}`);
    // Resynchronise on the next shared character so one insertion does not
    // cascade into a diff at every later position.
    if (a[i + 1] === b[j]) { i++; continue; }
    if (a[i] === b[j + 1]) { j++; continue; }
    i++; j++;
  }
  return [...diffs].join(',');
}

let forms = 0;
const simplifiedUnofficial: string[] = [];

for (const entry of lex.entries) {
  if (entry.pos.indeclinable) continue;
  for (const tok of paradigm(entry.lemma, entry.pos.xpos, entry.addition.principalParts)) {
    const src = tok.form;
    if (!src || /[(),;]/.test(src)) continue;
    forms++;
    for (const [orth, tag] of MAPPING) {
      let theirs: string;
      try { theirs = U.transliterate(src, tag as Parameters<typeof U.transliterate>[1]); }
      catch { continue; }
      const ours = render(src, orth);
      const t = totals.get(orth)!;
      t.checked++;
      if (ours === theirs) continue;
      if (asSanctioned(ours) === theirs.normalize('NFC')) { t.sanctioned++; continue; }
      t.mismatched++;
      const key = `${orth}  ${signature(ours, theirs)}`;
      const b = buckets.get(key) ?? { count: 0, examples: [] };
      b.count++;
      if (b.examples.length < 4) b.examples.push(`${src} → ours "${ours}" vs official "${theirs}"`);
      buckets.set(key, b);
    }
    // "simplified" is the orthography page's named ě -> e simplification, which
    // the reference transliterator has no BCP47 tag for. Confirm it is exactly
    // that and nothing more, rather than comparing it to a tag it cannot match.
    if (simplifiedUnofficial.length < 6) {
      const ours = render(src, 'simplified');
      if (ours !== render(src, 'standard').split('ě').join('e')) {
        simplifiedUnofficial.push(`${src} → ours "${ours}" is not standard-with-jat-folded`);
      }
    }
  }
}

console.log(`forms compared: ${forms}\n`);
for (const [orth, t] of totals) {
  const pct = t.checked ? ((t.mismatched / t.checked) * 100).toFixed(2) : '0';
  const note = t.sanctioned ? `  (+${t.sanctioned} sanctioned-variant spellings, not defects)` : '';
  console.log(`${orth.padEnd(13)} ${t.mismatched}/${t.checked} mismatched (${pct}%)${note}`);
}

console.log('\n--- disagreement patterns, most frequent first ---');
for (const [key, b] of [...buckets].sort((x, y) => y[1].count - x[1].count).slice(0, 25)) {
  console.log(`\n${b.count.toString().padStart(7)}  ${key}`);
  for (const ex of b.examples) console.log(`         ${ex}`);
}

console.log(`\n--- "simplified": deviations from the page's jat simplification ---`);
for (const ex of simplifiedUnofficial) console.log(`  ${ex}`);
