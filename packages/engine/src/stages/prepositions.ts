import { decide, type Decision, type ParsedSentence, type UdToken } from '../../../types/index.ts';
import type { Entry, Lexicon } from '../../../lexicon/src/reader.ts';
import { planPreposition, type PrepPlan } from '../resolvers/preposition.ts';
import { prepCaseFor } from '../../../rules/src/pronouns.ts';
import { conjunctsOf } from '../tree.ts';

export interface PrepositionPlan {
  /** Keyed by the ADP token id: which Interslavic preposition, or deletion. */
  prepPlans: Map<number, PrepPlan>;
  /** Keyed by the HEAD nominal's id: the case its preposition governs. */
  governedCase: Map<number, Decision<string>>;
  /** ADP tokens the plan deletes, because Interslavic marks it by case alone. */
  deletedPreps: Set<number>;
}

/**
 * Plan every prepositional phrase.
 *
 * Must run before noun case resolution, because a preposition's government
 * outranks every deprel default.
 */
export function planPrepositions(
  sentence: ParsedSentence,
  lex: Lexicon,
  phrasalVerbs: Map<number, Entry>,
  phrasalObjects: Set<number>,
  phrasalParticles: Set<number>,
): PrepositionPlan {
  // Must run before noun case resolution, because a preposition's government
  // outranks every deprel default.
  const prepPlans = new Map<number, PrepPlan>(); // keyed by the ADP token id
  const governedCase = new Map<number, Decision<string>>(); // keyed by HEAD noun id
  const deletedPreps = new Set<number>();

  /**
   * A complement whose English preposition was consumed by a phrasal verb is
   * now that verb's direct object: "look after my brother" is `prigledati` +
   * an accusative, and leaving the noun as a bare `obl` gave the nominative
   * "prigledaju svoj brat". The verb's own government code wins where it has
   * one, exactly as for an ordinary object.
   */
  for (const id of phrasalObjects) {
    const noun = sentence.tokens.find((t) => t.id === id);
    const entry = noun ? phrasalVerbs.get(noun.head) : undefined;
    if (!noun || !entry) continue;
    const governs = entry.addition.governs;
    governedCase.set(
      id,
      decide<string>(
        governs ?? 'Acc',
        'case.phrasalObject',
        governs ? 'high' : 'default',
        governs
          ? `"${entry.lemma}" governs this case lexically - the dictionary marks it (+${governs})`
          : `the complement of the phrasal verb "${entry.lemma}", which takes a direct object`,
      ),
    );
  }


  for (const token of sentence.tokens) {
    // The possessive clitic is tagged PART, not ADP, but it is a `case` marker
    // in exactly the same way - see CASE_MARKER_PREPOSITIONS.
    const isCaseMarker = token.deprel === 'case' && (token.upos === 'ADP' || token.upos === 'PART');
    if (!isCaseMarker) continue;
    // Consumed by a phrasal verb: the meaning is in the verb's own lemma.
    if (phrasalParticles.has(token.id)) continue;
    const p = sentence.lang === 'en' ? planPreposition(token, sentence) : { kind: 'unknown' as const };
    prepPlans.set(token.id, p);
    if (p.kind === 'caseMarker') {
      deletedPreps.add(token.id);
      governedCase.set(token.head, p.case as Decision<string>);
    } else if (p.kind === 'preposition') {
      governedCase.set(token.head, p.case as Decision<string>);
    }
    // The government reaches every conjunct, but the preposition itself is
    // emitted once, so only the CASE below is propagated.
    if (p.kind === 'caseMarker' || p.kind === 'preposition') {
      for (const id of conjunctsOf(token.head, sentence)) {
        governedCase.set(id, p.case as Decision<string>);
      }
    }
  }

  return { prepPlans, governedCase, deletedPreps };
}
