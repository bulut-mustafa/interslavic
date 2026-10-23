import type { ParsedSentence } from '../../../types/index.ts';
import type { Entry, Lexicon } from '../../../lexicon/src/reader.ts';
import type { FullFormIndex } from '../../../lexicon/src/full-forms.ts';
import type { Orthography } from '../../../morph/src/orthography.ts';
import type { PrepPlan } from '../resolvers/preposition.ts';
import type { GlossedWord, PlanNode, Translation } from '../result.ts';
import type { InsertedForm } from './context.ts';

/** Agreement for a word the source did not contain. */
export interface Agreement {
  person: string;
  number: string;
}

/**
 * What the realise stage reads.
 *
 * It is a long list on purpose: these are the decisions earlier stages made,
 * and naming them is the point of the split. They were closure variables, so
 * nothing stated that realisation depended on them - which is how a rule ended
 * up emitted before an early return that skipped it.
 */
export interface RealiseInput {
  sentence: ParsedSentence;
  lex: Lexicon;
  opts: { validator?: FullFormIndex };
  orth: Orthography;
  plan: PlanNode[];
  dropped: Translation['dropped'];
  punctuation: string;

  prepPlans: Map<number, PrepPlan>;
  insertedPrepositions: Map<number, { form: string; because: string }>;
  pendingPrepositions: Map<number, { form: string; because: string }>;
  prepositionTargets: number[];
  insertedCopulas: Map<number, InsertedForm>;
  pastAuxiliaries: Map<number, InsertedForm>;
  futureForms: Map<number, InsertedForm>;
  imperatives: Map<number, Agreement>;
  /** The optative has no person of its own - see the verbs page. */
  optativeVerbs: Map<number, { number: string }>;
  optativeMarkers: Map<number, number>;
  finitePurposeMarks: Map<number, Agreement>;
  purposeClauses: Map<number, Agreement>;
  needsReflexiveClitic: Set<number>;
  phrasalParticles: Set<number>;
  phrasalVerbs: Map<number, Entry>;
  negatedVerbs: Set<number>;
}

/** The words and surfaces the stage produced, in output order. */
export interface RealiseOutput {
  words: GlossedWord[];
  surfaces: string[];
}
