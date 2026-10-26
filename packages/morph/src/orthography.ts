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

/**
 * A Russian name in Latin letters, by the pages' own tables, or null where
 * they do not cover a letter - such a name is left as it was rather than
 * guessed.
 *
 * - The letters Russian shares with standard Interslavic Cyrillic map as
 *   LAT_TO_CYR does (orthography page).
 * - The rest come from the flavourisation page's East Slavic row, which writes
 *   standard ја ју јо је ји љ њ ы as я ю йо/ьо (й)е/ье и/ьи ль нь ы
 *   (http://steen.free.fr/interslavic/flavorizacija.html), plus "šč ... can
 *   also be written щ".
 * - "(й)е" is je; read so where Russian writes it - at the start or after a
 *   vowel - and e (the shared letter) after a consonant.
 * - Not covered, so the name stays: э, ъ, and ь anywhere but in ль нь or before
 *   a vowel (ьо ье ьи are jo je ji; ья ью ьё are ja ju jo, the vowel carrying the j).
 */
const RU_LETTERS: Record<string, string> = Object.fromEntries([
  ...LAT_TO_CYR.filter(([lat]) => lat.length === 1 && lat !== 'j' && lat !== 'ě' && lat !== 'y' && lat !== 'e')
    .map(([lat, cyr]) => [cyr, lat]),
  ['й', 'j'], ['я', 'ja'], ['ю', 'ju'], ['ё', 'jo'], ['ы', 'y'], ['щ', 'šč'],
]);
const RU_VOWELS = new Set([...'аеёиоуыэюя']);

export function russianNameToLatin(word: string): string | null {
  const lower = word.toLowerCase();
  let out = '';
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i]!;
    const next = lower[i + 1];
    const afterSoft = lower[i + 2];
    // ль/нь, unless the soft sign is the j of a following vowel ("Наталья").
    if ((c === 'л' || c === 'н') && next === 'ь' && !(afterSoft && RU_VOWELS.has(afterSoft))) {
      out += c === 'л' ? 'lj' : 'nj'; i++; continue;
    }
    // ьо ье ьи are jo je ji; before я ю ё the vowel already carries the j.
    if (c === 'ь' && next && RU_VOWELS.has(next)) {
      out += next === 'о' ? 'jo' : next === 'е' ? 'je' : next === 'и' ? 'ji' : RU_LETTERS[next] ?? '';
      if (!'оеияюё'.includes(next)) return null;
      i++; continue;
    }
    if (c === 'е') { out += i === 0 || RU_VOWELS.has(lower[i - 1]!) ? 'je' : 'e'; continue; }
    const latin = RU_LETTERS[c];
    if (latin === undefined) return null;
    out += latin;
  }
  return word[0] === word[0]!.toUpperCase() && word[0] !== word[0]!.toLowerCase()
    ? out.charAt(0).toUpperCase() + out.slice(1)
    : out;
}

export function render(text: string, orth: Orthography): string {
  switch (orth) {
    case 'etymological': return text;
    case 'standard': return toStandard(text);
    case 'simplified': return toSimplified(text);
    case 'cyrillic': return toCyrillic(text);
  }
}

/**
 * A Ukrainian name in Interslavic Latin, as `russianNameToLatin` does for
 * Russian. Ukrainian spells differently, so the letters differ: и is y and і
 * is i, г is h and ґ is g, є is je, ї is ji, е is always e (the iotated sound
 * is written є), and the apostrophe marks a j before я ю є ї ("Мар'яна" ->
 * Marjana). ль нь are lj nj; any other soft sign is dropped, as Interslavic
 * has no letter for it. Anything else unknown keeps the name as written.
 */
const UK_LETTERS: Record<string, string> = Object.fromEntries([
  ...LAT_TO_CYR.filter(([lat]) => lat.length === 1 && !'jěyeghi'.includes(lat)).map(([lat, cyr]) => [cyr, lat]),
  ['а', 'a'], ['е', 'e'], ['и', 'y'], ['і', 'i'], ['ї', 'ji'], ['є', 'je'], ['г', 'h'], ['ґ', 'g'],
  ['й', 'j'], ['я', 'ja'], ['ю', 'ju'], ['щ', 'šč'], ['х', 'h'],
]);
const UK_APOSTROPHES = new Set(["'", '’', 'ʼ']);

export function ukrainianNameToLatin(word: string): string | null {
  const lower = word.toLowerCase();
  let out = '';
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i]!;
    const next = lower[i + 1];
    if ((c === 'л' || c === 'н') && next === 'ь') { out += c === 'л' ? 'lj' : 'nj'; i++; continue; }
    if (c === 'ь') continue;
    // The apostrophe only separates; the following я/ю/є/ї already carry the j.
    if (UK_APOSTROPHES.has(c)) continue;
    const latin = UK_LETTERS[c];
    if (latin === undefined) return null;
    out += latin;
  }
  return word[0] === word[0]!.toUpperCase() && word[0] !== word[0]!.toLowerCase()
    ? out.charAt(0).toUpperCase() + out.slice(1)
    : out;
}
