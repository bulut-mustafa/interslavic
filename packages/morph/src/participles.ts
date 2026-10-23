import { derive } from '@interslavic/morphology';

/**
 * The past passive participle, for translating an English passive.
 *
 * "Which woman is loved by that man?" came out as "Koja žena běše ljubila od
 * strany togo muža?" - the literary imperfect of "to be", the ACTIVE
 * l-participle, and a prepositional phrase meaning "on the part of". The
 * syntax page's own answer is:
 *
 *   "Koja žena jest ljubjena od togo muža?"
 *
 * and it states the agent rule outright:
 *
 *   "The agent in passive construction is either in the instrumental case or
 *    preceded by the preposition od with the genitive."
 *
 * Source: http://steen.free.fr/interslavic/syntax.html
 *
 * The page also warns that the participial passive "sounds clumsy to those
 * Slavs who are not accustomed to using the verb 'to be' very often", and
 * prefers an active or reflexive construction - but it calls the participial
 * form "grammatically completely correct", and it is the one construction that
 * preserves what an English passive actually says, including an agentless one
 * where there is no subject to promote.
 *
 * The participle declines like an adjective, so the result is a lemma that
 * still has to agree with the subject.
 */
export function pastPassiveParticiple(lemma: string, xpos: string): string | null {
  let tokens;
  try {
    tokens = derive({ form: lemma, xpos } as never) as { form: string; xpos?: string }[];
  } catch {
    return null;
  }
  if (!Array.isArray(tokens)) return null;

  // `pfpp` is the library's tag for the past passive participle; `prpp` is the
  // present one ("dělajemy"), which is a different construction.
  return tokens.find((t) => t.xpos?.includes('pfpp'))?.form ?? null;
}
