/**
 * Female equivalents of male person nouns, from the word-formation page:
 *
 *   "The female equivalent of the endings -nik and -ec is -nica and -ica
 *    respectively: rada 'council' > radnik 'counsellor' > radnica 'female
 *    counsellor'; Albanec 'Albanian' > Albanica 'Albanian woman'.
 *    In other cases, we rather use the ending -ka for female equivalents of
 *    male persons: prijatelj 'friend' > prijateljka 'girl friend',
 *    gradžanin 'citizen', gradžanka 'female citizen'."
 *
 * and the consonant change that the same page applies before -ka:
 *
 *   "if the stem ends in a particular consonant, it is changed before the
 *    suffixes -ji, -ka, -ko, -nik, -ny, -ok, -sky and -stvo, as follows:
 *    k/c > č, g > ž, h > š"
 *
 * Source: http://steen.free.fr/interslavic/word_formation.html
 *
 * Why the translator needs this: the page calls these forms the *female
 * equivalent* of a male person noun, which makes the masculine the base and the
 * feminine the marked member. English "doctor" and "teacher" mark no gender, so
 * the base is what they should select - but `lěkaŕka` ("doctor", f.) and
 * `učiteljka` ("teacher", f.) compete for the same gloss on equal terms and can
 * win on frequency alone.
 *
 * The test is deliberately narrow: the feminine must be *derivable from a
 * candidate that is actually present*. A blanket "prefer masculine over
 * feminine" would be badly wrong - it would turn "snake" into `gad` instead of
 * `zmija`, "head" into `načeľnik` instead of `glåva`, and "beauty" into
 * `krasavėc` instead of `krasa`.
 */

const CONSONANT_CHANGE: Record<string, string> = { k: 'č', c: 'č', g: 'ž', h: 'š' };

/** Every female equivalent the page's rules derive from a male person noun. */
export function femaleEquivalentsOf(masculine: string): Set<string> {
  const forms = new Set<string>();
  if (!masculine) return forms;

  if (masculine.endsWith('nik')) forms.add(`${masculine.slice(0, -3)}nica`);
  if (masculine.endsWith('ec')) forms.add(`${masculine.slice(0, -2)}ica`);
  // gradžanin > gradžanka: the -in- goes, as it does in the plural.
  if (masculine.endsWith('anin')) forms.add(`${masculine.slice(0, -2)}ka`);

  forms.add(`${masculine}ka`);
  const last = masculine.at(-1) ?? '';
  const changed = CONSONANT_CHANGE[last];
  if (changed) forms.add(`${masculine.slice(0, -1)}${changed}ka`);

  return forms;
}

/**
 * True when `feminine` is the derived female equivalent of `masculine`.
 */
export function isFemaleEquivalent(feminine: string, masculine: string): boolean {
  return femaleEquivalentsOf(masculine).has(feminine);
}
