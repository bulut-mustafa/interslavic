import fs from 'node:fs';
import path from 'node:path';

/**
 * Where every rule the engine emits comes from.
 *
 * The project's claim is that a learner can ask "why is this word in this
 * form?" and get an answer that traces to a source. That only holds if no rule
 * can be added without one, which is a test rather than a habit: the engine's
 * emitted `ruleId`s are collected and checked against this registry.
 *
 * The tiers are not decoration. `normative` is the only one that may be cited
 * as authority for a claim about Interslavic; `corpus` exists because the
 * grammar pages have no page on case usage at all; and `transfer` and
 * `structural` mark rules that assert nothing about Interslavic and therefore
 * need no citation - saying so explicitly is what stops a missing citation
 * hiding among them.
 */
export type RuleTier = 'normative' | 'corpus' | 'dictionary' | 'transfer' | 'structural';

export interface RuleCitation {
  tier: RuleTier;
  /** URL or repository path. Required for every tier but `structural`. */
  source: string | null;
  /** Verbatim, where the source states the rule in a sentence. */
  quote: string | null;
  why: string;
}

const DATA = path.resolve(import.meta.dirname, '../data/rule-registry.json');

let cache: Map<string, RuleCitation> | null = null;

export function ruleRegistry(): Map<string, RuleCitation> {
  if (cache) return cache;
  const raw = JSON.parse(fs.readFileSync(DATA, 'utf8')) as { rules: Record<string, RuleCitation> };
  cache = new Map(Object.entries(raw.rules));
  return cache;
}

/** The citation for a rule, or null when the registry does not know it. */
export function citationFor(ruleId: string): RuleCitation | null {
  return ruleRegistry().get(ruleId) ?? null;
}
