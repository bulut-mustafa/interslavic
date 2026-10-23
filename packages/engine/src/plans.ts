import type { Case, UdToken } from '../../types/index.ts';
import type { PrepPlan } from './resolvers/preposition.ts';

/** Parts of speech that bear a case, so a case resolver has something to say. */
export const CASE_BEARING = new Set(['NOUN', 'PRON', 'PROPN', 'ADJ', 'NUM', 'DET']);

export const isArticle = (t: UdToken): boolean =>
  t.upos === 'DET' && t.feats['PronType'] === 'Art';

/** The preposition chosen for this ADP token, if the planner picked one. */
export function findPlannedPrep(id: number, plans: Map<number, PrepPlan>): string | undefined {
  const p = plans.get(id);
  return p?.kind === 'preposition' ? p.prep : undefined;
}

/** A case the dictionary's own `(+N)` code says this verb governs. */
export interface VerbGovernment {
  case: Case;
  lemma: string;
  code: string;
}
