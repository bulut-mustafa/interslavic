import { decide, type Aspect, type Decision, type ParsedSentence, type UdToken } from '../../../types/index.ts';
import { isMotionVerb } from '../../../rules/src/motion.ts';
import { candidatesForEnglish } from '../../../rules/src/prepositions.ts';
import type { Lexicon } from '../../../lexicon/src/reader.ts';

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
  /** Needed only by the rules that read the verb's aspect pair. */
  lex?: Lexicon;
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
    const children = sentence.tokens.filter((t) => t.head === token.id);
    // One level down too: in "ran every morning" the cue is the determiner of
    // "morning", not a dependent of the verb.
    const deps = [
      ...children,
      ...sentence.tokens.filter((t) => t.deprel === 'det' && children.some((c) => c.id === t.head)),
    ];
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
    // "ja čital jesm knigu (imperfective) means „I was reading a book" or „I
    // have been reading a book"" (verbs page): the perfect PROGRESSIVE is
    // ongoing, not completed. UD marks it only by the -ing form.
    if (token.xpos === 'VBG' || token.feats['Aspect'] === 'Prog') {
      return decide<Aspect>('Imp', 'aspect.tense.progressive', 'high', 'English progressive is ongoing, so imperfective');
    }
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
/**
 * The subject of a passive is the object of the active, so "The food was
 * prepared by my grandmother" is the same completed event as "My grandmother
 * prepared the food" and takes the same aspect. Only with a PAST "be": the
 * verbs page gives the present passive with an imperfective ("ja jesm
 * nesomy"), and the participle carries Tense=Past whatever the tense is. A
 * bare plural subject leaves it open, as a bare plural object does.
 */
function isPastPassiveOfAnObject(token: UdToken, sentence: ParsedSentence): boolean {
  const be = sentence.tokens.find((t) => t.head === token.id && t.deprel === 'aux:pass');
  const subject = sentence.tokens.find((t) => t.head === token.id && t.deprel === 'nsubj:pass');
  return be?.feats['Tense'] === 'Past' && subject !== undefined && !isBarePlural(subject, sentence);
}

const pastWithObject: AspectStrategy = {
  id: 'aspect.pastTelic',
  decide({ token, sentence }) {
    if (effectiveTense(token, sentence) !== 'Past') return null;
    if (token.feats['Aspect'] === 'Prog') return null;
    const hasObject = sentence.tokens.some((t) => t.head === token.id && t.deprel === 'obj');
    if (!hasObject && !isPastPassiveOfAnObject(token, sentence)) return null;
    return decide<Aspect>(
      'Perf',
      'aspect.pastTelic',
      'default',
      'a past event with a direct object reads as completed, so perfective',
      [{ value: 'Imp', because: 'imperfective if the action was repeated or ongoing' }],
    );
  },
};

/**
 * A past motion verb with a goal reached the goal, so the event is bounded and
 * takes the perfective: "The cat fled under the table" -> `Kot poběgl pod stol`,
 * "Nobody came to the party" -> `Nikto ne prijehal na zabavu`.
 *
 * Only a GOAL bounds it: `to`, `into`, `onto`, or a preposition the dictionary
 * marks as directional ("under (direction)"). "Ran for an hour" and "ran
 * towards the house" have none, and a habitual "ran to school every morning"
 * is caught by the adverbial cue first - those are the readings that broke a
 * wider "every past motion verb" rule (docs/verification-log.md).
 */
const GOAL_PREPOSITIONS = ['to', 'into', 'onto'];

const pastWithGoal: AspectStrategy = {
  id: 'aspect.pastGoal',
  decide({ token, sentence }) {
    if (effectiveTense(token, sentence) !== 'Past') return null;
    if (token.feats['Aspect'] === 'Prog' || !isMotionVerb(token.lemma)) return null;
    const goal = sentence.tokens.some(
      (obl) =>
        obl.head === token.id &&
        obl.deprel === 'obl' &&
        sentence.tokens.some((c) => {
          if (c.head !== obl.id || c.deprel !== 'case') return false;
          const lemma = c.lemma.toLowerCase();
          return GOAL_PREPOSITIONS.includes(lemma) || candidatesForEnglish(lemma).some((p) => p.direction);
        }),
    );
    if (!goal) return null;
    return decide<Aspect>(
      'Perf',
      'aspect.pastGoal',
      'default',
      'a past movement to a goal reached it, so the event is completed: perfective',
      [{ value: 'Imp', because: 'imperfective if the movement was repeated or still under way' }],
    );
  },
};

/**
 * English marks a finished event with a particle: "ran AWAY", "burned DOWN",
 * "took his cloak OFF", "gave UP". The particle states the result the
 * perfective focuses on (verbs page), and the dictionary has the pairs:
 * `utekti`/`utěkati`, `dogorěti`/`dogarjati`, `sjęti`/`snimati`. Without it
 * every one of these fell to the imperfective default ("Dom dogarjal").
 *
 * "away" is tagged a plain adverb, not a particle, so both relations are read
 * - but only on the verb itself, so "far away" or "up the hill" never count.
 * "out" completes only a movement ("went out"); on a verb of light or sound it
 * marks a beginning - "the Sun shined out" is "načelo blěskati" in his North
 * Wind - so it counts only with a verb of motion.
 */
const COMPLETIVE_PARTICLES = ['away', 'down', 'off', 'up'];

const pastWithParticle: AspectStrategy = {
  id: 'aspect.pastParticle',
  decide({ token, sentence }) {
    if (effectiveTense(token, sentence) !== 'Past') return null;
    if (token.feats['Aspect'] === 'Prog') return null;
    const particle = sentence.tokens.find(
      (t) =>
        t.head === token.id &&
        (t.deprel === 'compound:prt' || t.deprel === 'advmod') &&
        (COMPLETIVE_PARTICLES.includes(t.lemma.toLowerCase()) ||
          (t.lemma.toLowerCase() === 'out' && isMotionVerb(token.lemma))),
    );
    if (!particle) return null;
    return decide<Aspect>(
      'Perf',
      'aspect.pastParticle',
      'default',
      `"${particle.form}" marks the event as finished, so perfective`,
      [{ value: 'Imp', because: 'imperfective if the action was repeated or ongoing' }],
    );
  },
};

/**
 * Some verbs name a result by their meaning - "stay", "die", "succeed",
 * "agree", "arrive" - and a single past event of one is completed without any
 * object or goal: "He stayed in the house" is `ostal` (Tatoeba 13467063).
 *
 * English gives no sign of this, but the dictionary's aspect pairs do. The
 * verbs page: "Verbs without a prefix are imperfective almost by definition",
 * a prefix makes the perfective (pisati > napisati), and only a perfective
 * that is itself the starting point gets a "secondary" imperfective built
 * from it (priznati > priznavati). So:
 *
 *   napisati = na + pisati, pročitati = pro + čitati  -> an activity
 *   ostati > ostavati, uspěti > uspěvati, umrěti > umirati -> a result
 *
 * A verb counts as a result when at least one of its perfectives is not built
 * on one of its imperfectives, and none is. A perfective in -nųti is set
 * aside: it is one instance of an activity (kričati > kriknųti), not a result.
 * Checked on 50 common verbs, 20 of each kind, before use; "say", "lose" and
 * "understand" read as activities, because `skazati`, `izgubiti` and
 * `sråzuměti` are built on `kazati`, `gubiti` and `råzuměti`.
 */
const bareLemma = (lemma: string): string =>
  lemma.replace(/ s[ęe]$/, '').normalize('NFD').replace(/\p{M}/gu, '');

export function namesAResult(englishLemma: string, lex: Lexicon): boolean {
  const verbs = lex.lookup(englishLemma, 'en').filter((e) => e.pos.upos === 'VERB');
  const perf = verbs.filter((e) => e.pos.aspect === 'Perf').map((e) => bareLemma(e.lemma));
  const imp = verbs.filter((e) => e.pos.aspect === 'Imp').map((e) => bareLemma(e.lemma));
  const prefixed = perf.some((p) => imp.some((i) => p !== i && p.endsWith(i)));
  return !prefixed && perf.some((p) => !p.endsWith('nuti'));
}

const pastResult: AspectStrategy = {
  id: 'aspect.pastResult',
  decide({ token, sentence, lex }) {
    if (!lex || effectiveTense(token, sentence) !== 'Past') return null;
    if (token.feats['Aspect'] === 'Prog' || !namesAResult(token.lemma.toLowerCase(), lex)) return null;
    return decide<Aspect>(
      'Perf',
      'aspect.pastResult',
      'default',
      `"${token.lemma}" names a result, and a single past event of it is completed: perfective`,
      [{ value: 'Imp', because: 'imperfective if the action was repeated or still going on' }],
    );
  },
};

/**
 * A single bounded act asked for or wanted is perfective too, not only one in
 * the past: his "Otec nikde ne mogl NAJDTI svoje ključi", and on Tatoeba "Ja
 * hočem kupiti jabloka", "On probuje najdti svoju olovku", "Otvori vse
 * magaziny". The past rules required the past tense, so every infinitive and
 * command fell to the imperfective default ("Otvarjajte okno").
 *
 * Bounded by a direct object or a completive particle - not by a verb that
 * names a result: that test was measured on single past events, and on "should
 * act towards one another", a general norm, it gave "postupiti" where his UDHR
 * has "imajut postupati". Only an infinitive governed by a verb or a modal,
 * and a positive command; left out on purpose:
 * - "will"/"would": the verbs page shows the future only as "budu dělati",
 *   and Tatoeba has "on bude pomagati";
 * - after a phase or liking verb, which takes the imperfective: his Babel has
 *   "prěstali budovati", Tatoeba "Ljubju ničego ne dělati";
 * - a purpose clause, an `advcl`: his "že by fotografovali tulipany";
 * - "going to", a future;
 * - a negative command, tagged on "do", not on the verb - and the Slavic
 *   negative command is imperfective ("Ne otvarjajte okno").
 */
/**
 * A bare plural object leaves the act open: "He could read books" is ability,
 * `mogl čitati`, where "find his keys" or "buy a car" is one act that ends.
 * Plural with no determiner, possessive or number in front of it.
 */
function isBarePlural(noun: UdToken, sentence: ParsedSentence): boolean {
  return noun.upos === 'NOUN' && noun.feats['Number'] === 'Plur' &&
    !sentence.tokens.some((t) => t.head === noun.id && ['det', 'nmod:poss', 'nummod'].includes(t.deprel));
}

const MODALS = ['can', 'could', 'must', 'may', 'might', 'should'];
const TAKES_IMPERFECTIVE = ['begin', 'start', 'stop', 'finish', 'continue', 'keep', 'like', 'love', 'enjoy', 'hate', 'prefer', 'learn'];

const singleAct: AspectStrategy = {
  id: 'aspect.singleAct',
  decide({ token, sentence }) {
    const command = token.feats['Mood'] === 'Imp';
    if (!command) {
      if (token.feats['VerbForm'] !== 'Inf') return null;
      const head = sentence.tokens.find((t) => t.id === token.head);
      const governed =
        token.deprel === 'xcomp' &&
        head !== undefined &&
        head.lemma.toLowerCase() !== 'go' &&
        !TAKES_IMPERFECTIVE.includes(head.lemma.toLowerCase());
      const modal = sentence.tokens.some(
        (t) => t.head === token.id && t.deprel === 'aux' && MODALS.includes(t.lemma.toLowerCase()),
      );
      if (!governed && !modal) return null;
    }
    const bounded = sentence.tokens.some(
      (t) => t.head === token.id && ((t.deprel === 'obj' && !isBarePlural(t, sentence)) ||
        (t.deprel === 'compound:prt' && COMPLETIVE_PARTICLES.includes(t.lemma.toLowerCase()))),
    );
    if (!bounded) return null;
    return decide<Aspect>(
      'Perf',
      'aspect.singleAct',
      'default',
      command ? 'a request for one completed act: perfective' : 'one completed act is wanted or possible: perfective',
      [{ value: 'Imp', because: 'imperfective if the act is meant as repeated or ongoing' }],
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
  pastWithGoal,
  pastWithParticle,
  pastResult,
  singleAct,
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
