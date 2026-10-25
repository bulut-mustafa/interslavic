import type { ParsedSentence, UdToken } from '../../../types/index.ts';

export interface NegationPlan {
  /** The source's "not"/"n't" tokens, which `ne` replaces, so they are deleted. */
  negationParticles: Set<number>;
  /** The token `ne` is written before - the modal or copula, not always the verb. */
  negatedVerbs: Set<number>;
  /** Every token in a negated clause, so a dependent can ask whether it is in one. */
  negatedClauses: Set<number>;
}

/**
 * Find what the sentence negates.
 *
 * Runs before the lexeme stage, and that order is the fix for a real bug: `ne`
 * used to be inserted inside the branch that had an entry for the verb, so a
 * verb missing from the dictionary silently lost the negation with it.
 */
export function planNegation(
  sentence: ParsedSentence,
  modalOfHead: Map<number, number>,
): NegationPlan {
  // Interslavic requires `ne` immediately before the verb, AND requires it even
  // when a negative word is already present - negative concord:
  //   "I never eat chocolate"  ->  Ja nikogda NE jem čokoladu
  //   "This bread is not dear" ->  Tutoj hlěb NE jest dragy   (not "jest ne")
  // English carries the negation on a particle or inside "never/nobody", so the
  // particle is deleted and `ne` is emitted in the position Interslavic wants.
  const negationParticles = new Set<number>(); // "not"/"n't" tokens, deleted
  const negatedVerbs = new Set<number>(); // token id of the verb to precede
  /**
   * Clause predicates under negation. Distinct from `negatedVerbs`, which
   * holds whichever token `ne` is emitted before: with a modal that is the
   * modal, and the modal hangs off the clause verb as a child, so walking up
   * from an adverb would never reach it. Negative concord applies to the
   * CLAUSE, so the clause is what has to be recorded.
   */
  const negatedClauses = new Set<number>();

  const copulaOf = (headId: number): UdToken | undefined =>
    sentence.tokens.find((t) => t.head === headId && t.deprel === 'cop');

  if (sentence.lang === 'en') {
    for (const token of sentence.tokens) {
      const isParticle =
        token.upos === 'PART' && (token.feats['Polarity'] === 'Neg' || token.lemma === 'not');
      const isNegativeWord = token.feats['PronType'] === 'Neg';
      if (!isParticle && !isNegativeWord) continue;

      // Negate the copula when the predicate has one, else the head itself.
      let head = sentence.tokens.find((t) => t.id === token.head);
      if (!head) continue;
      /**
       * A negative DETERMINER negates the clause, not the noun it modifies:
       * "No one loves Trump" (`nikto`) negated the noun too, "Ne nikto ne
       * ljubi". The verb above the noun is the one that takes "ne".
       */
      if (token.deprel === 'det') {
        const nominal: UdToken = head;
        head = sentence.tokens.find((t) => t.id === nominal.head);
        if (!head) continue;
      }
      // `ne` goes before the finite verb, which with a modal IS the modal:
      // "Otec ne mogl najdti...", not "Otec mogl ne najdti...".
      const modalId = modalOfHead.get(head.id);
      const modalToken = modalId === undefined
        ? undefined
        : sentence.tokens.find((t) => t.id === modalId);
      const target = modalToken ?? copulaOf(head.id) ?? head;
      negatedVerbs.add(target.id);
      negatedClauses.add(head.id);
      negatedClauses.add(target.id);
      if (isParticle) negationParticles.add(token.id);
    }
  }

  return { negationParticles, negatedVerbs, negatedClauses };
}
