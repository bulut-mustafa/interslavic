/**
 * Reflexives: the clitic `se` for a reflexive object, and `svoj` for a
 * possessor that is also the subject.
 *
 * Both rules are stated outright on the pronouns page, and both were missing:
 *
 *   "Se is used in reflexive verbs: Ja myju se 'I'm washing myself'. If it
 *    needs to be stressed, the longer form is used: Ja myju jedino sebe.
 *    After a preposition, it is better to use the longer forms: k mně, za tebe."
 *
 *   "Whenever the possessor is also the subject of the sentence, the reflexive
 *    svoj is used, no matter whether this subject is in the third person or
 *    not: Ja myju svoje avto 'I am washing my car'."
 *
 * Source: http://steen.free.fr/interslavic/pronouns.html
 *
 * Before this, "He hurt himself" produced the STRESSED `sebe` where the clitic
 * belongs, and "I wash myself" produced raw English, because `myself` is the
 * one reflexive the dictionary's gloss list for `sebe` omits ("oneself,
 * yourself, himself, herself, itself, ourselves, yourselves, themselves").
 */

/** The reflexive pronoun entry; its English glosses do not cover "myself". */
export const REFLEXIVE_PRONOUN = 'sebe';

/** The reflexive possessive. Its only gloss is "one's own", which no source lemma matches. */
export const REFLEXIVE_POSSESSIVE = 'svoj';

const REFLEXIVE_LEMMAS = new Set([
  'myself',
  'yourself',
  'himself',
  'herself',
  'itself',
  'oneself',
  'ourselves',
  'yourselves',
  'themselves',
]);

/**
 * English reflexive pronouns. Stanza also marks these `Reflex=Yes`, which the
 * caller checks; the list catches the case where it does not, and documents
 * exactly which words are in scope.
 */
export function isReflexivePronoun(lemma: string): boolean {
  return REFLEXIVE_LEMMAS.has(lemma.toLowerCase());
}

/**
 * Only the accusative and dative have clitic forms (`sę`, `si`). Asking for a
 * clitic in any other case would match nothing and fall back to the citation
 * form, so the caller must not.
 */
export function hasCliticForm(grammaticalCase: string): boolean {
  return grammaticalCase === 'Acc' || grammaticalCase === 'Dat';
}
