import type { ParsedSentence, UdToken } from '../../types/index.ts';

/**
 * English expletive subjects, which Interslavic does not have.
 *
 * "It is raining" came out as "Ono doždi" and "It is important to read" as
 * "Ono jest važno čitati" - a referential neuter pronoun standing where
 * English needs a placeholder and Interslavic needs nothing.
 *
 * The grammar pages are silent: the syntax page covers word order, questions,
 * negation, final clauses and the passive, and says nothing about subject
 * pronouns. So this is settled by usage, where the two halves agree:
 *
 *  - Impersonal predicates appear with NO subject at all. Van Steenbergen's
 *    own translation has "trěba jest uznati za silnějšego od drugogo" ("it is
 *    necessary to recognise [him] as the stronger of the two"),
 *    http://steen.free.fr/interslavic/northwind.html, and the Interslavic
 *    Wikipedia has "Zato trěba jest podčrknuti, že..." and "Nužno jest tuty
 *    članok...".
 *  - Every single occurrence of `ono` in that corpus is REFERENTIAL, picking up
 *    a neuter noun: "Ono jest běloju zvězdoju" (of the Sun), "ono jest
 *    kombinacija dvoh slov" (of a word). None is a placeholder.
 *
 * Only unambiguous cases are deleted. "It is cold" and "It is a good book"
 * receive the same parse - `nsubj`, 3rd person neuter - so an `nsubj` "it" is
 * kept unless its verb is one that cannot take a referential subject at all.
 */

/**
 * English verbs whose subject can only ever be the weather placeholder. A
 * source-side fact about English, not a claim about Interslavic.
 */
const WEATHER_VERBS = new Set([
  'rain', 'snow', 'hail', 'sleet', 'drizzle', 'thunder', 'pour',
]);

export function isExpletiveSubject(token: UdToken, sentence: ParsedSentence): boolean {
  /**
   * UD's own label, which Stanza produces for extraposition ("It is important
   * to read", "It seems that she left") and for existential "there is". Both
   * are placeholders by definition, so no further test is needed.
   */
  if (token.deprel === 'expl') return true;

  if (token.deprel !== 'nsubj' || token.lemma.toLowerCase() !== 'it') return false;
  const verb = sentence.tokens.find((t) => t.id === token.head);
  return verb?.upos === 'VERB' && WEATHER_VERBS.has(verb.lemma.toLowerCase());
}

/** Exported for tests. */
export const EXPLETIVE_WEATHER_VERBS = [...WEATHER_VERBS];
