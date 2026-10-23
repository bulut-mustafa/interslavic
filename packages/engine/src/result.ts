import type { Decision, UdToken } from '../../types/index.ts';
import type { Entry } from '../../lexicon/src/reader.ts';
import type { AspectOutcome } from './resolvers/aspect.ts';

/**
 * What a translation returns.
 *
 * Its own module so a stage can produce it without importing the pipeline that
 * calls the stage. `pipeline.ts` re-exports these, because the CLI, the server
 * and the web UI all import them from there.
 */

export interface GlossedFeature {
  name: string;
  value: string;
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
