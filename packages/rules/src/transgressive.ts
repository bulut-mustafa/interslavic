import type { ParsedSentence, UdToken } from '../../types/index.ts';

/**
 * An English -ing adverbial clause with no subject of its own is the adverbial
 * present participle, the "transgressive":
 *
 *   "While going to her work, she always smokes a cigarette"
 *   -> "Iduči do raboty, ona vsegda dymi cigaretoju"
 *
 * "The adverbial present active participle (also known as „transgressive")
 * has the same ending, but is not inflected for gender" - the ending being
 * the 3rd person plural with -t replaced by -či.
 * http://steen.free.fr/interslavic/verbs.html
 *
 * Only "while", "when" or no marker at all: "after going" and "before going"
 * are not simultaneous, which is what the present participle expresses.
 */
const SIMULTANEOUS_MARKS = new Set(['while', 'when']);

export function isTransgressive(verb: UdToken, sentence: ParsedSentence): boolean {
  if (sentence.lang !== 'en' || verb.deprel !== 'advcl' || verb.xpos !== 'VBG') return false;
  const children = sentence.tokens.filter((t) => t.head === verb.id);
  if (children.some((c) => c.deprel.startsWith('nsubj'))) return false;
  return children
    .filter((c) => c.deprel === 'mark')
    .every((m) => SIMULTANEOUS_MARKS.has(m.lemma.toLowerCase()));
}

/** The "while" of a transgressive clause, which the participle itself carries. */
export function isTransgressiveMark(token: UdToken, sentence: ParsedSentence): boolean {
  if (token.deprel !== 'mark' || !SIMULTANEOUS_MARKS.has(token.lemma.toLowerCase())) return false;
  const verb = sentence.tokens.find((t) => t.id === token.head);
  return verb !== undefined && isTransgressive(verb, sentence);
}
