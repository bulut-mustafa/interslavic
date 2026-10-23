import type { ParsedSentence } from '../../../types/index.ts';
import type { Lexicon } from '../../../lexicon/src/reader.ts';
import type { PlanNode } from '../result.ts';
import type { SourceAdapter } from '../source/adapters.ts';

/**
 * The state stages share.
 *
 * It exists to make the dependencies between stages VISIBLE. They were 20-odd
 * closure variables in one 3,000-line function, so the only way to know what a
 * rule depended on - or that it had to run before another - was to read the
 * whole thing. Eight bugs in a single session came from exactly that: a rule
 * placed after an early return that skipped it, or reading a value another
 * stage had not written yet.
 *
 * It grows as stages are extracted; every field is something at least two
 * stages touch, or something a stage writes for a later one to read.
 */
export interface StageContext {
  readonly sentence: ParsedSentence;
  readonly adapter: SourceAdapter;
  readonly lex: Lexicon;
  /** Tokens after lexeme choice, in output order. Stages mutate their feats. */
  readonly plan: PlanNode[];
  /** `plan` indexed by source token id, for head lookups. */
  readonly byTokenId: Map<number, PlanNode>;

  /** An inserted word, keyed by the token it is emitted BEFORE. */
  readonly insertedCopulas: Map<number, InsertedForm>;
  /** byti + l-participle, keyed by the verb that needs the auxiliary. */
  readonly pastAuxiliaries: Map<number, InsertedForm>;
  /** Verbs already carrying a conditional, so the past auxiliary is not added too. */
  readonly conditionalVerbs: Set<number>;
}

/** A form the source did not contain, with the agreement it was built from. */
export interface InsertedForm {
  form: string;
  person: string;
  number: string;
}
