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
