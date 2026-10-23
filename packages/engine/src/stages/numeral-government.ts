import { decide } from '../../../types/index.ts';
import { governmentFor, numeralValue } from '../../../rules/src/numerals.ts';
import { baseDeprel } from '../tree.ts';
import type { StageContext } from './context.ts';

/**
 * "pet domov" - 5 and up puts the counted noun in the genitive plural.
 *
 * Runs BEFORE agreement propagation so the numeral and any adjective agree
 * with the noun's FINAL features, not its pre-government ones. That ordering
 * is now declared in stages/index.ts rather than implied by position.
 */
export function numeralGovernmentStage(ctx: StageContext): void {
  const { plan, byTokenId, sentence } = ctx;

  for (const node of plan) {
    if (baseDeprel(node.token.deprel) !== 'nummod') continue;
    const head = byTokenId.get(node.token.head);
    if (!head?.entry) continue;

    const value = numeralValue(node.token.lemma, node.token.form, sentence.lang);
    if (value === null) {
      head.notes.push(`numeral "${node.token.form}" not recognised - government not applied`);
      continue;
    }

    const gov = governmentFor(value);
    const ruleId = gov.stated ? 'numeral.government' : 'numeral.government.unstated';
    const confidence = gov.stated ? 'high' : 'guess';
    const because = gov.stated
      ? `${gov.because} - counted by "${node.token.form}"`
      : `${gov.because} - but the grammar does not state how compound numerals like ${value} behave`;

    /**
     * A plurale tantum has no singular for a numeral to impose. The numerals
     * page gives the resulting form outright - "This is also the case for
     * pluralia tantum: jedne dveri 'one door'" - so the noun keeps its plural
     * and the numeral agrees with THAT.
     */
    if (head.entry.pos.numberOnly === 'Plur') {
      head.notes.push(
        `"${head.entry.lemma}" is plural-only, so "${node.token.form}" cannot impose a number ` +
          `on it (the grammar gives "jedne dveri" for "one door")`,
      );
    } else {
      head.feats.set('Number', decide(gov.number, ruleId, confidence, because));
    }

    // Only 5-and-up imposes a case, and only where the noun is in a direct
    // case. The grammar says nothing about oblique positions, so a case that
    // something else already assigned (a preposition, say) is left alone.
    if (gov.case) {
      const current = head.feats.get('Case')?.value;
      /**
       * `nummod:gov` is UD's label for a numeral that GOVERNS the case of its
       * noun, which is exactly when the source's case is an artefact of the
       * source's own numeral syntax rather than a transferable fact. Russian
       * puts "два брата" in the genitive singular; Interslavic uses the
       * nominative plural. Copying the Russian case and then declining to
       * govern it gave "dvě brata".
       */
      const sourceCaseIsNumeralArtefact = node.token.deprel === 'nummod:gov';
      if (current === 'Nom' || current === 'Acc' || sourceCaseIsNumeralArtefact) {
        head.feats.set('Case', decide(gov.case, ruleId, confidence, because));
      } else {
        head.notes.push(
          `numeral case government skipped: "${head.entry.lemma}" is in the ` +
            `${String(current).toLowerCase()}, which the grammar does not cover`,
        );
      }
    }
  }
}
