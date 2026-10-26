import type { Decision, UdToken } from '../../types/index.ts';
import type { Entry } from '../../lexicon/src/reader.ts';
import type { RuleCitation } from '../../rules/src/registry.ts';
import type { AspectOutcome } from './resolvers/aspect.ts';

/**
 * What a translation returns.
 *
 * Its own module so a stage can produce it without importing the pipeline that
 * calls the stage. `pipeline.ts` re-exports these, because the CLI, the server
 * and the web UI all import them from there.
 */

export type { RuleCitation };

export interface GlossedFeature {
  name: string;
  value: string;
  /**
   * The rule that decided this. Carried through to the output because it is
   * the link between a decision and the source that justifies it - without it
   * a reader sees the `because` prose but has no way to ask which rule said so,
   * and no test can check that every rule we emit has a citation.
   */
  ruleId: string;
  because: string;
  confidence: string;
  alternatives: { value: string; because: string }[];
}

export interface GlossedWord {
  surface: string;
  lemma: string;
  sourceForm: string;
  pos: string;
  features: GlossedFeature[];
  aspect?: { chosen: string; because: string; declined: string[] };
  lexicalChoice?: { chosen: string; because: string; rejected: string[] };
  notes: string[];
  validation: 'validated' | 'unvalidated' | 'untranslated';
}

export interface Translation {
  source: string;
  lang: string;
  text: string;
  words: GlossedWord[];
  dropped: { form: string; why: string }[];
  unknown: string[];
  /** Share of emitted words that resolve in the full-form lexicon, or null when
   *  no validator was supplied. This is the project's primary quality metric. */
  validationRate: number | null;
  /**
   * The source behind each rule this translation used, keyed by rule id.
   *
   * Sent with the translation rather than looked up by the reader, and keyed
   * rather than inlined per feature, so a quote appears once however many
   * words it justifies. Only the rules actually used are included - this is
   * the evidence for THIS sentence, not the whole registry.
   */
  citations: Record<string, RuleCitation>;
  /**
   * Expressions in the source that the translator could only render word by
   * word - English idioms and unsourced set phrases (rules/src/idioms.ts).
   */
  warnings?: string[];
}

/** A token after lexeme choice and feature resolution, before realisation. */
export interface PlanNode {
  token: UdToken;
  entry: Entry | null;
  ranked: Entry[];
  aspect: AspectOutcome | null;
  /** Morphological features to request, each with its justification. */
  feats: Map<string, Decision<string>>;
  notes: string[];
}
