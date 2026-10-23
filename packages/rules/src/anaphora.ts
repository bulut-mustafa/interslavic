import type { ParsedSentence, UdToken } from '../../types/index.ts';

/**
 * English "one" standing in for a noun already mentioned - "that one", "the
 * red one", "a better one". Interslavic has no such placeholder: the modifier
 * simply stands on its own, which van Steenbergen does throughout his prose.
 *
 *   "trěba jest uznati za silnějšego od drugogo"  ("the stronger" and "the
 *   other" both stand alone)  http://steen.free.fr/interslavic/northwind.html
 *   "Jedni ljudi prědpočitajut lěto, drugi zimu"  ("others" alone)
 *   http://steen.free.fr/interslavic/syntax.html
 *
 * Translating the word produced a numeral: "than that one" came out as "než ta
 * jedna" and "the red one" as "črveny jedin", both of which read as counting
 * something.
 *
 * Two things separate it from the numeral, which shares its lemma. Stanza tags
 * the counting "one" NUM ("One of them is broken"), so only a NOUN is a
 * candidate; and the word may only be dropped when something SURVIVES to carry
 * the phrase - an adjective, or a demonstrative. An article does not count: it
 * is deleted too, so "I am the one" would be left as the bare "Ja jesm".
 */
export function isOneAnaphor(token: UdToken, sentence: ParsedSentence): boolean {
  if (token.upos !== 'NOUN' || token.lemma.toLowerCase() !== 'one') return false;
  return sentence.tokens.some(
    (t) =>
      t.head === token.id &&
      (t.deprel === 'amod' || (t.deprel === 'det' && t.feats['PronType'] !== 'Art')),
  );
}

/**
 * The noun the placeholder stands for, which is where its gender has to come
 * from: "This book is more interesting than that one" needs the feminine `ta`,
 * from `kniga`. The nearest preceding noun is the antecedent in a comparison,
 * which is the construction this appears in most.
 *
 * Returns null when the sentence contains no candidate, and the caller falls
 * back to its usual default rather than inventing agreement.
 */
export function antecedentOf(token: UdToken, sentence: ParsedSentence): UdToken | null {
  const before = sentence.tokens.filter(
    (t) => t.id < token.id && (t.upos === 'NOUN' || t.upos === 'PROPN') && t.lemma.toLowerCase() !== 'one',
  );
  return before.length > 0 ? before[before.length - 1]! : null;
}
