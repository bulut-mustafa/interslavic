import { decide, type Case, type Decision, type UdToken } from '../../../types/index.ts';
import { normalizeGloss, rank, type Entry } from '../../../lexicon/src/reader.ts';
import { resolveAspect, type AspectOutcome } from '../resolvers/aspect.ts';
import { resolveCase } from '../resolvers/case.ts';
import { compared } from '../../../morph/src/comparison.ts';
import { realize } from '../../../morph/src/realize.ts';
import { auxiliaryRole, conditionalAuxiliary, futureAuxiliary } from '../../../rules/src/auxiliaries.ts';
import { functionWordFor } from '../../../rules/src/function-words.ts';
import { modalFor } from '../../../rules/src/modals.ts';
import { negativeCounterparts } from '../../../rules/src/negation.ts';
import { governmentFor, numeralValue } from '../../../rules/src/numerals.ts';
import { isOneAnaphor, antecedentOf } from '../../../rules/src/anaphora.ts';
import { isExpletiveSubject } from '../../../rules/src/expletives.ts';
import {
  hasCliticForm,
  isReflexivePronoun,
  REFLEXIVE_POSSESSIVE,
  REFLEXIVE_PRONOUN,
} from '../../../rules/src/reflexives.ts';
import {
  COMPLEMENTIZER,
  personalPronounGender,
  personalPronounNumber,
  prepCaseFor,
  RELATIVE_PRONOUN,
} from '../../../rules/src/pronouns.ts';
import { baseDeprel, phraseOf, pronounLemmaFor, subjectNumber, subjectOfClause, subjectPerson } from '../tree.ts';
import { CASE_BEARING, findPlannedPrep, isArticle } from '../plans.ts';
import { toStandard } from '../../../morph/src/orthography.ts';
import type { PlanNode } from '../result.ts';
import type { LexemeInput } from './lexeme-input.ts';

/**
 * Choose the Interslavic word for every source token, and resolve the features
 * it will be realised with.
 *
 * The largest stage by far, and the one every planning stage feeds: it reads
 * the preposition plans, the auxiliary roles, the modal plans, the negation
 * marking and the verb government, and writes the `plan` that agreement and
 * realisation then work on.
 */
export function lexemeStage(input: LexemeInput): PlanNode[] {
  const {
    sentence, adapter, lex, dropped, unknown,
    phrasalVerbs, phrasalParticles,
    prepPlans, governedCase, deletedPreps,
    droppedAux, auxFeatsForHead, auxRoleForHead, futureForms, futureAuxToken,
    conditionalVerbs, purposeClauses, finitePurposeMarks, finitePurposeCarriers,
    imperatives, optativeVerbs, modalPlans, modalOfHead, analyticSuperlatives,
    negationParticles, verbGovernedCase,
    contextWords,
    personOf, possessorIsSubject, inNegatedClause, needsVerbFeatures, rankedFor,
  } = input;

  const plan: PlanNode[] = [];

  for (const token of sentence.tokens) {
    if (token.deprel === 'punct' || token.upos === 'PUNCT') continue;
    /**
     * A phrasal particle is part of the Interslavic verb's own lemma, so the
     * word itself is not emitted: "look after" is one verb, `prigledati`, not
     * a verb plus a preposition. Must be the FIRST test in this loop - an ADP
     * otherwise takes the preposition branch below and is emitted there.
     */
    if (phrasalParticles.has(token.id)) {
      const verbEntry = phrasalVerbs.get(token.head);
      dropped.push({
        form: token.form,
        why: verbEntry
          ? `part of the phrasal verb translated by "${verbEntry.lemma}"`
          : 'part of a phrasal verb',
      });
      continue;
    }
    if (adapter.dropsArticles && isArticle(token)) {
      dropped.push({ form: token.form, why: 'Interslavic has no articles' });
      continue;
    }
    // "to" before an infinitive is a marker, not a preposition; the Interslavic
    // infinitive ending carries it. Left in, it became the preposition `do`
    // ("Ja ne hoču DO ide do kina").
    if (token.upos === 'PART' && token.deprel === 'mark' && token.lemma.toLowerCase() === 'to') {
      dropped.push({
        form: token.form,
        why: 'the infinitive ending carries this, so no separate word is needed',
      });
      continue;
    }
    if (negationParticles.has(token.id)) {
      dropped.push({
        form: token.form,
        why: 'replaced by `ne`, which Interslavic places immediately before the verb',
      });
      continue;
    }
    if (droppedAux.has(token.id)) {
      const role = auxRoleForHead.get(token.head);
      /**
       * The superlative marker is not an auxiliary at all - it shares this
       * deletion set because it is deleted the same way - so it needs its own
       * reason. It was being reported as "English do-support", which is
       * nonsense beside a Russian source word.
       */
      const isSuperlativeMarker = sentence.tokens.some(
        (t) => t.head === token.id || (token.head === t.id && analyticSuperlatives.has(t.id)),
      );
      dropped.push({
        form: token.form,
        why:
          role === 'progressive'
            ? 'the ongoing sense is carried by imperfective aspect, not by an auxiliary'
            : role === 'perfect'
              ? 'Interslavic has a single past tense, so the perfect auxiliary is not needed'
              : isSuperlativeMarker
                ? 'Interslavic builds the superlative with the prefix naj-, not a separate word'
                : 'English do-support has no Interslavic equivalent; its tense moved to the main verb',
      });
      continue;
    }
    /**
     * An English expletive subject has no Interslavic counterpart: the
     * impersonal is simply subjectless. See packages/rules/src/expletives.ts
     * for the usage this rests on.
     */
    if (isExpletiveSubject(token, sentence)) {
      dropped.push({
        form: token.form,
        why: 'Interslavic has no placeholder subject - an impersonal sentence simply has none',
      });
      continue;
    }
    if (deletedPreps.has(token.id)) {
      const p = prepPlans.get(token.id);
      dropped.push({
        form: token.form,
        why: p?.kind === 'caseMarker' ? p.case.because : 'expressed by case alone',
      });
      continue;
    }

    // "will go" -> "bųdų idti": this token is the auxiliary, rewritten.
    const futureHead = [...futureAuxToken.entries()].find(([, auxId]) => auxId === token.id);
    if (futureHead) {
      // Walk to the subject rather than looking only under the infinitive: with
      // "going to" the subject hangs off the participle, and for "you" the
      // number comes from the Interslavic lemma (`vy` is plural), not from the
      // English word.
      const subject = subjectOfClause(token, sentence);
      const subjectPronoun = subject ? pronounLemmaFor(subject.feats, sentence) : null;
      const person = subject ? personOf(subject) : '3';
      const number = subjectPronoun
        ? personalPronounNumber(subjectPronoun)
        : subject?.feats['Number'] === 'Plur'
          ? 'Plur'
          : 'Sing';
      const conditional = auxRoleForHead.get(futureHead[0]) === 'conditional';
      futureForms.set(token.id, {
        form: conditional
          ? conditionalAuxiliary(person, number)
          : futureAuxiliary(person, number),
        person,
        number,
      });
      plan.push({
        token,
        entry: null,
        ranked: [],
        aspect: null,
        feats: new Map(),
        notes: [],
      });
      continue;
    }

    // Aspect first, so it can filter verb candidates (constraint 1).
    const aspect = needsVerbFeatures(token) ? resolveAspect({ token, sentence }) : null;

    const modalPlan = modalPlans.get(token.id) ?? null;
    // "could" is not a dictionary gloss, so a modal is looked up by the gloss
    // its curated plan names ("can") and then pinned to the chosen lexeme.
    const ranked = modalPlan
      ? rank(lex.lookup(modalPlan.gloss, sentence.lang), {
          upos: 'VERB',
          gloss: modalPlan.gloss,
          lang: sentence.lang,
          sourceIsSingleWord: true,
          contextWords,
          ...(aspect ? { aspect: aspect.decision.value } : {}),
        })
      : rankedFor(token, aspect);

    // For a surviving preposition, the government table has already chosen
    // WHICH Interslavic preposition to use, together with the case it governs.
    // Frequency ranking must not override that: plain "to" would otherwise win
    // `do` (+gen, "until") over `k` (+dat, "towards").
    const plannedPrep = findPlannedPrep(token.id, prepPlans);

    // Closed-class words use a curated choice: ranking picks "tamto" ("that
    // over there") for plain "that", because the narrower gloss looks like a
    // better match than the general demonstrative's "this, that".
    const curated = functionWordFor(token.lemma, token.upos, sentence.lang, inNegatedClause(token));
    /**
     * A curated lemma need not be a candidate for the source word, for the
     * same reason a planned preposition need not be (see below): curation
     * exists precisely where the dictionary's own glosses do not connect the
     * two words. Under negation English "a single book" is `nijednu knigu`,
     * but `nijedin` is glossed "no, not any, none" and never "single"; and
     * "anymore" reaches `uže` only through the multiword `už ne`.
     *
     * The part of speech may differ too, so it is tried and then dropped:
     * "single" is an ADJ in the source and `nijedin` is an indefinite pronoun
     * in Interslavic. That mismatch is the thing being curated, not an error.
     */
    const curatedEntry = curated
      ? (ranked.find((e) => e.lemma === curated.isv) ??
          lex.lookupLemma(curated.isv, token.upos)[0] ??
          lex.lookupLemma(curated.isv)[0])
      : undefined;
    const curatedMissing = curated !== null && curatedEntry === undefined;

    const modalEntry = modalPlan ? ranked.find((e) => e.lemma === modalPlan.isv) : undefined;
    const modalMissing = modalPlan !== null && modalEntry === undefined;

    // A reflexive object is "se", not a personal pronoun. The dictionary's
    // gloss list for `sebe` omits "myself", so this cannot go through a gloss.
    const isReflexive =
      sentence.lang === 'en' &&
      token.upos === 'PRON' &&
      (token.feats['Reflex'] === 'Yes' || isReflexivePronoun(token.lemma));
    const reflexiveEntry = isReflexive
      ? lex.lookupLemma(REFLEXIVE_PRONOUN, 'PRON')[0]
      : undefined;

    // "Whenever the possessor is also the subject of the sentence, the
    // reflexive svoj is used" - and its only gloss is "one's own", which no
    // English source lemma will ever match.
    const wantsSvoj =
      sentence.lang === 'en' && token.deprel === 'nmod:poss' && possessorIsSubject(token);
    const svojEntry = wantsSvoj ? lex.lookupLemma(REFLEXIVE_POSSESSIVE, 'PRON')[0] : undefined;

    // The dictionary glosses oblique FORMS as entries ("jų" = her, "jego" =
    // him), which have no paradigm of their own. Inflect the nominative lemma
    // the parser's features identify instead.
    // Not English-only: the Russian column glosses oblique forms as entries in
    // exactly the same way, and Russian "они" had no usable key at all.
    const pronounLemma = isReflexive ? null : pronounLemmaFor(token.feats, sentence);
    const pronounEntry = pronounLemma ? lex.lookupLemma(pronounLemma, 'PRON')[0] : undefined;

    /**
     * A relative pronoun, which the gloss lookup turned into the interrogative
     * `kto`. Its antecedent is the noun the relative clause hangs off, and it
     * agrees with that in gender and number while taking its case from its own
     * role inside the clause.
     */
    // `PronType=Rel` is a UD feature both source languages provide: Russian
    // `который` carries it just as English "who"/"which" do, and it was
    // reaching the interrogative there too.
    const relativeHead =
      token.feats['PronType'] === 'Rel'
        ? sentence.tokens.find((t) => t.id === token.head && t.deprel === 'acl:relcl')
        : undefined;
    const antecedent = relativeHead
      ? sentence.tokens.find((t) => t.id === relativeHead.head)
      : undefined;
    const relativeEntry = relativeHead
      ? lex.lookupLemma(RELATIVE_PRONOUN, 'PRON')[0]
      : undefined;

    // "that" joining two clauses is the conjunction `že`, not a demonstrative.
    const complementizerEntry =
      token.deprel === 'mark' &&
      token.upos === 'SCONJ' &&
      adapter.complementizers.includes(token.lemma.toLowerCase())
        ? lex.lookupLemma(COMPLEMENTIZER, 'CCONJ')[0]
        : undefined;

    /**
     * Under negation an indefinite must become the ni- form. The derived
     * counterpart is only used if the dictionary actually has it - the
     * correlative table is systematic, the dictionary is not complete, and
     * emitting a word that does not exist would be worse than the positive.
     */
    let negativeEntry: Entry | undefined;
    const rankedFirst = ranked[0];
    if (sentence.lang === 'en' && rankedFirst && inNegatedClause(token)) {
      for (const counterpart of negativeCounterparts(rankedFirst.lemma, toStandard)) {
        const hits = lex.lookupLemma(counterpart);
        negativeEntry = hits.find((e) => e.pos.upos === rankedFirst.pos.upos) ?? hits[0];
        if (negativeEntry) break;
      }
    }

    const entry =
      phrasalVerbs.get(token.id) ??
      complementizerEntry ??
      relativeEntry ??
      negativeEntry ??
      reflexiveEntry ??
      svojEntry ??
      pronounEntry ??
      modalEntry ??
      curatedEntry ??
      /**
       * The government table has already chosen the preposition, so it is
       * looked up by LEMMA. It need not be a candidate for the English word at
       * all: verb government replaces "wait FOR" with `na` and "depend ON" with
       * `od`, neither of which glosses the source preposition, and searching
       * only the ranked candidates fell back to `dlja` - the case came out
       * right and the preposition still wrong, "čekajemo dlja pojezd".
       */
      (plannedPrep ? lex.lookupLemma(plannedPrep, 'ADP')[0] : undefined) ??
      ranked[0] ??
      null;

    const feats = new Map<string, Decision<string>>();
    const notes: string[] = [];
    if (curatedMissing) {
      notes.push(`curated choice "${curated?.isv}" is not among the dictionary candidates`);
    }
    if (modalMissing) {
      notes.push(`curated modal "${modalPlan?.isv}" is not among the dictionary candidates`);
    }
    if (negativeEntry) {
      notes.push(
        `negated clause, so the ni- form "${negativeEntry.lemma}" rather than the ` +
          `positive "${ranked[0]?.lemma}" - Interslavic negates every negatable word`,
      );
    }
    if (svojEntry) {
      // English does not distinguish the two readings, so name the other one.
      notes.push(
        `the possessor is the subject, so Interslavic requires the reflexive "svoj"` +
          (personOf(token) === '3'
            ? ` - a possessor other than the subject would be "jegov"/"jejin"/"jihny"`
            : ''),
      );
    }

    if (!entry) {
      unknown.push(token.form);
      notes.push('not in the dictionary - source word kept');
      plan.push({ token, entry: null, ranked, aspect, feats, notes });
      continue;
    }

    /**
     * Comparison was simply dropped: "bigger" and "biggest" both came out as
     * the positive, because UD's `Degree` was never read. English also has an
     * ANALYTIC pattern ("more academic"), where `more` is its own adverb and
     * the adjective stays positive - that one already matches Interslavic's own
     * analytic form (`vyše` + positive) and needs nothing here.
     *
     * This must run BEFORE the indeclinable short-circuit below. An adverb is
     * indeclinable, so it returned early and lost its degree: Russian
     * "быстрее" came out as the positive `bystro`, and an English comparative
     * adverb ("faster", "sooner") had the same bug. Degree is not inflection
     * here - it selects a different LEMMA (`bystro` -> `bystrěje`), which is
     * exactly why an indeclinable can still carry it.
     */
    const sourceDegree = analyticSuperlatives.has(token.id) ? 'Sup' : token.feats['Degree'];
    /**
     * Whether the source marks the degree on a DIFFERENT stem, which is what
     * says the dictionary entry we matched is the positive and still needs
     * comparing. Russian "быстрее" has the lemma `быстро` and "старше" has
     * `старший`, so both derive; "больше" has the lemma `больше`, so the entry
     * it matches (`veče`, glossed "more") is ALREADY a comparative and
     * deriving again produced "večeje".
     *
     * The same test holds for English: "bigger" has the lemma "big", while
     * "more" is its own lemma and is handled analytically.
     */
    const degreeIsOnAnotherStem =
      analyticSuperlatives.has(token.id) ||
      token.form.trim().toLowerCase() !== token.lemma.trim().toLowerCase();
    if (
      (sourceDegree === 'Cmp' || sourceDegree === 'Sup') &&
      degreeIsOnAnotherStem &&
      (entry.pos.upos === 'ADJ' || entry.pos.upos === 'ADV')
    ) {
      feats.set(
        'Degree',
        decide(
          sourceDegree,
          sourceDegree === 'Cmp' ? 'degree.comparative' : 'degree.superlative',
          'certain',
          sourceDegree === 'Cmp'
            ? 'comparative, copied from the source'
            : 'superlative: naj- prefixed to the comparative',
        ),
      );
    }

    // Indeclinables (prepositions, conjunctions, adverbs) have no paradigm, so
    // requesting features would fail and wrongly mark them unvalidated.
    if (entry.pos.indeclinable) {
      plan.push({ token, entry, ranked, aspect, feats, notes });
      continue;
    }

    if (CASE_BEARING.has(token.upos)) {
      const governed = governedCase.get(token.id);
      const byVerb = verbGovernedCase.get(token.id);
      /**
       * A noun whose case the SOURCE's numeral governs has a case that says
       * nothing about Interslavic. Russian writes "три книги" with a genitive
       * singular and "пять братьев" with a genitive plural; Interslavic uses
       * the nominative plural after 2-4 and the genitive plural after 5. For
       * 2-4 the Interslavic rule imposes only a NUMBER (`governmentFor` returns
       * `case: null`, because the grammar covers only direct positions), so
       * nothing replaced the copied genitive and "Ja vidžu tri knigy" came out
       * as "Ja vidžu trěh knig".
       *
       * So the copied case is discarded and inferred from the syntactic role
       * instead - the same cascade English uses, which is exactly what is
       * wanted when the source's marking is an artefact of its own syntax.
       *
       * The test is "counted by a numeral of 2 or more", not UD's `nummod:gov`
       * subtype: Stanza applies that inconsistently, labelling "два брата"
       * `nummod:gov` and "три книги" plain `nummod` while putting both in the
       * paucal genitive. `jedin` is excluded because it agrees rather than
       * governs, so a source case beside it IS transferable.
       */
      /**
       * A noun counted by a numeral takes the NUMERAL's case, not its own. The
       * source marks the numeral correctly in every position - any preposition
       * governs the numeral, and the numeral then governs the noun - while the
       * noun's own case is whatever the SOURCE's numeral syntax imposes, which
       * does not transfer. Russian writes:
       *
       *   два брата        Nom + Gen.Sing   -> Interslavic dva brati   (Nom.Pl)
       *   три книги        Acc + Gen.Sing   -> tri knigy               (Acc.Pl)
       *   на два года      Acc + Gen.Sing   -> na dva roki             (Acc.Pl)
       *   с тремя книгами  Ins + Ins        -> s trěmi knigami         (Ins.Pl)
       *
       * so taking the numeral's case gets all four right with one rule, where
       * copying the noun's gave "dvě brata", "trěh knig" and "na dva rokov".
       * The NUMBER comes from the numerals page (Phase B1), and for 5-and-up
       * its case government overrides this.
       *
       * `jedin` is excluded: it agrees rather than governs, so the noun's own
       * case beside it is transferable.
       */
      const countingNumeral = sentence.tokens.find((t) => {
        if (t.head !== token.id || baseDeprel(t.deprel) !== 'nummod') return false;
        const v = numeralValue(t.lemma, t.form, sentence.lang);
        return v !== null && v >= 2;
      });
      const numeralCase =
        adapter.copyCase && countingNumeral ? countingNumeral.feats['Case'] : undefined;
      const c = resolveCase({
        token,
        sentence,
        copyFromSource: adapter.copyCase && !countingNumeral,
        ...(governed ? { prepositionGoverns: governed.value as Case } : {}),
        ...(byVerb
          ? { verbGoverns: byVerb.case, verbGovernedBy: { lemma: byVerb.lemma, code: byVerb.code } }
          : {}),
      });
      // Keep the preposition's own justification rather than the generic one.
      feats.set(
        'Case',
        governed ??
          (numeralCase
            ? decide<string>(
                numeralCase,
                'case.fromCountingNumeral',
                'high',
                `takes the case of "${countingNumeral!.form}", the numeral counting it`,
              )
            : (c as Decision<string>)),
      );

      /**
       * A reflexive object takes the CLITIC: "Se is used in reflexive verbs:
       * Ja myju se". The stressed `sebe` is for emphasis, and the page adds
       * "after a preposition, it is better to use the longer forms", so a
       * reflexive governed by one keeps the long form.
       * Only the accusative and dative have clitics at all.
       */
      /**
       * "After a preposition, all pronouns of the third person are preceded by
       * n-: jego > do njego". Without requesting this, the longest-form
       * tie-break returned the n- form everywhere, so "I see him" came out as
       * "njego" instead of "jego".
       */
      if (pronounEntry) {
        feats.set(
          'PrepCase',
          decide(
            prepCaseFor(governed !== undefined),
            'pronoun.prepCase',
            'certain',
            governed !== undefined
              ? 'third-person pronouns take the n- form after a preposition'
              : 'no preposition, so the plain form rather than the n- form',
          ),
        );
      }

      if (isReflexive) {
        const resolved = feats.get('Case')?.value ?? '';
        if (governed === undefined && hasCliticForm(resolved)) {
          feats.set(
            'Variant',
            decide(
              'Short',
              'reflexive.clitic',
              'certain',
              'reflexive verbs take the clitic "se", not the stressed "sebe"',
            ),
          );
        } else if (governed !== undefined) {
          notes.push('after a preposition the longer reflexive form is preferred');
        }
      }
    }

    /**
     * A plurale tantum noun is plural whatever the source says - English "one
     * door" is singular, but `dveri` has no singular at all. The numerals page
     * states what the modifier then does:
     *   "In some cases, [jedin] can also be used in the plural [...] This is
     *    also the case for pluralia tantum: jedne dveri 'one door'."
     * Fixing the noun alone left the numeral agreeing with the source's
     * singular, which gave "Jedna dveri".
     */
    if (relativeEntry && antecedent) {
      const antecedentNode = plan.find((n) => n.token.id === antecedent.id);
      const gender = antecedentNode?.feats.get('Gender')?.value ?? antecedent.feats['Gender'];
      if (gender) {
        feats.set('Gender', decide(gender, 'agreement.relative', 'certain',
          `agrees with "${antecedent.form}", the noun the relative clause describes`));
      }
      feats.set(
        'Number',
        decide(antecedent.feats['Number'] === 'Plur' ? 'Plur' : 'Sing', 'agreement.relative',
          'certain', `agrees with "${antecedent.form}"`),
      );
      const animacy = antecedentNode?.feats.get('Animacy')?.value;
      if (animacy) {
        feats.set('Animacy', decide(animacy, 'agreement.relative', 'certain',
          `agrees with "${antecedent.form}" (Animacy = ${animacy})`));
      }
    }

    /**
     * A placeholder "one" is dropped from the output, but its modifier agrees
     * with it, so it needs the gender of the noun it stands for: "This book is
     * more interesting than that one" needs the feminine `ta`, from `kniga`.
     * Where the sentence names no antecedent ("I want the red one") English
     * gives no gender at all, and the unmarked masculine is used - the same
     * default, and the same honesty about it, as for a predicate adjective.
     */
    if (isOneAnaphor(token, sentence)) {
      const antecedentToken = antecedentOf(token, sentence);
      const antecedentNode = antecedentToken
        ? plan.find((n) => n.token.id === antecedentToken.id)
        : undefined;
      const gender = antecedentNode?.feats.get('Gender')?.value;
      feats.set(
        'Gender',
        gender
          ? decide(gender, 'anaphora.one', 'high',
              `stands for "${antecedentToken!.form}", which is ${gender.toLowerCase()}`)
          : decide('Masc', 'anaphora.one', 'default',
              'the sentence names no noun for "one" to stand for, so the unmarked masculine',
              [{ value: 'Fem', because: 'if the noun it stands for is feminine' }]),
      );
      const animacy = antecedentNode?.feats.get('Animacy')?.value;
      if (animacy) {
        feats.set('Animacy', decide(animacy, 'anaphora.one', 'high',
          `stands for "${antecedentToken!.form}" (Animacy = ${animacy})`));
      }
    }

    if (pronounLemma) {
      const pronounGender = personalPronounGender(pronounLemma);
      if (pronounGender) {
        feats.set(
          'Gender',
          decide(
            pronounGender,
            'gender.pronounLemma',
            'certain',
            `"${pronounLemma}" is ${pronounGender.toLowerCase()} in Interslavic`,
          ),
        );
      }
      // The pronoun's number belongs to the lemma we chose, not to the English
      // source: `vy` has no singular, so copying "you"'s unmarked number asked
      // for a form that does not exist.
      feats.set(
        'Number',
        decide(
          personalPronounNumber(pronounLemma),
          'number.pronounLemma',
          'certain',
          `"${pronounLemma}" is ${personalPronounNumber(pronounLemma) === 'Plur' ? 'plural' : 'singular'} in Interslavic`,
        ),
      );
    } else if (entry.pos.numberOnly === 'Sing') {
      // The mirror image: 1,070 entries are marked singular-only (`f.sg.`,
      // `m.sg.`, `n.sg.`) and the library refuses a plural for every one of
      // them, so a plural source left realisation to fail and fall back to the
      // citation form - losing the CASE as well as the number.
      feats.set(
        'Number',
        decide(
          'Sing',
          'number.singulareTantum',
          'certain',
          `"${entry.lemma}" is singular-only in the dictionary, so it has no plural`,
        ),
      );
    } else if (entry.pos.numberOnly === 'Plur') {
      feats.set(
        'Number',
        decide(
          'Plur',
          'number.pluraleTantum',
          'certain',
          `"${entry.lemma}" is plural-only in the dictionary, so it has no singular to copy`,
        ),
      );
    } else {
      const num = token.feats['Number'] === 'Plur' ? 'Plur' : 'Sing';
      feats.set('Number', decide(num, 'number.copy', 'certain', 'copied from the source'));
    }

    // Interslavic gender and animacy are properties of the INTERSLAVIC noun,
    // not of the source word, so they come from the dictionary entry.
    if (token.upos === 'NOUN' || token.upos === 'PROPN') {
      if (entry.pos.gender) {
        feats.set(
          'Gender',
          decide(entry.pos.gender, 'gender.lexical', 'certain', `lexical property of "${entry.lemma}"`),
        );
      }
      if (entry.pos.gender === 'Masc') {
        const anim = entry.pos.animate ? 'Anim' : 'Inan';
        feats.set(
          'Animacy',
          decide(anim, 'animacy.lexical', 'certain', `"${entry.lemma}" is ${entry.pos.animate ? 'animate' : 'inanimate'}`),
        );
      }
    }


    // Aspect filters the CANDIDATES, but a gloss may have no counterpart in the
    // requested aspect. Requesting Perf of a verb that only exists as Imp used
    // to match nothing, and realisation then fell back to the citation form -
    // "Ona ne znati odgovor" instead of "Ona ne znala odgovor". So the request
    // is reconciled with the aspect the chosen lexeme actually has.
    const lexemeAspect = entry.pos.aspect;
    const requestedAspect = aspect?.decision.value;
    const aspectMismatch =
      aspect !== null && lexemeAspect !== undefined && lexemeAspect !== requestedAspect;
    if (aspectMismatch) {
      notes.push(
        `wanted the ${requestedAspect === 'Perf' ? 'perfective' : 'imperfective'} but ` +
          `"${entry.lemma}" exists only as the ` +
          `${lexemeAspect === 'Perf' ? 'perfective' : 'imperfective'}`,
      );
    }
    const effectiveAspect: Decision<string> | null = aspect
      ? aspectMismatch
        ? decide(
            lexemeAspect!,
            'aspect.lexemeOverride',
            'default',
            `"${entry.lemma}" has no counterpart in the other aspect, so its own is used`,
          )
        : (aspect.decision as Decision<string>)
      : null;

    if (needsVerbFeatures(token) && aspect) {
      // A deleted auxiliary carried the tense and person; UD leaves the main
      // verb as a bare infinitive, so take them from the auxiliary.
      const fromAux = auxFeatsForHead.get(token.id);
      const src = { ...token.feats, ...(fromAux ?? {}) };
      const via = fromAux ? ' (via the deleted auxiliary)' : '';

      /**
       * "The conditional is formed by using the L-participle with the
       * conditional of byti": so the main verb takes the same l-participle as
       * the past, and phase B4 builds it. Without this, "I would read" had
       * `would` translated as a lexical verb and `read` left finite.
       */
      /**
       * An English passive becomes the past passive participle agreeing with
       * the subject, with the copula carrying the tense:
       *   "Which woman is loved by that man?" -> "Koja žena jest ljubjena ..."
       * Previously the verb took the active l-participle and the copula the
       * literary imperfect.
       */
      if (token.feats['Voice'] === 'Pass' && token.feats['VerbForm'] === 'Part') {
        const subject = sentence.tokens.find(
          (t) => t.head === token.id && t.deprel.startsWith('nsubj'),
        );
        const subjectNode = subject && plan.find((n) => n.token.id === subject.id);
        feats.set('Voice', decide('Pass', 'passive.participle', 'certain',
          'the past passive participle, which agrees with the subject like an adjective'));
        feats.set('Case', decide('Nom', 'case.predicate', 'high',
          'predicate complement takes the nominative'));
        const passiveNumber = subject
          ? subjectNumber(token, sentence, subject.feats['Number'])
          : 'Sing';
        feats.set('Number', decide(passiveNumber, 'agreement.predicate', 'certain',
          'agrees with the subject'));
        if (passiveNumber !== 'Plur') {
          const gender =
            subjectNode?.feats.get('Gender')?.value ?? subject?.feats['Gender'] ?? 'Masc';
          feats.set('Gender', decide(gender, 'agreement.predicate',
            subjectNode?.feats.get('Gender') ? 'certain' : 'default',
            `agrees with the subject (Gender = ${gender})`));
        }
        if (effectiveAspect) feats.set('Aspect', effectiveAspect);
        plan.push({ token, entry, ranked, aspect, feats, notes });
        continue;
      }

      const imperative = imperatives.get(token.id);
      if (imperative) {
        feats.set('VerbForm', decide('Fin', 'verbform.finite', 'certain', 'finite verb'));
        feats.set('Mood', decide('Imp', 'mood.imperative', 'certain',
          'imperative, copied from the source'));
        feats.set('Person', decide(imperative.person, 'mood.imperative', 'certain',
          imperative.person === '1'
            ? 'the first-person plural imperative ("let us ...")'
            : 'the second-person plural, which the page also gives for "one person formal"'));
        feats.set('Number', decide(imperative.number, 'mood.imperative', 'certain',
          'the imperative has no singular that English distinguishes'));
        if (effectiveAspect) feats.set('Aspect', effectiveAspect);
        plan.push({ token, entry, ranked, aspect, feats, notes });
        continue;
      }

      const optative = optativeVerbs.get(token.id);
      if (optative) {
        feats.set('VerbForm', decide('Fin', 'verbform.finite', 'certain', 'finite verb'));
        feats.set('Mood', decide('Ind', 'mood.indicative', 'default', 'indicative'));
        feats.set('Tense', decide('Pres', 'optative.present', 'certain',
          'the optative is "nehaj" with the present tense'));
        feats.set('Person', decide('3', 'optative.present', 'certain',
          'the optative addresses a third party'));
        feats.set('Number', decide(optative.number, 'optative.present', 'certain',
          'agrees with the person wished for'));
        if (effectiveAspect) feats.set('Aspect', effectiveAspect);
        plan.push({ token, entry, ranked, aspect, feats, notes });
        continue;
      }

      if (finitePurposeCarriers.has(token.id)) {
        const agreement = [...finitePurposeMarks.values()][0] ?? { person: '3', number: 'Sing' };
        conditionalVerbs.add(token.id);
        feats.set('VerbForm', decide('Fin', 'verbform.finite', 'certain', 'finite verb'));
        feats.set(
          'Tense',
          decide('Past', 'purpose.conditional', 'certain',
            'a final clause takes "da" plus the conditional, which uses the l-participle'),
        );
        feats.set('Person', decide(agreement.person, 'person.fromSubject', 'certain',
          "agrees with the final clause's own subject"));
        if (agreement.number === 'Plur') {
          feats.set('Number', decide('Plur', 'number.fromSubject', 'certain',
            "agrees with the final clause's own subject"));
        }
        if (effectiveAspect) feats.set('Aspect', effectiveAspect);
        plan.push({ token, entry, ranked, aspect, feats, notes });
        continue;
      }

      const purpose = purposeClauses.get(token.id);
      if (purpose) {
        conditionalVerbs.add(token.id);
        feats.set('VerbForm', decide('Fin', 'verbform.finite', 'certain', 'finite verb'));
        feats.set(
          'Tense',
          decide(
            'Past',
            'purpose.conditional',
            'certain',
            'a final clause takes "že" plus the conditional, which uses the l-participle',
          ),
        );
        feats.set('Person', decide(purpose.person, 'person.fromSubject', 'certain',
          'agrees with the subject of the clause it modifies'));
        if (purpose.number === 'Plur') {
          feats.set('Number', decide('Plur', 'number.fromSubject', 'certain',
            'agrees with the subject of the clause it modifies'));
        }
        if (effectiveAspect) feats.set('Aspect', effectiveAspect);
        plan.push({ token, entry, ranked, aspect, feats, notes });
        continue;
      }

      if (auxRoleForHead.get(token.id) === 'conditional') {
        conditionalVerbs.add(token.id);
        feats.set('VerbForm', decide('Fin', 'verbform.finite', 'certain', 'finite verb'));
        feats.set(
          'Tense',
          decide('Past', 'mood.conditional', 'certain', 'the conditional uses the l-participle'),
        );
        feats.set(
          'Person',
          decide(
            subjectPerson(token, sentence),
            'person.fromSubject',
            'certain',
            'taken from the subject, which is more reliable than the auxiliary',
          ),
        );
        const condNumber = subjectNumber(token, sentence, src['Number']);
        if (condNumber === 'Plur') {
          feats.set('Number', decide('Plur', 'number.fromSubject', 'certain', 'plural subject'));
        }
        if (effectiveAspect) feats.set('Aspect', effectiveAspect);
        plan.push({ token, entry, ranked, aspect, feats, notes });
        continue;
      }

      if (auxRoleForHead.get(token.id) === 'future') {
        // The future is periphrastic: budu carries person, the verb stays an
        // infinitive. A bare perfective present must never be used instead -
        // South Slavic speakers read it as a true present.
        feats.set(
          'VerbForm',
          decide('Inf', 'future.periphrastic', 'certain', 'infinitive after bųdų (periphrastic future)'),
        );
        if (effectiveAspect) feats.set('Aspect', effectiveAspect);
        plan.push({ token, entry, ranked, aspect, feats, notes });
        continue;
      }

      // The complement of a modal is an infinitive, and unlike "want TO go" it
      // carries no `to`, so the test below would miss it and conjugate it:
      // "Ja mogu plavaju" instead of "Ja mogu plavati".
      const modalId = modalOfHead.get(token.id);
      if (modalId !== undefined) {
        const modalForm = sentence.tokens.find((t) => t.id === modalId)?.form ?? 'the modal';
        feats.set(
          'VerbForm',
          decide('Inf', 'verbform.modalComplement', 'certain', `infinitive after the modal "${modalForm}"`),
        );
        if (effectiveAspect) feats.set('Aspect', effectiveAspect);
        plan.push({ token, entry, ranked, aspect, feats, notes });
        continue;
      }

      // An infinitive complement ("want TO GO") must stay an infinitive rather
      // than being conjugated: gold is "hoču idti", not "hoču ide".
      // `csubj` is the same thing in subject position - "it is important TO
      // READ" - where conjugating it gave "Jest važno čitaje".
      //
      // The `mark` requirement is ENGLISH-specific: English writes its
      // infinitive with "to", so the particle is the reliable signal. Russian
      // writes a bare infinitive and states `VerbForm=Inf` on it directly, so
      // requiring a marker conjugated it - "Мы должны уйти" became "My dolžni
      // ujdemo" instead of "My dolžni ujdti". Where the source's morphology is
      // trusted for case and aspect, it is trusted for this too.
      const infinitiveNeedsMarker = !adapter.copyAspect;
      const isInfinitiveComplement =
        token.feats['VerbForm'] === 'Inf' &&
        (token.deprel === 'xcomp' ||
          token.deprel === 'ccomp' ||
          token.deprel === 'acl' ||
          token.deprel === 'csubj') &&
        (!infinitiveNeedsMarker ||
          sentence.tokens.some((t) => t.head === token.id && t.deprel === 'mark'));
      if (isInfinitiveComplement) {
        feats.set(
          'VerbForm',
          decide('Inf', 'verbform.infinitive', 'certain', 'infinitive complement of the main verb'),
        );
        if (effectiveAspect) feats.set('Aspect', effectiveAspect);
        plan.push({ token, entry, ranked, aspect, feats, notes });
        continue;
      }

      feats.set('VerbForm', decide('Fin', 'verbform.finite', 'certain', 'finite verb'));
      feats.set('Mood', decide('Ind', 'mood.indicative', 'default', 'indicative'));
      const perfect = auxRoleForHead.get(token.id) === 'perfect';
      const tense = modalPlan
        ? modalPlan.tense
        : perfect || src['Tense'] === 'Past'
          ? 'Past'
          : 'Pres';
      feats.set(
        'Tense',
        decide(
          tense,
          perfect ? 'tense.perfectAsPast' : 'tense.copy',
          'certain',
          modalPlan
            ? `English marks the tense on the modal itself ("${token.form}")`
            : perfect
              ? 'English perfect maps to the single Interslavic past'
              : `copied from the source${via}`,
        ),
      );
      /**
       * The subject is read from the token itself, even for a modal. UD hangs
       * the subject off the MAIN VERB rather than the modal, which used to
       * need a one-step walk to `token.head` here - but `subjectPerson` and
       * `subjectNumber` now both fall back to `subjectOfClause`, which walks
       * up to eight hops looking for an `nsubj`. That covers the modal case
       * and more, so the walk was removed: measured, it changed nothing across
       * 126 English fixtures, and a mutation audit flagged it as uncovered
       * precisely because it no longer does anything.
       */
      feats.set(
        'Person',
        decide(
          subjectPerson(token, sentence),
          'person.fromSubject',
          'certain',
          'taken from the subject, which is more reliable than the auxiliary',
        ),
      );
      const number = subjectNumber(token, sentence, src['Number']);
      if (number === 'Plur') {
        feats.set(
          'Number',
          decide('Plur', 'number.fromSubject', 'certain', `plural subject${via}`),
        );
      }
      if (effectiveAspect) feats.set('Aspect', effectiveAspect);
    }

    plan.push({ token, entry, ranked, aspect, feats, notes });
  }

  return plan;
}
