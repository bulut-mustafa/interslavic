import type { ParsedSentence, UdToken } from '../../types/index.ts';

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

export interface LightVerbRewrite {
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
export function rewriteLightVerbs(sentence: ParsedSentence): LightVerbRewrite {
  if (sentence.lang !== 'en') return { sentence, absorbed: [] };
  const children = (t: UdToken) => sentence.tokens.filter((c) => c.head === t.id);
  const removed = new Set<number>();
  const changed = new Map<number, Partial<UdToken>>();
  const absorbed: LightVerbRewrite['absorbed'] = [];

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
