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

/**
 * The languages a sentence can be translated FROM. `sh` is
 * Serbian/Croatian/Bosnian, one system in two scripts.
 */
export const SOURCE_LANGS = ['en', 'ru', 'uk', 'pl', 'sh'] as const;
export type SourceLang = (typeof SOURCE_LANGS)[number];

/**
 * The source languages offered to users. A language is added here only once it
 * reaches Russian's measured quality (docs/verification-log.md); the server
 * refuses the rest and the interface does not list them.
 */
export const ENABLED_LANGS: readonly SourceLang[] = ['en', 'ru'];

export const isSourceLang = (lang: unknown): lang is SourceLang =>
  typeof lang === 'string' && (SOURCE_LANGS as readonly string[]).includes(lang);

export interface ParsedSentence {
  text: string;
  lang: SourceLang;
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
