import { decide, type Aspect, type Decision, type ParsedSentence, type UdToken } from '../../../types/index.ts';

/**
 * Aspect selection is the hardest problem in the project: Interslavic requires
 * every verb to be perfective or imperfective, English does not mark it, and NO
 * published source gives an algorithm. So this is an explicit chain of
 * strategies, each individually testable and individually visible in the gloss.
 *
 * Each strategy returns null to decline and defer to the next.
 */
export interface AspectContext {
  token: UdToken;
  sentence: ParsedSentence;
}

export interface AspectStrategy {
  id: string;
  decide(ctx: AspectContext): Decision<Aspect> | null;
}

/**
 * The tense that actually applies to this verb.
 *
 * English puts the tense on the auxiliary, not the verb: in "Where did father
 * buy that book?" UD gives `buy` no Tense at all and marks `did` Past. Reading
 * only the verb's own features therefore misses the tense entirely, which made
 * both the tense rule and the telicity rule silently decline.
 */
function effectiveTense(token: UdToken, sentence: ParsedSentence): string | undefined {
  if (token.feats['Tense']) return token.feats['Tense'];
  const aux = sentence.tokens.find(
    (t) => t.head === token.id && t.deprel === 'aux' && t.feats['Tense'],
  );
  return aux?.feats['Tense'];
}

/** Russian input already marks aspect - just copy it. */
const copyFromSource: AspectStrategy = {
  id: 'aspect.copy',
  decide({ token, sentence }) {
    if (sentence.lang !== 'ru') return null;
    const a = token.feats['Aspect'];
    if (a === 'Imp' || a === 'Perf') {
      return decide<Aspect>(a, 'aspect.copy', 'certain', 'copied from the Russian source, which marks aspect explicitly');
    }
    return null;
  },
};

const IMPERFECTIVE_CUES = ['always', 'usually', 'often', 'every', 'never', 'sometimes', 'daily', 'while'];
const PERFECTIVE_CUES = ['suddenly', 'already', 'finally', 'once', 'completely'];

const adverbialCue: AspectStrategy = {
  id: 'aspect.adverbial',
  decide({ token, sentence }) {
    const deps = sentence.tokens.filter((t) => t.head === token.id);
    for (const d of deps) {
      const lem = d.lemma.toLowerCase();
      if (IMPERFECTIVE_CUES.includes(lem)) {
        return decide<Aspect>('Imp', 'aspect.adverbial.imp', 'high', `habitual/durative cue "${d.form}"`);
      }
      if (PERFECTIVE_CUES.includes(lem)) {
        return decide<Aspect>('Perf', 'aspect.adverbial.perf', 'high', `completive cue "${d.form}"`);
      }
    }
    return null;
  },
};

/**
 * The English perfect denotes a completed event, which is exactly what the
 * perfective aspect expresses: "has bought" is `kupil` (pf), not `kupoval`.
 * Checked before the tense rule, since the perfect also looks present-tense on
 * its auxiliary.
 */
const perfectAuxiliary: AspectStrategy = {
  id: 'aspect.perfect',
  decide({ token, sentence }) {
    const hasPerfect = sentence.tokens.some(
      (t) => t.head === token.id && t.deprel === 'aux' && t.lemma.toLowerCase() === 'have',
    );
    if (!hasPerfect) return null;
    return decide<Aspect>(
      'Perf',
      'aspect.perfect',
      'high',
      'the English perfect denotes a completed event, which is the perfective',
      [{ value: 'Imp', because: 'possible if the sense is repeated or ongoing' }],
    );
  },
};

/**
 * The single most important rule in this file. A perfective PRESENT in
 * Interslavic reads as a future, and the standard explicitly warns against
 * relying on it because South Slavic speakers misread it. So an English present
 * tense must always come out imperfective.
 */
const tenseCue: AspectStrategy = {
  id: 'aspect.tense',
  decide({ token, sentence }) {
    const tense = effectiveTense(token, sentence);
    const aspectFeat = token.feats['Aspect'];
    if (tense === 'Pres') {
      return decide<Aspect>(
        'Imp',
        'aspect.tense.presImp',
        'high',
        'present tense requires imperfective - a perfective present reads as a future in Interslavic',
        [{ value: 'Perf', because: 'rejected: would be misread as future tense' }],
      );
    }
    if (aspectFeat === 'Prog') {
      return decide<Aspect>('Imp', 'aspect.tense.progressive', 'high', 'English progressive is ongoing, so imperfective');
    }
    return null;
  },
};

/**
 * A simple past with a direct object describes one bounded, completed event -
 * an accomplishment in Vendler's terms - and Interslavic expresses that with
 * the perfective:
 *
 *   "Where did father buy that book?"  ->  Kde otec KUPIL tu knigu?
 *
 * Deliberately narrow, because this is the hardest judgement in the project:
 * it fires only on a past tense with a direct object, and not when a durative
 * or habitual adverbial is present (those are handled above) or when the source
 * is progressive. Reported as `default`, not `certain`, with the imperfective
 * offered as the alternative.
 */
const pastWithObject: AspectStrategy = {
  id: 'aspect.pastTelic',
  decide({ token, sentence }) {
    if (effectiveTense(token, sentence) !== 'Past') return null;
    if (token.feats['Aspect'] === 'Prog') return null;
    const hasObject = sentence.tokens.some((t) => t.head === token.id && t.deprel === 'obj');
    if (!hasObject) return null;
    return decide<Aspect>(
      'Perf',
      'aspect.pastTelic',
      'default',
      'a past event with a direct object reads as completed, so perfective',
      [{ value: 'Imp', because: 'imperfective if the action was repeated or ongoing' }],
    );
  },
};

/** Last resort: imperfective is the lexically unmarked member of the pair. */
const defaultImperfective: AspectStrategy = {
  id: 'aspect.default',
  decide() {
    return decide<Aspect>(
      'Imp',
      'aspect.default.imp',
      'guess',
      'no aspect cue found - defaulting to imperfective, the unmarked member of the pair',
      [{ value: 'Perf', because: 'possible if the action is meant as completed' }],
    );
  },
};

export const ASPECT_CHAIN: AspectStrategy[] = [
  copyFromSource,
  perfectAuxiliary,
  adverbialCue,
  tenseCue,
  pastWithObject,
  defaultImperfective,
];

export interface AspectOutcome {
  decision: Decision<Aspect>;
  /** Strategies that declined before one fired - shown in the gloss. */
  declined: string[];
}

export function resolveAspect(ctx: AspectContext, chain = ASPECT_CHAIN): AspectOutcome {
  const declined: string[] = [];
  for (const s of chain) {
    const d = s.decide(ctx);
    if (d) return { decision: d, declined };
    declined.push(s.id);
  }
  // The chain always ends in a defaulting strategy, so this is unreachable.
  throw new Error('aspect chain exhausted without a decision');
}
