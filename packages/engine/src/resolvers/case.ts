import { decide, type Case, type Decision, type ParsedSentence, type UdToken } from '../../../types/index.ts';
import { isTimeUnit } from '../../../rules/src/verb-prepositions.ts';
import type { Case as CaseT } from '../../../types/index.ts';

/**
 * Case assignment, as an ordered cascade - first match wins. Each rule records
 * why it fired and what it rejected.
 *
 * Reliability is deliberately NOT uniform, and the confidence levels say so:
 * nsubj->Nom and iobj->Dat are safe; obj->Acc is only a default, because plenty
 * of verbs govern genitive or instrumental instead and we have no governance
 * entry for them yet. Visible wrongness beats invisible wrongness.
 */

export interface CaseContext {
  token: UdToken;
  sentence: ParsedSentence;
  /** Case governed by a preposition attached to this token, if any. */
  prepositionGoverns?: CaseT;
  /** Case this token's governing verb demands, if we have a frame for it. */
  verbGoverns?: CaseT;
  /**
   * Which verb demands it, and the dictionary code that says so, so the gloss
   * can cite its evidence instead of asserting "this verb governs that case".
   */
  verbGovernedBy?: { lemma: string; code: string };
  /** True when the source language marks case explicitly (e.g. Russian). */
  copyFromSource?: boolean;
}

export type CaseRule = (ctx: CaseContext) => Decision<Case> | null;

const VALID_CASES = new Set<string>(['Nom', 'Acc', 'Gen', 'Dat', 'Ins', 'Loc', 'Voc']);

/**
 * When the source marks case, copy it. This is why Russian input is cheaper
 * than English: the hardest inference is already done upstream.
 */
const fromSource: CaseRule = ({ token, copyFromSource }) => {
  if (!copyFromSource) return null;
  /**
   * An INDECLINABLE source noun states a case it cannot possibly know. Russian
   * кино, метро, такси, радио, пальто, кафе, меню have one form for all seven
   * cases, so there is nothing in the word for the parser to read, and it
   * falls back to a guess. UD marks exactly this with `InflClass=Ind`.
   *
   * Stanza guesses wrong on the one example we can check against van
   * Steenbergen: "идти в кино" is motion into, so the accusative, but it tags
   * кино `Case=Loc`, which gave "idti v kinu" for an attested "idti v kino".
   *
   * Refusing the copy is not a loss of information - there was none. The
   * cascade below then reaches the preposition's own government, where a
   * motion verb with a two-case preposition already selects the accusative,
   * and that rule cites the grammar directly.
   */
  if (token.feats['InflClass'] === 'Ind') return null;
  const c = token.feats['Case'];
  if (!c || !VALID_CASES.has(c)) return null;
  return decide<Case>(
    c as Case,
    'case.copy',
    'certain',
    'copied from the source, which marks case explicitly',
  );
};

const byPreposition: CaseRule = ({ prepositionGoverns }) =>
  prepositionGoverns
    ? decide<Case>(prepositionGoverns, 'case.prep.governed', 'certain', 'governed by its preposition')
    : null;

const byVerbGovernance: CaseRule = ({ verbGoverns, verbGovernedBy }) =>
  verbGoverns
    ? decide<Case>(
        verbGoverns,
        'case.verb.governed',
        'high',
        verbGovernedBy
          ? `"${verbGovernedBy.lemma}" governs this case lexically - the dictionary marks it ${verbGovernedBy.code}`
          : 'this verb governs that case lexically',
      )
    : null;

/**
 * A bare adverbial of time is in the ACCUSATIVE - "every day", "every week",
 * "all night". With no preposition to govern it, this reached the fallback and
 * came back nominative at `guess`:
 *
 *   "I read every night"  ->  Ja čitaju každa noč   (should be "každu noč")
 *
 * `denj` hid the bug, because a masculine inanimate accusative is identical to
 * the nominative - the error only shows on a feminine noun.
 *
 * The grammar pages have no section on case usage, so this is settled by
 * attested usage, where the accusative is unambiguous:
 *
 *   "amerikansky prezident načal KAŽDU SEDMICU posylati radio soobčenje"
 *   (accusative feminine)        https://incubator.wikimedia.org/wiki/Wp/isv
 *   "ktore my prohodimȯ vśaky denj"
 *   http://steen.free.fr/interslavic/selo.html
 *
 * This is the same accusative that `case.durationAccusative` gives a "for"
 * phrase; here there is no preposition to delete in the first place.
 */
const byTemporalAdverbial: CaseRule = ({ token }) => {
  if (!token.deprel.startsWith('obl')) return null;
  if (!isTimeUnit(token.lemma)) return null;
  /**
   * No check for a preposition of its own is needed: this rule sits AFTER
   * byPreposition in the cascade, so "in a week" and "after three days" have
   * already been decided by the preposition that governs them.
   */
  return decide<Case>(
    'Acc',
    'case.temporalAccusative',
    'high',
    'an adverbial of time takes the accusative with no preposition',
  );
};

const byDeprel: CaseRule = ({ token, sentence }) => {
  const head = sentence.tokens.find((t) => t.id === token.head);
  const headForm = head?.form ?? 'the verb';

  switch (token.deprel) {
    case 'nsubj':
    case 'nsubj:pass':
      return decide<Case>('Nom', 'case.deprel.nsubj', 'certain', 'subject (nsubj)');
    case 'iobj':
      return decide<Case>('Dat', 'case.deprel.iobj', 'certain', `indirect object (iobj) of "${headForm}"`);
    case 'obj':
      return decide<Case>(
        'Acc',
        'case.deprel.obj',
        'default',
        `direct object of "${headForm}" - default, no governance entry for this verb`,
        [
          { value: 'Gen', because: 'some verbs govern the genitive' },
          { value: 'Ins', because: 'some verbs govern the instrumental' },
        ],
      );
    default:
      return null;
  }
};

/**
 * A conjunct shares its head's grammatical role. UD attaches "cat" in "I see a
 * dog and a cat" to "dog" with `conj`, and both are objects of "see" - so this
 * is not a new Interslavic rule, it is the head's own decision re-used, and it
 * keeps the head's confidence rather than inventing one.
 *
 * Without it `conj` reached the fallback and produced the nominative:
 *   "I see a dog and a cat."  ->  Ja vidžu psa i kot    (kot should be kota)
 *
 * Coordination of three or more attaches every conjunct to the FIRST one, but
 * the walk is still bounded, because a malformed tree must not loop.
 */
const byCoordination: CaseRule = ({ token, sentence }) => {
  if (token.deprel !== 'conj') return null;
  let head = sentence.tokens.find((t) => t.id === token.head);
  for (let hops = 0; head?.deprel === 'conj' && hops < 8; hops++) {
    head = sentence.tokens.find((t) => t.id === head!.head);
  }
  if (!head || head.id === token.id) return null;

  const inherited = byDeprel({ token: head, sentence });
  if (!inherited) return null;
  return decide<Case>(
    inherited.value,
    'case.coordination',
    inherited.confidence,
    `coordinated with "${head.form}": ${inherited.because}`,
    inherited.alternatives,
  );
};

/** amod/det/nummod copy their head's case; the chain is shown in the gloss. */
export const AGREEING_DEPRELS = new Set([
  'amod',
  'det',
  'det:poss',
  'nummod',
  'appos',
  // UD attaches English possessives ("my brother") as nmod:poss, so without
  // this a possessive never agreed and came out in its default form (moja brat).
  'nmod:poss',
]);

const CASE_CASCADE: CaseRule[] = [
  fromSource,
  byPreposition,
  byVerbGovernance,
  byCoordination,
  byTemporalAdverbial,
  byDeprel,
];

export function resolveCase(ctx: CaseContext, cascade = CASE_CASCADE): Decision<Case> {
  for (const rule of cascade) {
    const d = rule(ctx);
    if (d) return d;
  }
  return decide<Case>(
    'Nom',
    'case.fallback',
    'guess',
    `no rule matched the relation "${ctx.token.deprel}" - falling back to nominative`,
  );
}
