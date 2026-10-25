import { decide, type ParsedSentence, type UdToken } from '../../../types/index.ts';
import { realize } from '../../../morph/src/realize.ts';
import {
  auxiliaryRole,
  conditionalAuxiliary,
  futureAuxiliary,
  type AuxiliaryRole,
} from '../../../rules/src/auxiliaries.ts';
import { modalFor, type ModalPlan } from '../../../rules/src/modals.ts';
import { personalPronounNumber } from '../../../rules/src/pronouns.ts';
import type { SourceAdapter } from '../source/adapters.ts';
import { baseDeprel, pronounLemmaFor, subjectNumber, subjectOfClause, subjectPerson } from '../tree.ts';

interface FormPersonNumber {
  form: string;
  person: string;
  number: string;
}

interface PersonNumber {
  person: string;
  number: string;
}

/**
 * Everything the auxiliary phase decides. The source's auxiliaries, modals and
 * degree words do not survive as words - Interslavic writes a future with
 * `budu`, a conditional with `by`, a superlative with `naj-` - so this phase
 * reads them, deletes them, and records what they meant for the stages that
 * build the actual forms.
 */
export interface AuxiliaryPlan {
  /** Head verb id -> the periphrastic future the source spells with "will". */
  futureForms: Map<number, FormPersonNumber>;
  /** Verb id -> the `byti` auxiliary a compound past needs beside its l-participle. */
  pastAuxiliaries: Map<number, FormPersonNumber>;
  /** Token id -> a preposition Interslavic requires where the source has none. */
  insertedPrepositions: Map<number, { form: string; because: string }>;
  /** The same, held back until the nominal it governs is known to survive. */
  pendingPrepositions: Map<number, { form: string; because: string }>;
  /** Token id -> the copula inserted before it. Filled by the copula stage. */
  insertedCopulas: Map<number, FormPersonNumber>;
  /** Source auxiliaries Interslavic does not write, so they are deleted. */
  droppedAux: Set<number>;
  /** Head verb id -> the features its deleted auxiliary carried. */
  auxFeatsForHead: Map<number, Record<string, string>>;
  /** Head verb id -> what that auxiliary was doing. */
  auxRoleForHead: Map<number, AuxiliaryRole>;
  /** Head verb id -> the future auxiliary's own token id. */
  futureAuxToken: Map<number, number>;
  /** Verbs that take the conditional `by`. */
  conditionalVerbs: Set<number>;
  /** Verb id -> the person and number of a `da by` purpose clause. */
  purposeClauses: Map<number, PersonNumber>;
  /** Mark token id -> person and number, where the purpose clause is finite. */
  finitePurposeMarks: Map<number, PersonNumber>;
  /** The verbs those finite purpose marks belong to. */
  finitePurposeCarriers: Set<number>;
  /** Verb id -> the person and number of its imperative. */
  imperatives: Map<number, PersonNumber>;
  /** Optative marker token id -> the verb it marks ("let him read"). */
  optativeMarkers: Map<number, number>;
  /** Verb id -> the number of its optative. */
  optativeVerbs: Map<number, { number: string }>;
  /** Modal token id -> the plan for rendering it. */
  modalPlans: Map<number, ModalPlan>;
  /** Main verb id -> its modal's token id. */
  modalOfHead: Map<number, number>;
  /** Nominals whose inserted preposition must be emitted, in source order. */
  prepositionTargets: number[];
  /** Adjectives whose superlative the source spells as a separate word. */
  analyticSuperlatives: Set<number>;
}

/** Read the source's auxiliaries, modals, imperatives and degree words. */
export function planAuxiliaries(
  sentence: ParsedSentence,
  adapter: SourceAdapter,
  personOf: (t: UdToken) => string,
): AuxiliaryPlan {
  // English do-support ("does not know") is an auxiliary with no Interslavic
  // equivalent: it must be DELETED, and the tense/person it carries moved onto
  // the main verb, which UD leaves as a bare infinitive.
  //
  // A copula ("water IS cold") is the opposite case: it is tagged AUX rather
  // than VERB, but it must survive and be conjugated like any verb. Without
  // this it received no verb features at all and tie-breaking picked an
  // imperfect form (běše) instead of jest.
  const futureForms = new Map<number, { form: string; person: string; number: string }>();
  /** byti forms that precede an l-participle in the 1st and 2nd person. */
  const pastAuxiliaries = new Map<number, { form: string; person: string; number: string }>();
  /**
   * A preposition the source expresses by case alone, emitted before the token
   * it governs. Russian marks the standard of comparison with a bare genitive -
   * "больше того дома" - and Interslavic uses `od` with the genitive, which is
   * how van Steenbergen writes it: "trěba jest uznati za silnějšego od
   * drugogo" (http://steen.free.fr/interslavic/northwind.html). Without it the
   * sentence read "Toj dom veče togo doma", with no word joining the two.
   */
  const insertedPrepositions = new Map<number, { form: string; because: string }>();
  /** Phrase heads whose inserted preposition is re-keyed once `plan` exists. */
  const pendingPrepositions = new Map<number, { form: string; because: string }>();
  const prepositionTargets: number[] = [];
  /** Predicate nodes needing a copula the source left out; see the adapter. */
  const insertedCopulas = new Map<number, { form: string; person: string; number: string }>();
  const droppedAux = new Set<number>();
  const auxFeatsForHead = new Map<number, Record<string, string>>();
  const auxRoleForHead = new Map<number, AuxiliaryRole>();
  /** The "will" token itself, which becomes the budu auxiliary. */
  const futureAuxToken = new Map<number, number>(); // head verb id -> aux token id
  /**
   * English modals. Unlike do-support they are NOT deleted: Interslavic has a
   * real verb for each (the dictionary marks them `v.aux.`), and it carries the
   * finite features while the main verb drops to the infinitive - "mogu
   * plavati". UD tags the modal AUX and leaves the main verb as the root.
   */
  /** Verbs in the conditional, which take the l-participle but not "jesm". */
  const conditionalVerbs = new Set<number>();
  /**
   * Purpose clauses: "Final clauses are translated by means of že or da
   * followed by the conditional: Turisti posětet Niderlandiju, že by
   * fotografovali tulipany."
   * http://steen.free.fr/interslavic/syntax.html
   *
   * English uses a bare infinitive ("...to take photos"), which was translated
   * as an infinitive complement and lost the construction entirely.
   */
  const purposeClauses = new Map<number, { person: string; number: string }>();
  /**
   * A FINITE final clause - "so that the kids will be healthy" - which has its
   * own subject and often a copula. The page gives both conjunctions without
   * distinguishing them ("by means of že or da"), so the structural split is a
   * convention of ours: `že` for a bare infinitive, `da` for a full clause,
   * which is how the page's own two examples are written.
   *
   * Keyed by the `mark` token, because replacing the mark in place puts
   * "da by" exactly where it belongs - before the clause's subject.
   */
  const finitePurposeMarks = new Map<number, { person: string; number: string }>();
  /** The token that carries the conditional in a finite final clause. */
  const finitePurposeCarriers = new Set<number>();
  /**
   * The optative: "When such a form is needed, the optative particle nehaj is
   * used: Nehaj umre! 'Let him die!' / Nehaj žive dolgo! 'May he live long!'"
   * http://steen.free.fr/interslavic/verbs.html
   *
   * Keyed by the token whose slot "nehaj" takes - the inverted "May"/"Let" -
   * with the verb it governs put into the third-person present. Both of the
   * page's examples drop the subject pronoun, which the verb's person already
   * carries.
   */
  /**
   * Imperatives. "The imperative has forms for the 2nd person singular, the
   * 1st person plural and the 2nd person plural: dělaj 'do!' (to one person,
   * informal), dělajmo 'let's do!', dělajte 'do!' (to more persons, or to one
   * person formal)."
   * http://steen.free.fr/interslavic/verbs.html
   *
   * English marks neither number nor register, so the 2nd plural is the right
   * default for the same reason `vy` is: the page gives it for "one person
   * formal" too. Without this, "Open the window" was realised as the
   * third-person present "otvarjaje".
   */
  const imperatives = new Map<number, { person: string; number: string }>();
  const optativeMarkers = new Map<number, number>(); // marker token id -> verb id
  const optativeVerbs = new Map<number, { number: string }>();
  const modalPlans = new Map<number, ModalPlan>(); // modal token id -> plan
  const modalOfHead = new Map<number, number>(); // main verb id -> modal token id

  if (sentence.lang === 'en') {
    for (const token of sentence.tokens) {
      if (token.upos !== 'AUX') continue;
      /**
       * A modal whose verb is left out - "as hard as he COULD" - heads its own
       * clause instead of hanging off a verb as `aux`. It is still the modal,
       * and van Steenbergen writes it as one: "tako močno kako mogl" (North
       * Wind and the Sun). Unplanned, it was emitted raw: "kak on could".
       */
      if (token.deprel !== 'aux') {
        const bare = modalFor(token.lemma);
        if (bare && !sentence.tokens.some((t) => t.id === token.head && t.deprel === 'aux')) {
          modalPlans.set(token.id, bare);
        }
        continue;
      }
      const modal = modalFor(token.lemma);
      if (modal) {
        modalPlans.set(token.id, modal);
        modalOfHead.set(token.head, token.id);
        continue;
      }

      const role = auxiliaryRole(token.lemma);
      if (!role) continue; // an unhandled modal falls through to plain lookup

      auxRoleForHead.set(token.head, role);
      auxFeatsForHead.set(token.head, token.feats);

      if (role === 'future' || role === 'conditional') {
        // Kept as a node, but rewritten into the budu / byh auxiliary.
        futureAuxToken.set(token.head, token.id);
      } else {
        droppedAux.add(token.id);
      }
    }
  }

  /**
   * The standard of comparison, where the source marks it by case alone.
   *
   * Only an `obl` in the GENITIVE whose head carries `Degree=Cmp` - that is
   * precise and does not touch ordinary objects. Stanza sometimes attaches the
   * standard to the verb as an `obj` instead ("читает быстрее меня"), which is
   * indistinguishable from a real direct object, so those are left alone.
   */
  if (adapter.copyCase) {
    for (const token of sentence.tokens) {
      if (!baseDeprel(token.deprel).startsWith('obl')) continue;
      if (token.feats['Case'] !== 'Gen') continue;
      // A preposition of its own already joins it: "на два года" hangs off the
      // comparative too, and added `od` as well - "na dva od roky".
      if (sentence.tokens.some((t) => t.head === token.id && t.deprel === 'case')) continue;
      const head = sentence.tokens.find((t) => t.id === token.head);
      if (head?.feats['Degree'] !== 'Cmp') continue;
      prepositionTargets.push(token.id);
      pendingPrepositions.set(token.id, {
        form: 'od',
        because:
          'the standard of comparison takes "od" with the genitive ' +
          '("uznati za silnějšego od drugogo")',
      });
    }
  }

  /**
   * An analytic superlative marker: the word is deleted and its adjective is
   * raised to `Degree=Sup`, which the comparison module turns into `naj-` plus
   * the comparative.
   */
  const analyticSuperlatives = new Set<number>(); // adjective token ids
  if (adapter.analyticSuperlative) {
    for (const token of sentence.tokens) {
      if (token.lemma.toLowerCase() !== adapter.analyticSuperlative) continue;
      const head = sentence.tokens.find((t) => t.id === token.head);
      if (head?.upos !== 'ADJ') continue;
      analyticSuperlatives.add(head.id);
      droppedAux.add(token.id);
    }
  }

  /**
   * A conditional particle, which UD marks `Mood=Cnd` on an auxiliary - so this
   * is a feature test rather than a lemma list. Russian "бы" is one, and it was
   * reaching the lexical path: "Если бы я знал, я бы пришёл" came out as
   * "Jestli by ja jesm znal ja by jesm prišel", with BOTH the conditional `by`
   * and the compound-past `jesm` beside each verb.
   *
   * Routed through the role English "would" already uses, which builds
   * byh/bys/by + l-participle and suppresses the compound-past auxiliary.
   */
  for (const token of sentence.tokens) {
    if (token.upos !== 'AUX' || token.deprel !== 'aux') continue;
    if (token.feats['Mood'] !== 'Cnd') continue;
    const head = sentence.tokens.find((t) => t.id === token.head);
    if (!head) continue;
    auxRoleForHead.set(head.id, 'conditional');
    auxFeatsForHead.set(head.id, head.feats);
    futureAuxToken.set(head.id, token.id);
  }

  /**
   * A source that builds its future from "be" plus an infinitive, which is the
   * same shape Interslavic uses. Routed through the machinery "will" already
   * uses, so it produces `budu` + infinitive.
   *
   * The infinitive is what distinguishes it: `быть` with a PARTICIPLE is the
   * past copula ("Еда была приготовлена"), which is translated lexically and
   * must not be touched.
   */
  if (adapter.futureAuxiliaryLemma) {
    for (const token of sentence.tokens) {
      if (token.upos !== 'AUX' || token.deprel !== 'aux') continue;
      if (token.lemma.toLowerCase() !== adapter.futureAuxiliaryLemma) continue;
      const head = sentence.tokens.find((t) => t.id === token.head);
      if (head?.feats['VerbForm'] !== 'Inf') continue;
      auxRoleForHead.set(head.id, 'future');
      auxFeatsForHead.set(head.id, token.feats);
      futureAuxToken.set(head.id, token.id);
    }
  }

  /**
   * English "be going to" is a future, and it was being translated literally:
   * "I am going to read" came out as "Ja idu čitati" - "I am walking to read".
   *
   * The pattern is unambiguous in the parse: `go` as a present participle with
   * a `be` auxiliary, governing an infinitive `xcomp` marked by "to". A literal
   * "I am going to London" has no such xcomp, so the two do not collide.
   *
   * It is routed through the same machinery as "will", which already builds the
   * periphrastic future the grammar requires.
   */
  if (sentence.lang === 'en') {
    for (const token of sentence.tokens) {
      if (token.lemma !== 'go' || token.upos !== 'VERB') continue;
      if (token.feats['VerbForm'] !== 'Part') continue;

      const beAux = sentence.tokens.find(
        (t) => t.head === token.id && t.deprel === 'aux' && t.lemma === 'be',
      );
      const infinitive = sentence.tokens.find(
        (t) =>
          t.head === token.id &&
          t.deprel === 'xcomp' &&
          t.feats['VerbForm'] === 'Inf' &&
          sentence.tokens.some((m) => m.head === t.id && m.deprel === 'mark'),
      );
      if (!beAux || !infinitive) continue;

      auxRoleForHead.set(infinitive.id, 'future');
      futureAuxToken.set(infinitive.id, token.id);
      droppedAux.add(beAux.id);
    }
  }

  if (sentence.lang === 'en') {
    for (const token of sentence.tokens) {
      if (token.deprel !== 'advcl' || token.feats['VerbForm'] !== 'Inf') continue;
      const to = sentence.tokens.find(
        (t) => t.head === token.id && t.deprel === 'mark' && t.lemma === 'to',
      );
      if (!to) continue;
      // The clause has no subject of its own, so it agrees with the subject of
      // the clause it modifies - "Turisti ... že by fotografovali".
      const subject = subjectOfClause(token, sentence);
      const pronoun = subject ? pronounLemmaFor(subject.feats, sentence) : null;
      purposeClauses.set(token.id, {
        person: subject ? personOf(subject) : '3',
        number: pronoun
          ? personalPronounNumber(pronoun)
          : subject?.feats['Number'] === 'Plur'
            ? 'Plur'
            : 'Sing',
      });
    }
  }

  if (sentence.lang === 'en') {
    for (const token of sentence.tokens) {
      if (token.deprel !== 'advcl') continue;
      const mark = sentence.tokens.find(
        (t) => t.head === token.id && t.deprel === 'mark' && /^(so|that|in)$/.test(t.lemma),
      );
      const subject = sentence.tokens.find(
        (t) => t.head === token.id && t.deprel.startsWith('nsubj'),
      );
      if (!mark || !subject) continue;

      const pronoun = pronounLemmaFor(subject.feats, sentence);
      const agreement = {
        person: personOf(subject),
        number: pronoun
          ? personalPronounNumber(pronoun)
          : subject.feats['Number'] === 'Plur'
            ? 'Plur'
            : 'Sing',
      };
      finitePurposeMarks.set(mark.id, agreement);

      // The conditional lands on the copula when there is one, else on the
      // clause's own predicate.
      const copula = sentence.tokens.find((t) => t.head === token.id && t.deprel === 'cop');
      finitePurposeCarriers.add(copula?.id ?? token.id);

      /**
       * "will" is replaced by the conditional, and a fixed "that" rides along
       * with its "so".
       *
       * "would" has to go the same way, and its conditional ROLE has to be
       * cleared as well: the purpose clause already supplies `by`, so leaving
       * it produced two - "da by děti BY byli zdrave" for "so that the kids
       * would be healthy".
       */
      for (const t of sentence.tokens) {
        if (t.head !== token.id) continue;
        if (t.deprel === 'aux') {
          const role = auxiliaryRole(t.lemma);
          if (role === 'future' || role === 'conditional') {
            droppedAux.add(t.id);
            if (role === 'conditional') {
              auxRoleForHead.delete(t.head);
              futureAuxToken.delete(t.head);
            }
          }
        }
        if (t.deprel === 'fixed' && t.head === mark.id) droppedAux.add(t.id);
      }
      for (const t of sentence.tokens) {
        if (t.head === mark.id && t.deprel === 'fixed') droppedAux.add(t.id);
      }
    }
  }

  /**
   * `Mood=Imp` is a UD feature both source languages provide, so this is not
   * English-specific - Russian "Открой окно" was being conjugated as a present
   * tense, "Otvoriš okno".
   *
   * The NUMBER is where they differ. English marks neither number nor register
   * on an imperative, so the page's form for "more persons, or one person
   * formal" is used. Russian distinguishes "Открой" (singular) from "Откройте"
   * (plural) outright, and overriding that would change the register.
   */
  for (const token of sentence.tokens) {
    if (token.feats['Mood'] !== 'Imp' || token.upos !== 'VERB') continue;
    if (sentence.lang === 'en' && token.lemma === 'let') continue;
    const number = adapter.marksSecondPersonNumber
      ? (token.feats['Number'] ?? 'Sing')
      : 'Plur';
    imperatives.set(token.id, { person: '2', number });
  }

  if (sentence.lang === 'en') {
    for (const token of sentence.tokens) {
      // "May he live long!" - the auxiliary PRECEDES the subject, which is what
      // separates the optative from the ordinary modal "He may live long".
      if (token.lemma === 'may' && token.deprel === 'aux') {
        const subject = sentence.tokens.find(
          (t) => t.head === token.head && t.deprel.startsWith('nsubj'),
        );
        if (!subject || subject.id < token.id) continue;
        optativeMarkers.set(token.id, token.head);
        optativeVerbs.set(token.head, {
          number: subject.feats['Number'] === 'Plur' ? 'Plur' : 'Sing',
        });
        if (pronounLemmaFor(subject.feats, sentence)) droppedAux.add(subject.id);
        continue;
      }

      // "Let him go." - an imperative "let" with its own object and infinitive.
      if (token.lemma === 'let' && token.upos === 'VERB') {
        const object = sentence.tokens.find((t) => t.head === token.id && t.deprel === 'obj');
        const verb = sentence.tokens.find(
          (t) => t.head === token.id && t.deprel === 'xcomp' && t.feats['VerbForm'] === 'Inf',
        );
        if (!object || !verb) continue;

        /**
         * "Let us go" is the FIRST-PERSON PLURAL IMPERATIVE (`idmo`), which
         * Interslavic has a form for; the optative is for the third person,
         * which it does not ("Interslavic has no imperatives in the third
         * person. When such a form is needed, the optative particle nehaj is
         * used"). Without this split, "Let us go" became "Nehaj ide".
         */
        if ((object.feats['Person'] ?? '3') === '1') {
          imperatives.set(verb.id, { person: '1', number: 'Plur' });
          droppedAux.add(token.id);
          droppedAux.add(object.id);
          continue;
        }
        if ((object.feats['Person'] ?? '3') !== '3') continue;
        optativeMarkers.set(token.id, verb.id);
        optativeVerbs.set(verb.id, {
          number: object.feats['Number'] === 'Plur' ? 'Plur' : 'Sing',
        });
        if (pronounLemmaFor(object.feats, sentence)) droppedAux.add(object.id);
      }
    }
  }

  return {
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
  };
}
