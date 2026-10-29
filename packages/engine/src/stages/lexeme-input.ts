import type { Case, Decision, ParsedSentence, UdToken } from '../../../types/index.ts';
import type { Entry, Lexicon } from '../../../lexicon/src/reader.ts';
import type { AspectOutcome } from '../resolvers/aspect.ts';
import type { PrepPlan } from '../resolvers/preposition.ts';
import type { AuxiliaryRole } from '../../../rules/src/auxiliaries.ts';
import type { ModalPlan } from '../../../rules/src/modals.ts';
import type { PlanNode, Translation } from '../result.ts';
import type { SourceAdapter } from '../source/adapters.ts';
import type { VerbGovernment } from '../plans.ts';

/** A person/number pair, which is all several of the planning maps carry. */
interface PersonNumber {
  person: string;
  number: string;
}

/**
 * Everything the lexeme stage reads.
 *
 * It is long because the stage is the one every planning stage feeds: each
 * field below is a decision some earlier stage made, and listing them is the
 * point - as closure variables they were invisible, and a stage reading one
 * before it was filled was exactly how the ordering bugs happened.
 */
export interface LexemeInput {
  sentence: ParsedSentence;
  adapter: SourceAdapter;
  lex: Lexicon;

  /** Written to: words deleted, and source words with no entry. */
  dropped: Translation['dropped'];
  unknown: string[];

  // -- Phase 0-: phrasal verbs
  phrasalVerbs: Map<number, Entry>;
  phrasalParticles: Set<number>;

  // -- Phase 0: prepositions
  prepPlans: Map<number, PrepPlan>;
  governedCase: Map<number, Decision<string>>;
  deletedPreps: Set<number>;

  // -- Phase 0b: auxiliaries, future, conditional, imperative, modals, purpose
  droppedAux: Set<number>;
  auxFeatsForHead: Map<number, Record<string, string>>;
  auxRoleForHead: Map<number, AuxiliaryRole>;
  futureForms: Map<number, { form: string; person: string; number: string; conditional?: boolean }>;
  futureAuxToken: Map<number, number>;
  conditionalVerbs: Set<number>;
  purposeClauses: Map<number, PersonNumber>;
  finitePurposeMarks: Map<number, PersonNumber>;
  finitePurposeCarriers: Set<number>;
  imperatives: Map<number, PersonNumber>;
  optativeVerbs: Map<number, { number: string }>;
  modalPlans: Map<number, ModalPlan>;
  modalOfHead: Map<number, number>;
  analyticSuperlatives: Set<number>;

  // -- Phase 0c: negation
  negationParticles: Set<number>;

  // -- Phase 0d: verb government
  verbGovernedCase: Map<number, VerbGovernment>;

  /** The other source words in the sentence, which disambiguate a gloss. */
  contextWords: ReadonlySet<string>;

  /** Grammatical person, read off the subject rather than the auxiliary. */
  personOf: (t: UdToken) => string;
  /** Whether a possessive's possessor is its clause's subject, for `svoj`. */
  possessorIsSubject: (t: UdToken) => boolean;
  /** Whether this token sits under a negated verb. */
  inNegatedClause: (t: UdToken) => boolean;
  /** Whether this token is conjugated, so it needs verb features resolved. */
  needsVerbFeatures: (t: UdToken) => boolean;
  /** This token's ranked dictionary candidates. */
  rankedFor: (t: UdToken, aspect: AspectOutcome | null) => Entry[];
  /** The source word this token is looked up by in the dictionary. */
  lookupLemmaOf: (t: UdToken) => string;
}
