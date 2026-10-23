/** Shared vocabulary for the whole pipeline. */

export type Case = 'Nom' | 'Acc' | 'Gen' | 'Dat' | 'Ins' | 'Loc' | 'Voc';
export type Aspect = 'Imp' | 'Perf';
export type Gender = 'Masc' | 'Fem' | 'Neut';
export type NumberFeat = 'Sing' | 'Plur';

/** A Universal Dependencies token, as Stanza emits it. */
export interface UdToken {
  id: number;
  form: string;
  lemma: string;
  upos: string;
  xpos?: string;
  feats: Record<string, string>;
  head: number;
  deprel: string;
}

export interface ParsedSentence {
  text: string;
  lang: 'en' | 'ru';
  tokens: UdToken[];
}

/** Confidence in a decision. Ordered weakest-last. */
export type Confidence = 'certain' | 'high' | 'default' | 'guess';

/**
 * Every feature assignment in the pipeline is wrapped in a Decision, so the
 * gloss panel can always answer "why is this word in this form?".
 * Resolvers must never write a bare value.
 */
export interface Decision<T> {
  value: T;
  ruleId: string;
  confidence: Confidence;
  /** Human-readable justification, rendered from the rule's message template. */
  because: string;
  /** Rejected candidates, shown as alternatives in the UI. */
  alternatives?: { value: T; because: string }[];
}

export const decide = <T>(
  value: T,
  ruleId: string,
  confidence: Confidence,
  because: string,
  alternatives?: { value: T; because: string }[],
): Decision<T> => ({ value, ruleId, confidence, because, ...(alternatives?.length ? { alternatives } : {}) });
