import type { ParsedSentence, UdToken } from '../../types/index.ts';
import { fixMixedScript } from './mixed-script.ts';
import { rewriteUkrainian, rewriteVerblessOrphan } from './ukrainian-rewrites.ts';

/**
 * Rewrites of the English parse into what it MEANS, applied once before any
 * stage reads the tree. Each is a construction a grammar page translates as a
 * whole, which word-by-word transfer cannot reach.
 */

/**
 * English says some actions with a light verb and a noun where Interslavic has
 * one verb:
 *
 *   "Tourists visit the Netherlands to take photos of the tulips."
 *   "Turisti posětet Niderlandiju, že by fotografovali tulipany."
 *   http://steen.free.fr/interslavic/syntax.html
 *
 * The dictionary has the verb (`fotografovati` "photograph") but no gloss for
 * the English phrase, so neither the phrasal-verb stage nor word-by-word
 * lookup can reach it: "take photos" came out as "brali fotografije".
 *
 * Only phrases with a cited Interslavic verb are listed. `as` is the English
 * gloss of that verb in the dictionary.
 */
const LIGHT_VERBS: { verb: string; objects: string[]; as: string; evidence: string }[] = [
  {
    verb: 'take',
    objects: ['photo', 'photograph', 'picture'],
    as: 'photograph',
    evidence: '"že by fotografovali tulipany", syntax page',
  },
  /**
   * "made a decision" was "sdělal rěšenje", a calque; the dictionary's verb
   * for it is `rěšiti` "decide", and the corpus uses it so: "on rěšil ostati".
   */
  {
    verb: 'make',
    objects: ['decision'],
    as: 'decide',
    evidence: '"on rěšil ostati i čekati na njego" - Wp/isv/Džok (pes); dictionary rěšiti "decide"',
  },
  /**
   * "have" a meal is to eat it, and the dictionary has a verb for each meal,
   * glossed exactly so: `snědati` "eat breakfast", `obědati` "dine, eat
   * lunch", `večerjati` "eat dinner, eat supper". "We have breakfast" was "My
   * imajemo snědanje".
   */
  {
    verb: 'have',
    objects: ['breakfast'],
    as: 'eat breakfast',
    evidence: 'dictionary: snědati "eat breakfast"',
  },
  {
    verb: 'have',
    objects: ['lunch'],
    as: 'eat lunch',
    evidence: 'dictionary: obědati "dine, eat lunch"',
  },
  {
    verb: 'have',
    objects: ['dinner', 'supper'],
    as: 'eat dinner',
    evidence: 'dictionary: večerjati "eat dinner, eat supper"',
  },
];

export interface SourceRewrite {
  sentence: ParsedSentence;
  /** Source words the single verb absorbs, with the reason, for the gloss. */
  absorbed: { form: string; why: string }[];
}

/**
 * Rewrite the parse so the light verb becomes the full verb and what the noun
 * was "of" becomes its object: take -> photograph, "photos of the tulips" ->
 * obj "tulips". Declined - the parse is returned untouched - when the noun
 * carries anything else (an adjective, a possessor), because absorbing the
 * noun would lose it.
 */
export function rewriteLightVerbs(sentence: ParsedSentence): SourceRewrite {
  if (sentence.lang !== 'en') return { sentence, absorbed: [] };
  const children = (t: UdToken) => sentence.tokens.filter((c) => c.head === t.id);
  const removed = new Set<number>();
  const changed = new Map<number, Partial<UdToken>>();
  const absorbed: SourceRewrite['absorbed'] = [];

  for (const verb of sentence.tokens) {
    if (verb.upos !== 'VERB') continue;
    // One verb can lead several rules ("have" breakfast / lunch / dinner).
    const objectOf = (r: (typeof LIGHT_VERBS)[number]) =>
      children(verb).find((c) => c.deprel === 'obj' && r.objects.includes(c.lemma.toLowerCase()));
    const rule = LIGHT_VERBS.find((r) => r.verb === verb.lemma.toLowerCase() && objectOf(r));
    if (!rule) continue;
    const noun = objectOf(rule)!;

    const ofPhrases = children(noun).filter(
      (c) => c.deprel === 'nmod' && children(c).some((p) => p.deprel === 'case' && p.lemma.toLowerCase() === 'of'),
    );
    const rest = children(noun).filter((c) => c.deprel !== 'det' && !ofPhrases.includes(c));
    if (rest.length > 0 || ofPhrases.length > 1) continue;

    const why = `"${verb.form} ${noun.form}" is one Interslavic verb (${rule.evidence})`;
    changed.set(verb.id, { lemma: rule.as });
    for (const t of [noun, ...children(noun).filter((c) => c.deprel === 'det')]) {
      removed.add(t.id);
      absorbed.push({ form: t.form, why });
    }
    const object = ofPhrases[0];
    if (object) {
      changed.set(object.id, { head: verb.id, deprel: 'obj' });
      for (const p of children(object).filter((c) => c.deprel === 'case')) {
        removed.add(p.id);
        absorbed.push({ form: p.form, why: `the object of "${rule.as}" takes no preposition` });
      }
    }
  }

  if (removed.size === 0) return { sentence, absorbed };
  return {
    sentence: {
      ...sentence,
      tokens: sentence.tokens
        .filter((t) => !removed.has(t.id))
        .map((t) => ({ ...t, ...changed.get(t.id) })),
    },
    absorbed,
  };
}

/**
 * "nobody but myself" means "only myself", and Interslavic says it that way,
 * with no negation at all:
 *
 *   "Ja myju jedino sebe „I wash nobody but myself""
 *   http://steen.free.fr/interslavic/pronouns.html
 *
 * Translated word by word it became "Ja ne myju nikogo ale se" - "I do not
 * wash anybody, but myself". The negative pronoun is turned into "only" on
 * the exception, which takes over its place in the clause, and "but" goes.
 */
export function rewriteExceptives(sentence: ParsedSentence): SourceRewrite {
  if (sentence.lang !== 'en') return { sentence, absorbed: [] };
  const removed = new Set<number>();
  const changed = new Map<number, Partial<UdToken>>();
  const absorbed: SourceRewrite['absorbed'] = [];

  for (const negative of sentence.tokens) {
    if (negative.feats['PronType'] !== 'Neg' || negative.upos !== 'PRON') continue;
    const exceptions = sentence.tokens.filter((t) => t.head === negative.id && t.deprel === 'conj');
    if (exceptions.length !== 1) continue;
    const exception = exceptions[0]!;
    const but = sentence.tokens.find(
      (t) => t.head === exception.id && t.deprel === 'cc' && t.lemma.toLowerCase() === 'but',
    );
    if (!but) continue;

    changed.set(exception.id, { head: negative.head, deprel: negative.deprel });
    changed.set(negative.id, {
      lemma: 'only', upos: 'ADV', xpos: 'RB', feats: {}, head: exception.id, deprel: 'advmod',
    });
    removed.add(but.id);
    absorbed.push({
      form: but.form,
      why: `"${negative.form} but ${exception.form}" means "only ${exception.form}" - "Ja myju jedino sebe" (pronouns page)`,
    });
  }

  if (removed.size === 0) return { sentence, absorbed };
  return {
    sentence: {
      ...sentence,
      tokens: sentence.tokens
        .filter((t) => !removed.has(t.id))
        .map((t) => ({ ...t, ...changed.get(t.id) })),
    },
    absorbed,
  };
}

/** Every rewrite, in order. Each returns the parse untouched when it declines. */
/**
 * Every "буд-" form of быть is FUTURE - буду, будешь, будет, будем, будете,
 * будут - but Stanza tags "Я буду с тобой" as Tense=Pres, and the copula came
 * out present: "Ja jesm s toboju" for "I will be with you". A fact of Russian
 * morphology, corrected before anything reads the tense.
 */
const FUTURE_COPULA: Record<string, { lemma: string; forms: RegExp; aspectTagged: boolean }> = {
  ru: { lemma: 'быть', forms: /^буд/i, aspectTagged: true },
  /**
   * Ukrainian conjugates the same stem: буду, будеш, буде, будемо, будете,
   * будуть. Its parser (UD Ukrainian-IU) does not tag aspect reliably: it marks
   * "прочитаю" Aspect=Imp and the plain present "прокидаюся" Tense=Fut, so a
   * perfective future is recognised by the dictionary's aspect alone.
   */
  uk: { lemma: 'бути', forms: /^буд/i, aspectTagged: false },
};

export function correctRussianFuture(sentence: ParsedSentence): ParsedSentence {
  const copula = FUTURE_COPULA[sentence.lang];
  if (!copula) return sentence;
  return {
    ...sentence,
    tokens: sentence.tokens.map((t) =>
      t.lemma.toLowerCase() === copula.lemma && copula.forms.test(t.form) && t.feats['Tense'] !== 'Fut'
        ? { ...t, feats: { ...t.feats, Tense: 'Fut' } }
        : t,
    ),
  };
}

/**
 * "towards one another" is "jedin k drugomu": the preposition goes INSIDE the
 * reciprocal, governing its second half - van Steenbergen's UDHR "imajųt
 * postųpati jedin k drugomu", his Tower of Babel "I oni govorili jedin k
 * drugomu". English puts the preposition first and parses "one another" as
 * one word ("one" + fixed "another"), so the parse is reordered to the
 * Interslavic shape: "one" stands alone, then the preposition, then
 * "another" as its object. Both halves are marked reciprocal (PronType=Rcp),
 * which is what makes them the masculine formula.
 */
export function rewriteReciprocalPreposition(sentence: ParsedSentence): ParsedSentence {
  if (sentence.lang !== 'en') return sentence;
  const one = sentence.tokens.find(
    (t) =>
      t.lemma.toLowerCase() === 'one' &&
      sentence.tokens.some((f) => f.head === t.id && f.deprel === 'fixed' && f.lemma.toLowerCase() === 'another' && f.id === t.id + 1) &&
      sentence.tokens.some((p) => p.head === t.id && p.deprel === 'case' && p.id === t.id - 1),
  );
  if (!one) return sentence;
  const prep = sentence.tokens.find((p) => p.head === one.id && p.deprel === 'case')!;
  const another = sentence.tokens.find((f) => f.head === one.id && f.deprel === 'fixed')!;
  const rcp = (feats: Record<string, string>) => ({ ...feats, PronType: 'Rcp' });
  const tokens = sentence.tokens.map((t) => {
    if (t.id === one.id) return { ...t, id: prep.id, head: another.id, deprel: 'dep', feats: rcp(t.feats) };
    if (t.id === prep.id) return { ...t, id: one.id, head: another.id };
    if (t.id === another.id) return { ...t, head: one.head, deprel: one.deprel, upos: 'PRON', feats: rcp(t.feats) };
    return t;
  });
  return { ...sentence, tokens: tokens.sort((a, b) => a.id - b.id) };
}

/**
 * "o'clock" only marks a number as a clock time, which the number and its "at"
 * already say; Interslavic has no such word, and the corpus writes the bare
 * time: "umrl ... v 9:15", "nadavano ... v 20:00" (Wp/isv). Left in, it came
 * through untranslated: "na 8 o'clock".
 */
export function rewriteOClock(sentence: ParsedSentence): SourceRewrite {
  if (sentence.lang !== 'en') return { sentence, absorbed: [] };
  const oclock = sentence.tokens.filter(
    (t) => t.lemma.toLowerCase() === "o'clock" &&
      sentence.tokens.some((h) => h.id === t.head && h.upos === 'NUM'),
  );
  if (oclock.length === 0) return { sentence, absorbed: [] };
  const ids = new Set(oclock.map((t) => t.id));
  return {
    sentence: { ...sentence, tokens: sentence.tokens.filter((t) => !ids.has(t.id)) },
    absorbed: oclock.map((t) => ({ form: t.form, why: 'only marks a clock time, which the number already says' })),
  };
}

/** The same repair on an already parsed sentence (frozen fixtures, other callers). */
export function fixMixedScriptTokens(sentence: ParsedSentence): ParsedSentence {
  const fix = (s: string) => fixMixedScript(s, sentence.lang);
  if (sentence.tokens.every((t) => fix(t.form) === t.form && fix(t.lemma) === t.lemma)) return sentence;
  return { ...sentence, tokens: sentence.tokens.map((t) => ({ ...t, form: fix(t.form), lemma: fix(t.lemma) })) };
}

/**
 * "used to" + infinitive is a past habit, which Slavic says with the
 * imperfective past alone: the verbs page gives the imperfective for "a habit
 * or a repeated action" - "Igor jezdil do Moskvy „Igor [always|often] went to
 * Moskow”". Word by word "I used to read books" was "Ja jesm upotrěbil čitati
 * knigy", "I made use of reading". The infinitive takes the place of "used",
 * in the past, marked habitual with UD's own `Aspect=Hab` (the aspect
 * resolver reads it as imperfective); "used" and "to" are absorbed.
 */
export function rewriteUsedTo(sentence: ParsedSentence): SourceRewrite {
  if (sentence.lang !== 'en') return { sentence, absorbed: [] };
  const used = sentence.tokens.find(
    (t) => t.lemma.toLowerCase() === 'use' && t.feats['Tense'] === 'Past' && t.feats['VerbForm'] === 'Fin',
  );
  const verb = used && sentence.tokens.find(
    (t) => t.head === used.id && t.deprel === 'xcomp' && t.feats['VerbForm'] === 'Inf',
  );
  const to = verb && sentence.tokens.find(
    (t) => t.head === verb.id && t.deprel === 'mark' && t.lemma.toLowerCase() === 'to',
  );
  if (!used || !verb || !to) return { sentence, absorbed: [] };
  if (sentence.tokens.some((t) => t.head === used.id && t.deprel === 'obj')) return { sentence, absorbed: [] };
  const tokens = sentence.tokens
    .filter((t) => t.id !== used.id && t.id !== to.id)
    .map((t) => {
      if (t.id === verb.id) {
        return {
          ...t,
          head: used.head,
          deprel: used.deprel,
          xpos: 'VBD',
          feats: { ...used.feats, Aspect: 'Hab' },
        };
      }
      return t.head === used.id ? { ...t, head: verb.id } : t;
    });
  return {
    sentence: { ...sentence, tokens },
    absorbed: [used, to].map((t) => ({ form: t.form, why: 'a past habit is the imperfective past alone' })),
  };
}

/**
 * A Slavic perfective future is a perfective PRESENT form ("прочитаю"), which
 * Interslavic does not use for the future: "Using the present tense of a
 * perfective verb for the future (as is done in West and East Slavic) is
 * rather to be avoided, as it can easily be misunderstood by South Slavs."
 * The future is "budu" + infinitive, and van Steenbergen writes it with a
 * perfective too: "I tako budu odkryti cěnu ščestja!" (Maly princ). So the
 * parse is given the shape the source's own "буду читать" has - a future
 * auxiliary and an infinitive - and the existing future path builds it.
 * "Я прочитаю книгу" was "Ja pročitaju knigu".
 */
export function rewritePerfectiveFuture(
  sentence: ParsedSentence,
  isPerfective: (lemma: string) => boolean = () => true,
): ParsedSentence {
  const copula = FUTURE_COPULA[sentence.lang];
  if (!copula) return sentence;
  const verbs = sentence.tokens.filter(
    (t) => t.upos === 'VERB' && (t.feats['Aspect'] === 'Perf' || !copula.aspectTagged) && t.feats['Tense'] === 'Fut' &&
      t.feats['VerbForm'] === 'Fin' &&
      /**
       * The first person plural with no subject is the "let us" form, not a
       * future: van Steenbergen gives "Построим себе город" (Babel) as the
       * imperative "budujmo gråd i věžų".
       */
      // The ending decides when the tag is wrong: "сойдем" (Babel, "Sojdimo")
      // comes tagged second person; -ем/-ём/-им (Ukrainian -емо/-імо) is the first.
      !((t.feats['Person'] === '1' && t.feats['Number'] === 'Plur' || /(ем|ём|им|емо|імо)$/i.test(t.form)) &&
        !sentence.tokens.some((c) => c.head === t.id && c.deprel.startsWith('nsubj'))) &&
      // The parser's tag checked against the dictionary: it marks the
      // imperfective "мучится" perfective future.
      isPerfective(t.lemma),
  );
  return insertFutureAuxiliary(sentence, verbs, copula.lemma);
}

/**
 * Gives each of `verbs` the shape "буду" + infinitive: a future auxiliary of
 * `lemma` in the verb's person and number, and the verb itself an infinitive.
 */
export function insertFutureAuxiliary(sentence: ParsedSentence, verbs: UdToken[], lemma: string): ParsedSentence {
  if (verbs.length === 0) return sentence;
  // Each auxiliary goes directly before its verb, so every id from there on
  // moves up by the number of auxiliaries inserted before it.
  const shift = (id: number) => (id === 0 ? 0 : id + verbs.filter((v) => v.id <= id).length);
  const tokens: UdToken[] = [];
  for (const t of sentence.tokens) {
    const verb = verbs.find((v) => v.id === t.id);
    if (verb) {
      const { Person, Number: num } = verb.feats;
      tokens.push({
        ...verb,
        id: shift(verb.id) - 1,
        form: 'буду',
        lemma,
        upos: 'AUX',
        xpos: 'AUX',
        head: shift(verb.id),
        deprel: 'aux',
        feats: { Mood: 'Ind', Tense: 'Fut', VerbForm: 'Fin', ...(Person ? { Person } : {}), ...(num ? { Number: num } : {}) },
      });
      const { Person: _p, Number: _n, Tense: _t, Mood: _m, ...rest } = verb.feats;
      tokens.push({ ...verb, id: shift(verb.id), head: shift(verb.head), feats: { ...rest, VerbForm: 'Inf' } });
      continue;
    }
    tokens.push({ ...t, id: shift(t.id), head: shift(t.head) });
  }
  return { ...sentence, tokens };
}

/**
 * "do it different" uses "different" as an ADVERB - Wiktionary's English
 * entry lists the adverb "different": "Differently." The parser tags it an
 * adjective complement of the verb, and it came out as the adjective: "Ja byl
 * byh sdělal razny". An adjective complement is a real adjective only after a
 * verb that links it to the subject ("It seems different", "She looks
 * different"), so only those keep it; on any other verb it is the adverb.
 */
const LINKING_VERBS = new Set(['be', 'become', 'seem', 'look', 'appear', 'sound', 'feel', 'smell', 'taste', 'get', 'grow', 'turn', 'remain', 'stay', 'keep', 'prove']);

export function rewriteAdverbialDifferent(sentence: ParsedSentence): ParsedSentence {
  if (sentence.lang !== 'en') return sentence;
  return {
    ...sentence,
    tokens: sentence.tokens.map((t) => {
      if (t.lemma.toLowerCase() !== 'different' || t.upos !== 'ADJ' || t.deprel !== 'xcomp') return t;
      const verb = sentence.tokens.find((h) => h.id === t.head);
      if (verb?.upos !== 'VERB' || LINKING_VERBS.has(verb.lemma.toLowerCase())) return t;
      if (sentence.tokens.some((c) => c.head === t.id)) return t;
      return { ...t, lemma: 'differently', upos: 'ADV', xpos: 'RB', deprel: 'advmod', feats: {} };
    }),
  };
}

/**
 * The same for a comparative: in "runs faster", "works harder" the parser
 * tags the adverb ("fast", "hard" are adverbs as well as adjectives in
 * Wiktionary, comparative "faster", "harder") an adjective complement, which
 * gave the adjective "On běži bystrějši" (sometimes it is tagged advmod
 * and still ADJ). An adverb's comparative ends in
 * -ěje (adjectives page: "prostěje 'simplier'"), so it must reach the
 * engine as an adverb.
 */
export function rewriteAdverbialComparative(sentence: ParsedSentence): ParsedSentence {
  if (sentence.lang !== 'en') return sentence;
  return {
    ...sentence,
    tokens: sentence.tokens.map((t) => {
      if (t.upos !== 'ADJ' || (t.deprel !== 'xcomp' && t.deprel !== 'advmod') || t.feats['Degree'] !== 'Cmp') return t;
      const verb = sentence.tokens.find((h) => h.id === t.head);
      if (verb?.upos !== 'VERB' || LINKING_VERBS.has(verb.lemma.toLowerCase())) return t;
      return { ...t, upos: 'ADV', xpos: 'RBR', deprel: 'advmod' };
    }),
  };
}

export function rewriteSource(
  sentence: ParsedSentence,
  isPerfective?: (lemma: string) => boolean,
): SourceRewrite {
  const ukrainian = rewriteUkrainian(fixMixedScriptTokens(sentence));
  const light = rewriteLightVerbs(rewriteReciprocalPreposition(rewritePerfectiveFuture(correctRussianFuture(rewriteAdverbialComparative(rewriteAdverbialDifferent(rewriteVerblessOrphan(ukrainian.sentence)))), isPerfective)));
  const exceptive = rewriteExceptives(light.sentence);
  const clock = rewriteOClock(exceptive.sentence);
  const habit = rewriteUsedTo(clock.sentence);
  return {
    sentence: habit.sentence,
    absorbed: [...ukrainian.absorbed, ...light.absorbed, ...exceptive.absorbed, ...clock.absorbed, ...habit.absorbed],
  };
}
