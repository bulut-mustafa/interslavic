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

/**
 * "Having done X, ..." is the past one: "sdělati > sdělavši 'having done'"
 * (verbs page), used by van Steenbergen just so - "Uslyšavši to, ovca izběgla
 * v råvninų" (Schleicher's fable), "kratko podumavši, on dobavil" (Maly
 * princ). The clause has no subject of its own; "having" is its only sign.
 */
export function isPastTransgressive(verb: UdToken, sentence: ParsedSentence): boolean {
  if (sentence.lang !== 'en' || verb.deprel !== 'advcl' || verb.xpos !== 'VBN') return false;
  const children = sentence.tokens.filter((t) => t.head === verb.id);
  if (children.some((c) => c.deprel.startsWith('nsubj') || c.deprel === 'mark')) return false;
  return children.some((c) => c.deprel === 'aux' && c.lemma === 'have' && c.xpos === 'VBG');
}

/** The "having" of a past transgressive, which the participle itself carries. */
export function isPastTransgressiveAux(token: UdToken, sentence: ParsedSentence): boolean {
  if (token.deprel !== 'aux' || token.lemma !== 'have' || token.xpos !== 'VBG') return false;
  const verb = sentence.tokens.find((t) => t.id === token.head);
  return verb !== undefined && isPastTransgressive(verb, sentence);
}

/** The "while" of a transgressive clause, which the participle itself carries. */
export function isTransgressiveMark(token: UdToken, sentence: ParsedSentence): boolean {
  if (token.deprel !== 'mark' || !SIMULTANEOUS_MARKS.has(token.lemma.toLowerCase())) return false;
  const verb = sentence.tokens.find((t) => t.id === token.head);
  return verb !== undefined && isTransgressive(verb, sentence);
}
