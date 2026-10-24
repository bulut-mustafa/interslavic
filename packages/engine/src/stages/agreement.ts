import { decide } from '../../../types/index.ts';
import { AGREEING_DEPRELS } from '../resolvers/case.ts';
import { baseDeprel } from '../tree.ts';
import type { StageContext } from './context.ts';

/**
 * Agreement propagation, plus the default animacy an accusative needs when it
 * agrees with no masculine animate noun.
 *
 * Must run AFTER numeral government, so a numeral and any adjective agree with
 * the noun's final features rather than its pre-government ones.
 */
export function agreementStage(ctx: StageContext): void {
  const { plan, byTokenId } = ctx;

  // Adjectives and determiners take case, gender, number AND animacy from the
  // noun they modify. Animacy matters because masculine animate accusative is
  // syncretic with the genitive (novogo vs novy), and that one rule shows up in
  // nouns, adjectives and numerals alike.
  for (const node of plan) {
    if (
      !AGREEING_DEPRELS.has(node.token.deprel) &&
      !AGREEING_DEPRELS.has(baseDeprel(node.token.deprel))
    ) {
      continue;
    }
    /**
     * `nmod:poss` covers two different things, and only one of them agrees.
     * A PRONOMINAL possessive is a determiner and agrees with the noun it
     * modifies ("moja kniga"); a NOMINAL possessor is a genitive and does not
     * ("kniga mojego brata"). Agreeing both made "the boy's dog" into "Hlapec
     * pes" - a nominative possessor - and overwrote the genitive the
     * possessive clitic had already supplied.
     */
    if (
      node.token.deprel === 'nmod:poss' &&
      (node.token.upos === 'NOUN' || node.token.upos === 'PROPN')
    ) {
      continue;
    }
    const head = byTokenId.get(node.token.head);
    if (!head?.entry) continue;

    for (const f of ['Case', 'Gender', 'Number', 'Animacy'] as const) {
      const hv = head.feats.get(f);
      if (!hv) continue;
      // A placeholder "one" is not emitted, so its modifier is the only place
      // its decision can show: "stands for kniga", or the stated default when
      // the sentence names no noun.
      if (hv.ruleId === 'anaphora.one') {
        node.feats.set(f, hv);
        continue;
      }
      node.feats.set(
        f,
        decide(
          hv.value,
          'agreement.fromHead',
          'certain',
          `agrees with "${head.entry.lemma}" (${f} = ${hv.value})`,
        ),
      );
    }
  }

  /**
   * An accusative that agrees with no masculine animate noun takes the plain
   * form. The adjectives page states the condition explicitly:
   *
   *   "Just like in the case of nouns, the accusative of has the same form as
   *    the genitive when the CORRESPONDING NOUN is masculine and animate, both
   *    singular and plural."
   *   http://steen.free.fr/interslavic/adjectives.html
   *
   * So the genitive-like accusative is licensed by an animate noun, and where
   * there is none the plain form is required, not merely likelier. Animacy is
   * unset here in three ways: the word modifies nothing (the language name in
   * "Do you speak Interslavic?" is tagged PROPN but its entry is the ADJECTIVE
   * "medzuslovjansky", so no lexical animacy ever reaches it and the paradigm
   * gave the animate "medzuslovjanskogo"), its head noun is not in the
   * dictionary ("the Blargistan that I saw" -> "ktorogo"), or its antecedent
   * is a pronoun. A masculine noun is unaffected, because it always takes
   * animacy from the dictionary before this runs.
   */
  for (const node of plan) {
    if (node.feats.get('Case')?.value !== 'Acc') continue;
    if (node.feats.has('Animacy')) continue;
    node.feats.set(
      'Animacy',
      decide('Inan', 'animacy.noAnimateHead', 'high',
        'the accusative equals the genitive only when the corresponding noun is masculine animate, and there is no such noun here'),
    );
  }
}
