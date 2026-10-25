import {
  decide,
  type Case,
  type Decision,
  type ParsedSentence,
  type UdToken,
} from '../../types/index.ts';
import type { GlossedFeature, GlossedWord, PlanNode, Translation } from './result.ts';
import {
  baseDeprel,
  phraseOf,
  pronounLemmaFor,
  subjectNumber,
  subjectOfClause,
  subjectPerson,
  conjunctsOf,
  sentencePunctuation,
} from './tree.ts';
import { glossFeature, matchedGloss, prepositionReason, unknownWords } from './gloss.ts';
import { renderStage } from './stages/render.ts';
import { realiseStage } from './stages/realise.ts';
import { numeralGovernmentStage } from './stages/numeral-government.ts';
import { agreementStage } from './stages/agreement.ts';
import type { StageContext } from './stages/context.ts';
import { predicateAgreementStage } from './stages/predicate-agreement.ts';
import { copulaStage } from './stages/copula.ts';
import { pastParticipleStage } from './stages/past-participle.ts';
import {
  Lexicon,
  normalizeGloss,
  normalizeRussian,
  rank,
  type Entry,
  type Gloss,
} from '../../lexicon/src/reader.ts';
import { realize } from '../../morph/src/realize.ts';
import { compared, type Degree } from '../../morph/src/comparison.ts';
import { pastPassiveParticiple } from '../../morph/src/participles.ts';
import { render, toStandard, type Orthography } from '../../morph/src/orthography.ts';
import type { FullFormIndex } from '../../lexicon/src/full-forms.ts';
import { resolveAspect, type AspectOutcome } from './resolvers/aspect.ts';
import { AGREEING_DEPRELS, resolveCase } from './resolvers/case.ts';
import { adapterFor } from './source/adapters.ts';
import { planPreposition, type PrepPlan } from './resolvers/preposition.ts';
import { CASE_BEARING, findPlannedPrep, isArticle, type VerbGovernment } from './plans.ts';
import { contextWordsOf } from './gloss.ts';
import { lexemeStage } from './stages/lexeme.ts';
import { planPhrasalVerbs } from './stages/phrasal-verbs.ts';
import { planPrepositions } from './stages/prepositions.ts';
import { planAuxiliaries } from './stages/auxiliaries.ts';
import { planNegation } from './stages/negation.ts';
import { planVerbGovernment } from './stages/verb-government.ts';
import { governmentFor, numeralValue } from '../../rules/src/numerals.ts';
import { isExpletiveSubject } from '../../rules/src/expletives.ts';
import { splitMultiword } from '../../lexicon/src/steen/split-lemmas.ts';
import { antecedentOf, isOneAnaphor } from '../../rules/src/anaphora.ts';
import {
  auxiliaryRole,
  conditionalAuxiliary,
  futureAuxiliary,
  type AuxiliaryRole,
} from '../../rules/src/auxiliaries.ts';
import { modalFor, type ModalPlan } from '../../rules/src/modals.ts';
import {
  hasCliticForm,
  isReflexivePronoun,
  REFLEXIVE_POSSESSIVE,
  REFLEXIVE_PRONOUN,
} from '../../rules/src/reflexives.ts';
import {
  COMPLEMENTIZER,
  personalPronounGender,
  personalPronounLemma,
  personalPronounNumber,
  prepCaseFor,
  RELATIVE_PRONOUN,
} from '../../rules/src/pronouns.ts';
import { functionWordFor } from '../../rules/src/function-words.ts';
import { codeBelongsToPreposition } from '../../rules/src/prepositions.ts';
import { negativeCounterparts } from '../../rules/src/negation.ts';
import { rewriteSource } from '../../rules/src/source-rewrites.ts';

/**
 * ORDERING CONSTRAINTS - these are load-bearing, do not reorder casually:
 *
 *  1. Aspect is resolved BEFORE the lexeme is finalised. Aspect is a FILTER on
 *     candidates, not a feature applied afterwards: "give" ranks dati (Perf,
 *     freq 7606) above davati (Imp, freq 6395), and a perfective present reads
 *     as a future in Interslavic.
 *  2. ALL features are resolved before ANY word is realised, because agreement
 *     has to read features off its head. Phase A resolves, phase B propagates
 *     agreement, phase C realises.
 *  3. Realisation runs after linearisation once forms depend on linear
 *     adjacency to a preposition (not yet exercised).
 */




export type { GlossedFeature, GlossedWord, Translation } from './result.ts';






/**
 * Grammatical person, taken from the SUBJECT rather than from the verb or its
 * auxiliary.
 *
 * English auxiliaries are an unreliable source and Stanza demonstrably errs on
 * them: in "Where did father buy that book?" it tags `did` as Person=2, which
 * produced "Kde otec jesi kupil..." - a 2nd-person auxiliary for a 3rd-person
 * subject. A nominal subject is 3rd person by definition, so the subject is
 * both simpler and safer.
 */


/**
 * Grammatical number for a verb, taken from its SUBJECT - the same argument as
 * `subjectPerson`, and for two concrete reasons:
 *
 *  - a subject pronoun's number is a property of the Interslavic lemma, not of
 *    the English word: "you" is unmarked, but `vy` is plural, so "You see me"
 *    needs `vidite` and not `vidiš`;
 *  - a plural NOMINAL subject often leaves the English verb unmarked, so
 *    reading the verb's own features made "The women read books" singular.
 */


/**
 * The base of a UD relation, without its subtype: `nummod:gov` -> `nummod`.
 * Russian uses subtypes where English does not, and an exact comparison made
 * the numeral phase skip Russian entirely - "два брата" kept the Russian
 * paucal genitive and the numeral never agreed in gender ("dvě brata").
 */

/** A passive clause, where the patient is the subject rather than an object. */
function isPassiveClause(verb: UdToken, sentence: ParsedSentence): boolean {
  if (verb.feats['Voice'] === 'Pass') return true;
  return sentence.tokens.some(
    (t) => t.head === verb.id && (t.deprel === 'nsubj:pass' || t.deprel === 'aux:pass'),
  );
}





export interface TranslateOptions {
  orthography?: Orthography;
  /**
   * Full-form lexicon used to check that every emitted word is a real
   * Interslavic form. Without it, `validation` can only report whether the
   * morphology library returned something - which is NOT the same claim.
   */
  validator?: FullFormIndex;
}

export function translate(
  parsed: ParsedSentence,
  lex: Lexicon,
  opts: TranslateOptions = {},
): Translation {
  // "take photos" -> "photograph", "nobody but myself" -> "only myself":
  // rewritten before anything reads the tree (rules/src/source-rewrites.ts).
  const { sentence, absorbed } = rewriteSource(parsed);
  const orth: Orthography = opts.orthography ?? 'standard';
  const adapter = adapterFor(sentence);
  const dropped: Translation['dropped'] = [...absorbed];
  const unknown: string[] = [];

  /**
   * The subject of the clause a token sits in, found by walking up to a verb
   * that has one. Needed for `svoj`, which depends on whether the possessor
   * IS the subject.
   */

  /**
   * True when this token sits in a clause whose verb is negated, found by
   * walking up to a verb that `ne` was planned for. Needed because Interslavic
   * requires the ni- series exactly there.
   */
  const inNegatedClause = (from: UdToken): boolean => {
    let current: UdToken | undefined = from;
    for (let hops = 0; current !== undefined && hops < 8; hops++) {
      if (negatedClauses.has(current.id)) return true;
      const here: UdToken = current;
      current = sentence.tokens.find((t) => t.id === here.head);
    }
    return false;
  };

  /** A nominal subject is third person by definition; a pronoun states it. */
  const personOf = (t: UdToken): string =>
    t.upos === 'PRON' ? (t.feats['Person'] ?? '3') : '3';

  /**
   * True when this possessive's possessor is the subject of its clause, which
   * is the condition the grammar gives for `svoj`.
   */
  const possessorIsSubject = (token: UdToken): boolean => {
    if (token.feats['Poss'] !== 'Yes') return false;
    const subject = subjectOfClause(token, sentence);
    if (!subject || subject.id === token.id) return false;
    return (
      personOf(token) === personOf(subject) &&
      (token.feats['Number'] ?? 'Sing') === (subject.feats['Number'] ?? 'Sing')
    );
  };


  const contextWords = contextWordsOf(sentence);

  // ---- Phase 0-: phrasal verbs -------------------------------------------
  const { phrasalVerbs, phrasalParticles } = planPhrasalVerbs(sentence, lex);

  // ---- Phase 0: plan prepositional phrases -------------------------------
  const { prepPlans, governedCase, deletedPreps } = planPrepositions(
    sentence,
    lex,
    phrasalVerbs,
    phrasalParticles,
  );

  // ---- Phase 0b: auxiliaries ---------------------------------------------
  const {
    futureForms,
    pastAuxiliaries,
    insertedPrepositions,
    pendingPrepositions,
    insertedCopulas,
    droppedAux,
    auxFeatsForHead,
    auxRoleForHead,
    futureAuxToken,
    conditionalVerbs,
    purposeClauses,
    finitePurposeMarks,
    finitePurposeCarriers,
    imperatives,
    optativeMarkers,
    optativeVerbs,
    modalPlans,
    modalOfHead,
    prepositionTargets,
    analyticSuperlatives,
  } = planAuxiliaries(sentence, adapter, personOf);

  // ---- Phase 0c: negation -------------------------------------------------
  const { negationParticles, negatedVerbs, negatedClauses } = planNegation(sentence, modalOfHead);

  /**
   * `aux:pass` is the passive "be", and like an ordinary copula it has to
   * survive and be conjugated: the page's own passive is "jest ljubjena".
   * Treated as progressive "be" it was simply deleted.
   */
  const isCopula = (t: UdToken): boolean => t.deprel === 'cop' || t.deprel === 'aux:pass';
  /** Verb features are resolved for real verbs and for a surviving copula. */
  const needsVerbFeatures = (t: UdToken): boolean =>
    t.upos === 'VERB' || isCopula(t) || modalPlans.has(t.id);

  /**
   * Rank this token's dictionary candidates. Factored out so Phase 0d and
   * Phase A cannot drift: both must agree on WHICH verb was chosen, or a
   * government code would be read off a lexeme we did not actually use.
   */
  /**
   * The lemma to look up, with a fused reflexive clitic removed. Stanza
   * lemmatises "читается" as `читаться`, which is no dictionary headword, so
   * the word came through untranslated; the base verb is, and Interslavic
   * writes the clitic as a separate `se`.
   *
   * Only applied when stripping actually finds a verb, so a lemma that merely
   * ends in those letters is left alone.
   */
  /**
   * An English "-ly" adverb the dictionary does not list, reached through its
   * adjective: "Adverbs can be derived from adjectives by using the ending -o
   * (-e after a soft consonant). In other words, they are identical to the
   * neuter singular: dobro, svěže" (adjectives page). "the Sun shined out
   * warmly" left "warmly" untranslated; `teply` gives `teplo`. Only when the
   * adverb itself finds nothing, and only to an adjective that exists.
   */
  const adverbBase = (token: UdToken): string | null => {
    if (sentence.lang !== 'en' || token.upos !== 'ADV') return null;
    const word = token.lemma.toLowerCase();
    if (!word.endsWith('ly') || lex.lookup(word, 'en').length > 0) return null;
    const stem = word.slice(0, -2);
    for (const candidate of [stem, `${stem.replace(/i$/, 'y')}`, `${stem}e`, stem.replace(/l$/, 'le')]) {
      if (lex.lookup(candidate, 'en').some((e) => e.pos.upos === 'ADJ')) return candidate;
    }
    return null;
  };

  const lookupLemmaOf = (token: UdToken): string => {
    /**
     * A plural noun whose OWN form the dictionary glosses is looked up by that
     * form. English lemmatises "people" to "person", and the dictionary keeps
     * the suppletive plural as an entry of its own - `ljudi` "people", as the
     * nouns page has it ("člověk ... pl. ljudi „people""); "years" likewise
     * reaches `lěta` "years", and the corpus writes "deset lět" (5 Wp/isv
     * hits, "deset rokov" none). Gated on the dictionary, so an ordinary
     * plural ("books") falls through to its lemma.
     */
    if (token.upos === 'NOUN' && token.feats['Number'] === 'Plur' && sentence.lang === 'en') {
      const form = token.form.toLowerCase();
      if (form !== token.lemma.toLowerCase() && lex.lookup(form, 'en').some((e) => e.pos.upos === 'NOUN')) {
        return form;
      }
    }
    const base = adverbBase(token);
    if (base) return base;
    if (token.upos !== 'VERB') return token.lemma;
    /**
     * Only as a FALLBACK. Many reflexive lemmas are dictionary headwords in
     * their own right and match something better: `нравиться` is `podobati sę`,
     * `бояться` is `bojati sę`, `учиться` is `učiti sę`. Stripping first turned
     * `нравиться` into `нравить`, which found the weaker `prijati`.
     */
    if (lex.lookup(token.lemma, sentence.lang).some((e) => e.pos.upos === 'VERB')) {
      return token.lemma;
    }
    for (const suffix of adapter.reflexiveVerbSuffixes) {
      if (!token.lemma.toLowerCase().endsWith(suffix)) continue;
      const base = token.lemma.slice(0, -suffix.length);
      if (base.length > 2 && lex.lookup(base, sentence.lang).some((e) => e.pos.upos === 'VERB')) {
        return base;
      }
    }
    return token.lemma;
  };

  /**
   * Verbs that need the reflexive clitic written after them: either the source
   * fused one onto the word, or it marks the verb middle/passive, which the
   * syntax page expresses reflexively ("Pica dělaje se").
   */
  /**
   * The test is the SOURCE FORM's own suffix, not `Voice`. Stanza marks
   * `Voice=Mid` on plenty of verbs that carry no clitic at all - "стала" is
   * Mid - so keying on it added a reflexive to "Ona stala lěkarem". The
   * suffix is on the word or it is not.
   *
   * Restricted to a FINITE verb: a participle is the other way of expressing
   * the passive, so Russian "была приготовлена" must not take a clitic either.
   */
  const needsReflexiveClitic = new Set<number>();
  for (const token of sentence.tokens) {
    if (token.upos !== 'VERB' || token.feats['VerbForm'] !== 'Fin') continue;
    const form = token.form.trim().toLowerCase();
    if (adapter.reflexiveVerbSuffixes.some((x) => form.endsWith(x))) {
      needsReflexiveClitic.add(token.id);
    }
  }

  const rankedFor = (token: UdToken, aspect: AspectOutcome | null): Entry[] =>
    rank(lex.lookup(lookupLemmaOf(token), sentence.lang), {
      upos: token.upos,
      gloss: lookupLemmaOf(token),
      lang: sentence.lang,
      sourceIsSingleWord: !/\s/.test(token.form.trim()),
      contextWords,
      // The dictionary marks pronoun subtypes and UD marks PronType; both were
      // unread. See RankContext.pronType.
      ...(token.feats['PronType'] ? { pronType: token.feats['PronType'] } : {}),
      /**
       * Transitivity is only evidence in an ACTIVE clause. A passive has no
       * direct object because the patient was promoted to subject, not because
       * the verb is intransitive - so "The food was prepared by my
       * grandmother" penalised every `v.tr.` candidate and handed the sentence
       * to the reflexive `sbirati sę`: "Jeda byla sbirati se od mojej baby".
       */
      ...(token.upos === 'VERB' && !isPassiveClause(token, sentence)
        ? {
            hasDirectObject: sentence.tokens.some(
              (t) => t.head === token.id && (t.deprel === 'obj' || t.deprel === 'ccomp'),
            ),
          }
        : {}),
      ...(aspect ? { aspect: aspect.decision.value } : {}),
    });

  // ---- Phase 0d: verb government ----------------------------------------
  const verbGovernedCase = planVerbGovernment(sentence, rankedFor, needsVerbFeatures);

  // ---- Phase A: lexeme + own features -----------------------------------
  const punctuation = sentencePunctuation(sentence);
  const plan = lexemeStage({
    sentence, adapter, lex, dropped, unknown,
    phrasalVerbs, phrasalParticles,
    prepPlans, governedCase, deletedPreps,
    droppedAux, auxFeatsForHead, auxRoleForHead, futureForms, futureAuxToken,
    conditionalVerbs, purposeClauses, finitePurposeMarks, finitePurposeCarriers,
    imperatives, optativeVerbs, modalPlans, modalOfHead, analyticSuperlatives,
    negationParticles, verbGovernedCase,
    contextWords,
    personOf, possessorIsSubject, inNegatedClause, needsVerbFeatures, rankedFor,
  });

  const byTokenId = new Map(plan.map((n) => [n.token.id, n]));

  /**
   * The state the extracted stages share, assembled once. As more stages move
   * out this is built earlier; the fields it carries are the dependencies that
   * used to be invisible closure variables.
   */
  const ctx: StageContext = {
    sentence,
    adapter,
    lex,
    plan,
    byTokenId,
    insertedCopulas,
    pastAuxiliaries,
    conditionalVerbs,
  };

  // ---- Phase B1: numeral government -------------------------------------
  // Extracted to stages/numeral-government.ts.
  numeralGovernmentStage(ctx);


  // ---- Phase B: agreement propagation -----------------------------------
  // Extracted to stages/agreement.ts.
  agreementStage(ctx);


  // Extracted to stages/predicate-agreement.ts.
  predicateAgreementStage(ctx);

  // Extracted to stages/copula.ts.
  copulaStage(ctx);

  // Extracted to stages/past-participle.ts.
  pastParticipleStage(ctx);

  // ---- Phase C: realise -------------------------------------------------
  // Extracted to stages/realise.ts.
  const { words, surfaces } = realiseStage({
    sentence,
    lex,
    opts,
    orth,
    plan,
    dropped,
    punctuation,
    prepPlans,
    insertedPrepositions,
    pendingPrepositions,
    prepositionTargets,
    insertedCopulas,
    pastAuxiliaries,
    futureForms,
    imperatives,
    optativeVerbs,
    optativeMarkers,
    finitePurposeMarks,
    purposeClauses,
    needsReflexiveClitic,
    phrasalParticles,
    phrasalVerbs,
    negatedVerbs,
  });

  // ---- Phase D: linearise and render -------------------------------------
  // Extracted to stages/render.ts - the first step of splitting this function.
  return renderStage({
    sentence,
    surfaces,
    words,
    dropped,
    unknown,
    punctuation,
    orthography: orth,
    validated: opts.validator !== undefined,
  });
}
