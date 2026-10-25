import { decide } from '../../../types/index.ts';
import { AGREEING_DEPRELS } from '../resolvers/case.ts';
import { baseDeprel } from '../tree.ts';
import type { StageContext } from './context.ts';
import { paradigm } from '../../../morph/src/realize.ts';
import type { Entry } from '../../../lexicon/src/reader.ts';

/**
 * The gender of the nominative singular form that IS the headword, when the
 * paradigm has exactly one such form - `vse` in `veś`'s paradigm is neuter.
 * Undefined for an ambiguous or absent match, so nothing is guessed.
 */
function headwordGender(entry: Entry): string | undefined {
  const genders = new Set(
    paradigm(entry.lemma, entry.pos.xpos)
      .filter((t) => t.form === entry.lemma && t.feats?.['Case'] === 'Nom' && t.feats?.['Number'] === 'Sing')
      .map((t) => t.feats?.['Gender'])
      .filter((g): g is string => g !== undefined),
  );
  return genders.size === 1 ? [...genders][0] : undefined;
}

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
    // A noun modifier agrees once it has become an adjective ("Sěverny Větr");
    // kept as a noun, it has its own gender and must not take the head's.
    const adjectivalCompound = node.token.deprel === 'compound' && node.entry?.pos.upos === 'ADJ';
    if (
      !adjectivalCompound &&
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

    // A word with its own preposition takes its case from that preposition:
    // in "во всём прав" the parser hangs "всём" off "прав", and agreeing it
    // turned the locative "v vsem" into the nominative "v vse".
    const ownPreposition = ctx.sentence.tokens.some((t) => t.head === node.token.id && t.deprel === 'case');
    for (const f of ['Case', 'Gender', 'Number', 'Animacy'] as const) {
      if (f === 'Case' && ownPreposition) continue;
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
        // Agreement itself is certain, but the value is only as certain as
        // the head's own decision: an object's default accusative must not
        // turn into a certainty on its adjective.
        decide(
          hv.value,
          'agreement.fromHead',
          hv.confidence,
          `agrees with "${head.entry.lemma}" (${f} = ${hv.value})`,
        ),
      );
    }
  }

  /**
   * A word that agrees but has no noun to agree with - "так чтобы ОДИН не
   * понимал речи другого", where "один" stands alone - still needs a gender,
   * and a Russian source states it (Gender=Masc). Without it the paradigm's
   * tie-break gave the feminine "jedna". English marks no gender on these
   * words, so nothing changes there.
   */
  for (const node of plan) {
    /**
     * The reciprocal is a fixed formula, "jedin drugogo" (pronouns page), and
     * its halves are masculine whatever they refer to: "I oni govorili jedin k
     * drugomu" (his Tower of Babel). Russian "друг другу" carries no gender
     * to read, and the tie-break gave "jedna drugomu".
     */
    if (node.token.feats['PronType'] === 'Rcp' && !node.feats.has('Gender')) {
      node.feats.set('Gender', decide('Masc', 'reciprocal.formula', 'certain',
        'the reciprocal formula "jedin drugogo" is masculine'));
      continue;
    }
    // Also a source NOUN that became an adjective: a language's name is one,
    // "Interslavic" -> `medžuslovjansky`, and with no gender the tie-break
    // gave the feminine "Medžuslovjanska jest moja nova obsesija" where
    // Tatoeba 12994632 writes "Medžuslovjansky".
    const adjectival = ['ADJ', 'DET', 'NUM', 'PRON'].includes(node.token.upos) || node.entry?.pos.upos === 'ADJ';
    if (!adjectival) continue;
    if (node.feats.has('Gender') || node.entry?.pos.gender) continue;
    const marked = node.token.feats['Gender'];
    if (marked) {
      node.feats.set('Gender', decide(marked, 'gender.source', 'high',
        `no noun to agree with, so the gender the source marks (${marked})`));
      continue;
    }
    /**
     * Nothing to agree with and nothing in the source: the dictionary's own
     * headword decides. English "everything" reaches `vse` "all, everything",
     * which declines like `veś` - and `vse` IS its neuter singular, so the
     * entry names the gender. Unrequested, the tie-break gave the masculine
     * "Ja jesm kupil skoro veś".
     */
    const own = node.entry ? headwordGender(node.entry) : undefined;
    if (own) {
      node.feats.set('Gender', decide(own, 'gender.headword', 'high',
        `"${node.entry!.lemma}" is itself the ${own === 'Neut' ? 'neuter' : own === 'Fem' ? 'feminine' : 'masculine'} form`));
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
