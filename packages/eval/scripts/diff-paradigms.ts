/**
 * Differential audit: the form THIS ENGINE WOULD EMIT for a given feature slot,
 * against the same slot in `@interslavic/utils` - the inflection engine behind
 * interslavic-dictionary.com, and therefore the tables a user compares us with.
 *
 * Compares realize() output, not raw paradigms, because realize() is what
 * actually reaches the page: it is the selection logic (variant preference,
 * syncretism tie-breaks) that a raw paradigm dump would hide.
 *
 * Both sides are folded to standard orthography before comparison, since the
 * two engines legitimately differ on sanctioned etymological spellings
 * (see diff-orthography.ts).
 *
 * Run: node --experimental-strip-types packages/eval/scripts/diff-paradigms.ts
 */
import U from '@interslavic/utils';
import { Lexicon, type Entry } from '../../lexicon/src/reader.ts';
import { realize } from '../../morph/src/realize.ts';
import { toStandard } from '../../morph/src/orthography.ts';

const NOUN_SLOTS: Array<[string, string]> = [
  ['nom', 'Nom'], ['acc', 'Acc'], ['gen', 'Gen'],
  ['loc', 'Loc'], ['dat', 'Dat'], ['ins', 'Ins'], ['voc', 'Voc'],
];
const PERSONS: Array<[string, string]> = [
  ['1', 'Sing'], ['2', 'Sing'], ['3', 'Sing'], ['1', 'Plur'], ['2', 'Plur'], ['3', 'Plur'],
];

type Stat = { slots: number; agree: number; weOmit: number; theyOmit: number; differ: number };
const stats = new Map<string, Stat>();
const examples = new Map<string, string[]>();

function note(cls: string, kind: keyof Stat, detail?: string) {
  const s = stats.get(cls) ?? { slots: 0, agree: 0, weOmit: 0, theyOmit: 0, differ: 0 };
  s[kind]++;
  stats.set(cls, s);
  if (detail) {
    const key = `${cls}/${kind}`;
    const list = examples.get(key) ?? [];
    if (list.length < 200) { list.push(detail); examples.set(key, list); }
  }
}
const bump = (cls: string) => {
  const s = stats.get(cls) ?? { slots: 0, agree: 0, weOmit: 0, theyOmit: 0, differ: 0 };
  s.slots++;
  stats.set(cls, s);
};

/**
 * The reference lists alternatives inside one cell, separated by "/" or ",",
 * and puts optional forms in brackets ("jest (je)"). Any of them is a match.
 */
const refForms = (cell: string | null | undefined): string[] =>
  !cell
    ? []
    : cell
        .replace(/[()]/g, ' ')
        .split(/[\/,]/)
        .flatMap((s) => s.trim().split(/\s+/))
        .map((s) => toStandard(s.trim()))
        .filter(Boolean);

function compare(cls: string, lemma: string, slot: string, ours: string | null, cell: string | null) {
  bump(cls);
  const theirs = refForms(cell);
  if (!ours && theirs.length === 0) { note(cls, 'agree'); return; }
  if (!ours) { note(cls, 'weOmit', `${lemma} ${slot}: official "${theirs[0]}", we produce nothing`); return; }
  if (theirs.length === 0) { note(cls, 'theyOmit', `${lemma} ${slot}: we produce "${ours}", official nothing`); return; }
  if (theirs.includes(ours)) { note(cls, 'agree'); return; }
  note(cls, 'differ', `${lemma} ${slot}: ours "${ours}" vs official "${theirs.join(' / ')}"`);
}

const ourForm = (e: Entry, feats: Record<string, string>): string | null => {
  const r = realize({ lemma: e.lemma, xpos: e.pos.xpos, feats, principalParts: e.addition.principalParts });
  return r.ok ? toStandard(r.form) : null;
};

const lex = Lexicon.fromTsv('packages/lexicon/data/raw/words.tsv');
let skipped = 0;

for (const e of lex.entries) {
  if (e.pos.indeclinable || /\s/.test(e.lemma)) { skipped++; continue; }
  let pos: ReturnType<typeof U.parsePos>;
  try { pos = U.parsePos(e.pos.raw); } catch { skipped++; continue; }

  if (e.pos.upos === 'NOUN' && pos?.name === 'noun') {
    let ref;
    try {
      ref = U.declensionNoun(e.lemma, e.addition.raw, pos.gender, pos.animate, pos.plural, pos.singular, pos.indeclinable);
    } catch { skipped++; continue; }
    if (!ref) { skipped++; continue; }
    for (const [refKey, ourCase] of NOUN_SLOTS) {
      const pair = (ref as Record<string, [string | null, string | null]>)[refKey];
      if (!pair) continue;
      for (const [idx, num] of [[0, 'Sing'], [1, 'Plur']] as const) {
        compare('noun', e.lemma, `${ourCase}.${num}`, ourForm(e, { Case: ourCase, Number: num }), pair[idx]);
      }
    }
  } else if (e.pos.upos === 'VERB' && pos?.name === 'verb') {
    let ref;
    try { ref = U.conjugationVerb(e.lemma, e.addition.raw, e.pos.raw); } catch { skipped++; continue; }
    if (!ref) { skipped++; continue; }
    for (const [i, [person, num]] of PERSONS.entries()) {
      compare('verb.present', e.lemma, `${person}${num}`,
        ourForm(e, { Tense: 'Pres', Person: person, Number: num }), ref.present?.[i] ?? null);
    }
    // The l-participle: the standard past, and the only past our engine emits.
    const lpa = (ref.perfect?.[2] ?? '').replace(/^\(je\)\s*/, '').trim();
    compare('verb.lparticiple', e.lemma, 'Masc.Sing',
      ourForm(e, { VerbForm: 'Part', Tense: 'Past', Voice: 'Act', Gender: 'Masc', Number: 'Sing' }), lpa || null);
  }
}

console.log(`entries skipped (multiword / indeclinable / unparseable): ${skipped}\n`);
const pad = (n: number) => n.toString().padStart(7);
console.log('class            slots    agree   differ   we-omit  they-omit   agreement');
for (const [cls, s] of stats) {
  const compared = s.agree + s.differ + s.weOmit + s.theyOmit;
  const pct = compared ? ((s.agree / compared) * 100).toFixed(2) : '0';
  console.log(`${cls.padEnd(16)}${pad(s.slots)}${pad(s.agree)}${pad(s.differ)}${pad(s.weOmit)}${pad(s.theyOmit)}      ${pct}%`);
}
for (const [key, list] of examples) {
  console.log(`\n--- ${key} ---`);
  for (const ex of list) console.log(`  ${ex}`);
}
