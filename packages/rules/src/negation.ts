/**
 * Negative concord on indefinites.
 *
 * The syntax page is explicit that Interslavic negates everything negatable:
 *
 *   "This particle is also used in conjunction with other words used for
 *    expressing negation, such as nikogda 'never', nikto 'nobody', nikde
 *    'nowhere', etc. [...] Unlike in English, all negatable words are being
 *    negated in Interslavic, for example: Ja uže nikogda ne budu čitati
 *    nijednu knigu!"
 *
 * English does the opposite: it switches to the *any* series under negation
 * ("couldn't find them anywhere"). Translated word by word that produced
 * `kde-nebud` - a positive-polarity indefinite - standing next to `ne`, which
 * is exactly the construction the page rules out.
 *
 * The correlatives table pairs the series systematically, so this is a
 * morphological swap rather than a list of English words:
 *
 *   kde-nebud / někde / kdekoli  ->  nikde     (where)
 *   kto-nebud / někto            ->  nikto     (who)
 *   čto-nebud / něčto            ->  ničto     (what)
 *   kogda-nebud / někogda        ->  nikogda   (when)
 *   kaky-nebud / někaky          ->  nikaky    (what kind of)
 *   čij-nebud / něčij            ->  ničij     (whose)
 *
 * Sources: http://steen.free.fr/interslavic/syntax.html
 *          http://steen.free.fr/interslavic/pronouns.html (correlatives)
 */

/**
 * The indefinite markers, in the ETYMOLOGICAL spelling the dictionary stores:
 * the lemma is `čto-nebųď`, not the standard-orthography `čto-nebud`, so
 * matching the folded form finds nothing.
 */
const INDEFINITE_SUFFIXES = ['-nebųď', '-nebud', '-libo', 'koli'];
const INDEFINITE_PREFIX = 'ně';

/**
 * Candidate negative counterparts of an indefinite correlative, in order of
 * preference. Empty when the lemma is not an indefinite.
 *
 * Returns candidates rather than an answer because the caller MUST check them
 * against the dictionary: the correlative table is systematic but the
 * dictionary is not complete, and a derived form is no licence to emit a word
 * that does not exist. Both the etymological stem and its standard-orthography
 * fold are offered, since the negative entry may be spelled either way.
 */
export function negativeCounterparts(lemma: string, fold: (s: string) => string): string[] {
  let stem: string | null = null;
  for (const suffix of INDEFINITE_SUFFIXES) {
    if (lemma.endsWith(suffix)) {
      stem = lemma.slice(0, -suffix.length);
      break;
    }
  }
  if (stem === null && lemma.startsWith(INDEFINITE_PREFIX)) {
    stem = lemma.slice(INDEFINITE_PREFIX.length);
  }

  // "poněkde" and friends belong to a different series and must not be
  // rewritten, and a bare "koli" leaves no stem at all.
  if (!stem) return [];

  return [...new Set([`ni${stem}`, `ni${fold(stem)}`])];
}
