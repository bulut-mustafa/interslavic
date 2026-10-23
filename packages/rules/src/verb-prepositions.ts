import type { Case } from '../../types/index.ts';

/**
 * Prepositions chosen by the VERB rather than by the English preposition, and
 * time spans that take no preposition at all.
 *
 * English "for" was always realised as `dlja`, the frequency leader among the
 * dictionary's "for" senses. That is the benefactive "for", and it is the only
 * sense van Steenbergen ever uses it in - every occurrence across his own
 * translated prose takes a person or a beneficiary:
 *
 *   "Nyně ty jesi dlja mene samo někoj maly hlapčik"          (Maly princ)
 *   "mųž, gospodaŕ, bere tvojų vȯlnų, da by iměl dlja sebe"   (Schleicher)
 *   "ne nahodžu ničto do jedenja dlja ženy i dětij"           (Volk i pes)
 *   http://steen.free.fr/interslavic/maly_princ.html and siblings
 *
 * and the prepositions page glosses it plainly "dlja - for", listing no
 * temporal sense for it or for any other preposition:
 * http://steen.free.fr/interslavic/prepositions.html
 *
 * So "wait for the train" and "for ten years" were both getting a benefactive
 * reading: "My čekajemo dlja pojezda" is "we are waiting on the train's
 * behalf".
 *
 * The grammar pages do not cover either construction - there is no page on case
 * usage - so both rules below are settled by attested usage, which is the next
 * tier down and is cited per entry.
 */

/**
 * English nouns that name a unit of time. A source-side lexical fact about
 * English, not a claim about Interslavic: these are the nouns that make an
 * English "for"-phrase a span rather than a beneficiary.
 */
const TIME_UNITS = new Set([
  'second', 'minute', 'hour', 'day', 'night', 'week', 'fortnight',
  'month', 'year', 'decade', 'century', 'millennium',
  'moment', 'while', 'time', 'age',
]);

export function isTimeUnit(englishNounLemma: string): boolean {
  return TIME_UNITS.has(englishNounLemma.toLowerCase());
}

/**
 * How a verb governs its complement when English uses a preposition.
 *
 * `direct` deletes the preposition and leaves a bare case; `preposition`
 * replaces it with the Interslavic one the verb actually takes.
 */
export type VerbGovernedPhrase = {
  prep: string | null;
  case: Case;
  why: string;
  evidence: string;
};

/**
 * Keyed by the English verb lemma and the English preposition lemma.
 *
 * Every entry is attested in the Interslavic Wikipedia (incubator.wikimedia.org
 * /wiki/Wp/isv), which is the largest body of Interslavic prose there is and is
 * written and copy-edited by the language's own community, van Steenbergen
 * included. An entry is only added where the corpus agrees with itself; where
 * it is silent or split, the preposition is left to frequency ranking and the
 * output stays visibly uncertain rather than confidently wrong.
 */
const GOVERNED: Record<string, VerbGovernedPhrase> = {
  'wait|for': {
    prep: 'na',
    case: 'Acc',
    why: '"čekati" is marked v.intr. in the dictionary, so its complement needs a preposition, and the corpus uses "na" with the accusative',
    evidence: '"on rěšil ostati i čekati na njego" - Wp/isv/Džok (pes)',
  },
  'believe|in': {
    prep: 'v',
    case: 'Acc',
    why: '"v" with the ACCUSATIVE, not the locative: belief is not a location, and the locative is for a stable place',
    evidence: '"člověk može ne věriti v Boga" - Wp/isv/Hinduizm; "prodolžajut věriti v reinkarnaciju" - Wp/isv/Reinkarnacija',
  },
  'depend|on': {
    prep: 'od',
    case: 'Gen',
    why: 'English "on" would give "na", but the verb governs "od" with the genitive',
    evidence: '24 occurrences of "zavisi od" in Wp/isv, e.g. "Obračanje děje se razno i zavisi od konkretnogo mita"',
  },
};

export function verbGovernedPhrase(
  verbLemma: string,
  prepositionLemma: string,
): VerbGovernedPhrase | null {
  return GOVERNED[`${verbLemma.toLowerCase()}|${prepositionLemma.toLowerCase()}`] ?? null;
}

/** The verb/preposition pairs the table covers, for tests. */
export const GOVERNED_PAIRS = Object.keys(GOVERNED);
