import { decide, type UdToken } from '../../../types/index.ts';
import type { PlanNode } from '../result.ts';
import { subjectPerson } from '../tree.ts';
import type { StageContext } from './context.ts';

/**
 * A predicate nominal or adjective agrees with its subject, and takes the
 * nominative. Runs after agreement propagation, because a predicate adjective
 * must not then be overwritten by a head it does not have.
 */
export function predicateAgreementStage(ctx: StageContext): void {
  const { sentence, adapter, plan, insertedCopulas, pastAuxiliaries, conditionalVerbs } = ctx;

  // "Water is cold" makes the ADJECTIVE the root, with the subject hanging off
  // it, so a predicate adjective has to agree with its subject rather than with
  // a head noun it does not have.
  const subjectOf = (id: number) =>
    plan.find((n) => n.token.head === id && n.token.deprel.startsWith('nsubj'));
  const sharesHeadSubject = (t: UdToken): boolean =>
    (t.deprel === 'conj' && t.upos !== 'NOUN') || (t.deprel === 'xcomp' && t.upos === 'ADJ');
  // Up the chain: "svobodni i ravni" - "ravni" hangs off "svobodni", which
  // hangs off the verb that has the subject.
  const subjectFor = (t: UdToken, hops = 0): PlanNode | undefined => {
    const own = subjectOf(t.id);
    if (own || hops >= 4 || !sharesHeadSubject(t)) return own;
    const head = sentence.tokens.find((h) => h.id === t.head);
    return head ? subjectFor(head, hops + 1) : undefined;
  };

  for (const node of plan) {
    // A passive participle is predicative like an adjective - "Oni sųt
    // obdarjeni" - and Stanza tags the Russian short form VERB.
    // The plan's decision, not the source's tag: "be born" is a finite verb
    // once the dictionary has absorbed its "be" (phrasal-verbs.ts).
    const passiveParticiple =
      node.token.upos === 'VERB' && node.feats.get('Voice')?.value === 'Pass';
    if (node.token.upos !== 'ADJ' && node.token.upos !== 'NOUN' && !passiveParticiple) continue;
    /**
     * A predicate is a nominal that HAS a subject - which is the real test,
     * and covers a subordinate clause as well as the sentence root. Requiring
     * `root` left "...da by děti byli zdrava" with a feminine singular
     * adjective for a plural subject.
     *
     * A second predicate joined by "and" shares the first one's subject:
     * "Oni sųt obdarjeni råzumom ... i dolžni" - reading only its own
     * dependents left "dolžne" agreeing with nothing. Nouns are left out: a
     * coordinated noun keeps its own gender anyway, and is far more often a
     * second object than a second predicate.
     *
     * An adjective complement of a verb (`xcomp`) is a predicate of that
     * verb's subject, and van Steenbergen's UDHR puts it in the nominative,
     * agreeing: "Vsi ljudi rodęt sę svobodni i råvni" - where Russian has the
     * instrumental "свободными и равными" and English no agreement at all
     * ("svobodna i ravna"). Adjectives only: a noun complement keeps the case
     * its verb governs ("Ona stala lěkarem").
     */
    const isRoot = node.token.deprel === 'root';
    const subject = subjectFor(node.token);
    if (!isRoot && !subject) continue;

    /**
     * A nominal governed by a preposition is not the predicate - the whole
     * prepositional phrase is. UD makes the noun inside it the root of a
     * copular sentence, so "This gift is for my mother" put `mati` in the
     * predicate's NOMINATIVE and agreed it with the masculine subject "dar",
     * overwriting both the genitive `dlja` governs and the noun's own
     * feminine gender: "dlja mojej mati" instead of "dlja mojej matere".
     */
    if (sentence.tokens.some((t) => t.head === node.token.id && t.deprel === 'case')) continue;

    /**
     * An impersonal predicate has no nominal subject to agree with - either a
     * placeholder was deleted ("it is important", "it is clear") or the subject
     * is a whole clause, which has no gender. Such a predicate is NEUTER
     * singular, which is how the corpus writes it: "Nužno jest tuty članok
     * prěvesti", "Zato trěba jest podčrknuti, že...". Without this the gender
     * fell out of a tie-break and gave the feminine "Jest važna čitati".
     */
    if (!subject) {
      /**
       * A predicate ADJECTIVE with no subject at all is impersonal by
       * definition - Russian "Мне холодно" has only a dative experiencer, and
       * the gender fell out of a tie-break as the feminine "zimna". A predicate
       * NOUN is excluded: a bare nominal is a fragment, and it keeps its own
       * lexical gender regardless.
       */
      const impersonal =
        node.token.upos === 'ADJ' ||
        plan.some(
          (n) =>
            n.token.head === node.token.id &&
            (n.token.deprel === 'expl' || n.token.deprel.startsWith('csubj')),
        );
      if (!impersonal) continue;
      node.feats.set(
        'Case',
        decide('Nom', 'case.predicate', 'high', 'predicate complement takes the nominative'),
      );
      node.feats.set('Gender', decide('Neut', 'agreement.impersonal', 'high',
        'an impersonal predicate has no subject to agree with and is neuter'));
      node.feats.set('Number', decide('Sing', 'agreement.impersonal', 'high',
        'an impersonal predicate is singular'));
      continue;
    }

    // An untranslated subject (a proper noun, say) still has to be agreed
    // with: the entry below is only used to name it in the gloss, and skipping
    // the whole block left "Peter is happy" as the feminine "ščestliva".
    const subjectName = subject.entry?.lemma ?? subject.token.form;


    node.feats.set(
      'Case',
      decide('Nom', 'case.predicate', 'high', 'predicate complement takes the nominative'),
    );
    /**
     * Only a predicate ADJECTIVE agrees with the subject. A predicate NOUN
     * keeps its own gender, number and animacy, which are lexical facts about
     * that noun - "It is a good book" was giving `kniga` the NEUTER of `ono`,
     * and "My favourite thing is books" would have been forced into the
     * singular. It still takes the nominative, which is a property of the
     * position rather than of the word.
     *
     * The wrong gender was invisible because a noun's form is not selected by
     * gender, and because the adjective had already agreed with `kniga` in the
     * earlier pass - an ordering accident, not a safeguard.
     */
    if (node.token.upos !== 'NOUN') {
      for (const f of ['Gender', 'Number', 'Animacy'] as const) {
        const v = subject.feats.get(f);
        if (!v) continue;
        node.feats.set(
          f,
          decide(
            v.value,
            'agreement.predicate',
            'certain',
            `agrees with the subject "${subjectName}" (${f} = ${v.value})`,
          ),
        );
      }
    }

    /**
     * A predicate adjective MUST have a gender, and some subjects cannot
     * supply one: "I"/"you" carry no gender in English, and an untranslated
     * proper noun has no dictionary entry to read one from. Left unset, the
     * form fell out of a tie-break and came back feminine - "On jest najlěpša"
     * for "He is the best". Masculine is the unmarked default, which is the
     * same choice the l-participle already makes, and it is reported as a
     * default rather than as a certainty.
     */
    /**
     * A 1st- or 2nd-person subject is a PERSON, so a predicate agreeing with
     * it is masculine ANIMATE, and the adjectives page makes that the one
     * distinction the nominative plural still draws:
     *
     *   "Except for adjectives referring to masculine, animate nouns, the
     *    nominate and accusative plural are identical for all genders."
     *   http://steen.free.fr/interslavic/adjectives.html
     *
     * Van Steenbergen's Maly princ contrasts the two in one sentence: "Vse kury
     * sųt jednakove i vsi ljudi sųt jednakovi" - hens take -e, people -i. With
     * no animacy, "We are tired" came out as "My jesmo utomljene".
     *
     * Only the 1st and 2nd person: they are the speaker and the addressee, so
     * the referent is certain. English "they" says nothing about animacy.
     */
    const subjectFeats = subject.token.feats;
    if (
      subjectFeats['PronType'] === 'Prs' &&
      (subjectFeats['Person'] === '1' || subjectFeats['Person'] === '2') &&
      !node.feats.has('Animacy')
    ) {
      node.feats.set('Animacy', decide('Anim', 'agreement.predicate.person', 'certain',
        `"${subject.token.form}" is a person, so the predicate is animate`));
    }

    /**
     * An untranslated subject has no entry, but the source may still mark its
     * gender morphologically - Russian "Зульфия" is Gender=Fem - and that is a
     * fact about the referent, the same one the l-participle already reads
     * ("Зульфия spala"). Ignoring it gave "Зульфия jest ščestlivy".
     */
    const sourceGender = subjectFeats['Gender'];
    if (!node.feats.has('Gender') && sourceGender) {
      node.feats.set(
        'Gender',
        decide(sourceGender, 'agreement.predicate', 'certain',
          `agrees with the subject "${subjectName}" (Gender = ${sourceGender}, marked in the source)`),
      );
    }

    if (!node.feats.has('Gender')) {
      node.feats.set(
        'Gender',
        decide(
          'Masc',
          'agreement.predicate.defaultGender',
          'default',
          `the subject "${subject.token.form}" carries no gender, so the unmarked masculine`,
          [{ value: 'Fem', because: 'if the subject is feminine' }],
        ),
      );
    }
  }

}
