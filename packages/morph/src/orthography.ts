/**
 * Orthography is a pure post-processing layer on finished output - which is why
 * supporting several variants is cheap and never touches the transfer rules.
 *
 * The dictionary cites words in the ETYMOLOGICAL alphabet (hlapec is stored as
 * "hlapec" with a-ring and e-dot), so standard output requires folding.
 *
 * Note: `e-caron` is part of the STANDARD 27-letter alphabet, so it is NOT
 * folded for standard output; it is only reduced in the further-simplified
 * variant. Getting this wrong changes every form with a jat in it.
 */

export type Orthography = 'etymological' | 'standard' | 'simplified' | 'cyrillic';

/** Etymological-only letters and their standard-alphabet folds. */
const FOLD_TO_STANDARD: [string, string][] = [
  ['ę', 'e'], ['ų', 'u'], ['å', 'a'], ['ė', 'e'], ['ȯ', 'o'],
  ['ć', 'č'], ['đ', 'dž'],
  ['ĺ', 'l'], ['ľ', 'l'], ['ń', 'n'], ['ŕ', 'r'],
  ['ť', 't'], ['ď', 'd'], ['ś', 's'], ['ź', 'z'],
];

/**
 * The further reduction that also removes jat. Not a variant we invented, and
 * not one the reference transliterator has a BCP47 tag for - the orthography
 * page names it directly:
 *
 *   "For those who cannot write ě / є and those who don't know when to write
 *    it, the best alternative is Latin e / Cyrillic е. This is a legitimate
 *    simplification that puts ě in a position similar to the letter ё in
 *    Russian, in other words: the diacritic represents a different
 *    pronunciation, but may remain unwritten."
 *   http://steen.free.fr/interslavic/orthography.html
 *
 * The same page offers one further simplification we deliberately do NOT apply,
 * because it is addressed to a particular audience rather than to everyone:
 * y -> i, "advised" for those targeting a predominantly South Slavic audience.
 */
const FOLD_TO_SIMPLIFIED: [string, string][] = [['ě', 'e']];

const applyFolds = (text: string, pairs: [string, string][]): string => {
  let out = text;
  for (const [from, to] of pairs) {
    out = out.split(from).join(to);
    const upFrom = from.toUpperCase();
    // "dž" must become "Dž", not "DŽ", when folding a capital.
    const upTo = to.length > 1 ? to.charAt(0).toUpperCase() + to.slice(1) : to.toUpperCase();
    out = out.split(upFrom).join(upTo);
  }
  return out;
};

export const toStandard = (text: string): string => applyFolds(text, FOLD_TO_STANDARD);

export const toSimplified = (text: string): string =>
  applyFolds(toStandard(text), FOLD_TO_SIMPLIFIED);

/**
 * `lj` and `nj` are single sounds with their own Cyrillic letters (љ, њ). The
 * orthography page names two cases where they are instead TWO sounds and must
 * stay лј / нј:
 *
 *   1. the j belongs to a suffix -je/-ji/-ju. The ETYMOLOGICAL spelling marks
 *      this by softening the consonant, so pisańje -> писанје, usiľje -> усилје.
 *   2. the n ends a Latin or Greek prefix: konjunktura -> конјунктура.
 *
 * Source: http://steen.free.fr/interslavic/orthography.html
 *   "when the j is part of a suffix or ending (-je, -ji, -ju). Ideally, they
 *    should be written писанје, усилје in Cyrillic, but since automated
 *    transliteration is unable to predict whether nj should become њ or нј,
 *    писање and усиље are considered valid alternatives."
 *
 * We CAN predict it, because the dictionary cites the etymological spelling and
 * the softened consonant is exactly that prediction. So we emit the page's
 * preferred form rather than the fallback it allows for tools that cannot tell.
 */
const TWO_SOUND_PREFIXES = ['konjug', 'konjun', 'injek', 'panjev'];

/**
 * Marks a j that is a separate sound, so the digraph pass below cannot swallow
 * it. Mirrors the "#" marker the reference transliterator uses internally.
 */
const SEPARATE_J = '\u0001';

function markSeparateJ(text: string): string {
  let out = text;
  // Case 2. The dictionary spells these with a plain "nj", so only a word list
  // can catch them - the reference implementation carries the same three, and
  // omits "panjev", which the page names explicitly.
  for (const prefix of TWO_SOUND_PREFIXES) {
    out = out.replace(new RegExp(prefix, 'gi'), (match) =>
      match.replace(/j/i, (j) => SEPARATE_J + j),
    );
  }
  // Case 1. A softened consonant before j: the j starts a suffix.
  return out.replace(/([ńĺľŃĹĽ])(j)/g, (_m, consonant: string, j: string) =>
    consonant + SEPARATE_J + j,
  );
}

/**
 * Standard Latin to standard Cyrillic. Generated from the already-folded
 * standard form, because the etymological letters have no Cyrillic equivalents
 * - but the two-sound sequences are marked BEFORE folding, since folding is
 * what destroys the distinction.
 * Digraphs must be replaced before their constituent letters.
 */
const LAT_TO_CYR: [string, string][] = [
  ['dž', 'дж'], ['lj', 'љ'], ['nj', 'њ'],
  ['a', 'а'], ['b', 'б'], ['c', 'ц'], ['č', 'ч'], ['d', 'д'],
  ['e', 'е'], ['ě', 'є'], ['f', 'ф'], ['g', 'г'], ['h', 'х'],
  ['i', 'и'], ['j', 'ј'], ['k', 'к'], ['l', 'л'], ['m', 'м'],
  ['n', 'н'], ['o', 'о'], ['p', 'п'], ['r', 'р'], ['s', 'с'],
  ['š', 'ш'], ['t', 'т'], ['u', 'у'], ['v', 'в'], ['y', 'ы'],
  ['z', 'з'], ['ž', 'ж'],
];

export function toCyrillic(text: string): string {
  let out = toStandard(markSeparateJ(text));
  for (const [lat, cyr] of LAT_TO_CYR) {
    out = out.split(lat).join(cyr);
    const upLat = lat.length > 1 ? lat.charAt(0).toUpperCase() + lat.slice(1) : lat.toUpperCase();
    const upCyr = cyr.length > 1 ? cyr.charAt(0).toUpperCase() + cyr.slice(1) : cyr.toUpperCase();
    out = out.split(upLat).join(upCyr);
  }
  return out.split(SEPARATE_J).join('');
}

export function render(text: string, orth: Orthography): string {
  switch (orth) {
    case 'etymological': return text;
    case 'standard': return toStandard(text);
    case 'simplified': return toSimplified(text);
    case 'cyrillic': return toCyrillic(text);
  }
}
