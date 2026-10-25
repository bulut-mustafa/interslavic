import type { Block } from '../types.ts';

const CASES = [
  ['Nominative', 'Nom'],
  ['Accusative', 'Acc'],
  ['Genitive', 'Gen'],
  ['Dative', 'Dat'],
  ['Instrumental', 'Ins'],
  ['Locative', 'Loc'],
  ['Vocative', 'Voc'],
] as const;

/**
 * A noun's case table, singular and plural side by side. The forms are written
 * out (the page shows them as written) and the test checks each one against
 * the engine; the vocative row only when `sg` has seven forms.
 */
export function declension(caption: string, lemma: string, xpos: string, sg: string[], pl: string[]): Block {
  return {
    kind: 'forms',
    caption,
    lemma,
    xpos,
    head: ['', 'Singular', 'Plural'],
    rows: CASES.slice(0, sg.length).map(([label, Case], i) => ({
      label,
      cells: [
        { form: sg[i]!, feats: { Case, Number: 'Sing' } },
        ...(pl[i] ? [{ form: pl[i]!, feats: { Case, Number: 'Plur' } }] : []),
      ],
    })),
  };
}

const AGREEMENT: [string, Record<string, string>][] = [
  ['Masc. animate', { Gender: 'Masc', Animacy: 'Anim', Number: 'Sing' }],
  ['Masc. inanimate', { Gender: 'Masc', Animacy: 'Inan', Number: 'Sing' }],
  ['Neuter', { Gender: 'Neut', Number: 'Sing' }],
  ['Feminine', { Gender: 'Fem', Number: 'Sing' }],
  ['Plural, masc. animate', { Gender: 'Masc', Animacy: 'Anim', Number: 'Plur' }],
  ['Plural, others', { Gender: 'Fem', Number: 'Plur' }],
];

/**
 * An adjective in every gender and case, six forms per row - the same layout
 * as the grammar's own table. Written out, checked against the engine.
 */
export function agreement(caption: string, lemma: string, rows: string[][]): Block {
  return {
    kind: 'forms',
    caption,
    lemma,
    xpos: 'adj.',
    head: ['', ...AGREEMENT.map(([label]) => label)],
    rows: CASES.slice(0, 6).map(([label, Case], i) => ({
      label,
      cells: rows[i]!.map((form, j) => ({ form, feats: { ...AGREEMENT[j]![1], Case } })),
    })),
  };
}

const PERSONS: [string, string, string][] = [
  ['ja', '1', 'Sing'],
  ['ty', '2', 'Sing'],
  ['on, ona, ono', '3', 'Sing'],
  ['my', '1', 'Plur'],
  ['vy', '2', 'Plur'],
  ['oni, one', '3', 'Plur'],
];

/**
 * Verbs side by side, one column each, one row per person - checked against
 * the engine form by form. `feats` says which tense or mood the table shows.
 */
export function conjugation(
  caption: string,
  feats: Record<string, string>,
  verbs: { lemma: string; xpos: string; forms: string[] }[],
  persons = PERSONS,
): Block {
  return {
    kind: 'forms',
    caption,
    lemma: verbs[0]!.lemma,
    xpos: verbs[0]!.xpos,
    head: ['', ...verbs.map((v) => v.lemma)],
    rows: persons.map(([label, Person, Number], r) => ({
      label,
      cells: verbs.map((v) => ({ form: v.forms[r]!, feats: { ...feats, Person, Number }, lemma: v.lemma, xpos: v.xpos })),
    })),
  };
}

/** The persons an imperative has: you (one), let us, you (several or polite). */
export const IMPERATIVE_PERSONS: [string, string, string][] = [
  ['ty', '2', 'Sing'],
  ['my', '1', 'Plur'],
  ['vy', '2', 'Plur'],
];
