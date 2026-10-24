import type { ParsedSentence, UdToken } from '../../types/index.ts';

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
    const rule = LIGHT_VERBS.find((r) => r.verb === verb.lemma.toLowerCase());
    if (!rule) continue;
    const noun = children(verb).find(
      (c) => c.deprel === 'obj' && rule.objects.includes(c.lemma.toLowerCase()),
    );
    if (!noun) continue;

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
export function rewriteSource(sentence: ParsedSentence): SourceRewrite {
  const light = rewriteLightVerbs(sentence);
  const exceptive = rewriteExceptives(light.sentence);
  return { sentence: exceptive.sentence, absorbed: [...light.absorbed, ...exceptive.absorbed] };
}
