import { decide, type Case, type Decision, type ParsedSentence, type UdToken } from '../../../types/index.ts';
import { CASE_MARKER_PREPOSITIONS, candidatesForEnglish, isInsidePlace } from '../../../rules/src/prepositions.ts';
import { isAroundAPlace, isMotionVerb } from '../../../rules/src/motion.ts';
import { isTimeUnit, verbGovernedPhrase } from '../../../rules/src/verb-prepositions.ts';

/**
 * What to do with a prepositional phrase.
 *
 * Either the preposition survives into Interslavic and governs a case, or it
 * is a bare case marker that must be deleted (English "of"/recipient "to").
 */
export type PrepPlan =
  | { kind: 'preposition'; prep: string; case: Decision<Case>; alternatives: string[] }
  | { kind: 'caseMarker'; case: Decision<Case> }
  | { kind: 'unknown' };

/**
 * English verbs that take a recipient, which is the class that licenses the
 * dative alternation: "give the girl a book" / "give a book to the girl". A
 * source-side fact about English, and the test that decides whether "to" is a
 * recipient marker (a bare Interslavic dative) or a direction.
 *
 * Without it, "having a direct object" was the whole test, which made every
 * "to"-phrase beside an object a dative: "I took the book to Rome" came out as
 * "Ja jesm vzel knigu Rimu", putting a destination in the dative.
 */
const RECIPIENT_VERBS = new Set([
  'give', 'send', 'write', 'tell', 'show', 'offer', 'hand', 'pass', 'read',
  'sell', 'lend', 'owe', 'teach', 'promise', 'mail', 'email', 'post', 'pay',
  'serve', 'award', 'grant', 'explain', 'describe', 'report', 'recommend',
  'say', 'speak', 'return', 'deliver', 'present', 'leave', 'throw',
]);

/**
 * Is this "to" a recipient marker rather than a direction? UD labels the two
 * alternation variants differently (iobj vs obl+case), and both must become a
 * bare Interslavic dative.
 *
 * The phrase may hang off the verb ("gave a book to her brother") or off the
 * object noun ("wrote a letter to his mother", which Stanza makes an `nmod` of
 * "letter") - the recipient is the same either way, and reading only the verb's
 * own dependents gave "do svojej matere", "up to his mother".
 */
function isRecipientTo(adp: UdToken, sentence: ParsedSentence): boolean {
  // Called only for "to" (the caller short-circuits), so no lemma check here.
  const complement = sentence.tokens.find((t) => t.id === adp.head);
  if (!complement) return false;

  // Up through nominal heads to the verb that governs the phrase.
  let host = sentence.tokens.find((t) => t.id === complement.head);
  for (let hops = 0; host && host.upos !== 'VERB' && hops < 3; hops++) {
    host = sentence.tokens.find((t) => t.id === host!.head);
  }
  if (!host || host.upos !== 'VERB') return false;
  if (!RECIPIENT_VERBS.has(host.lemma.toLowerCase())) return false;
  return sentence.tokens.some((t) => t.head === host!.id && t.deprel === 'obj');
}

/** Exported for tests. */
export const RECIPIENT_VERB_LEMMAS = [...RECIPIENT_VERBS];

/**
 * Why each marker is deleted. Keyed, not branched: with an if/else on "of" the
 * possessive clitic inherited the "to" message, so the gloss for `mojego brata`
 * read "recipient 'to' is a dative marker" under a genitive.
 */
const MARKER_REASON: Record<string, string> = {
  of: 'English "of" is a genitive marker - Interslavic uses a bare genitive',
  to: 'recipient "to" is a dative marker - Interslavic uses a bare dative',
  "'s": 'the English possessive is a genitive marker - Interslavic uses a bare genitive, like "of"',
};

/** Times of day that English puts after "at" like a clock time. */
const TIMES_OF_DAY = new Set(['noon', 'midday', 'midnight']);

export function planPreposition(adp: UdToken, sentence: ParsedSentence): PrepPlan {
  const lemma = adp.lemma.toLowerCase();

  /**
   * A PARTITIVE "of" - a part out of a whole - is `iz` with the genitive, not
   * a bare genitive: "one of them" is "jedin iz njih" (142 "jedin iz" and 46
   * "iz njih" in the Interslavic Wikipedia: "Mnoge iz njih", "vsaky iz
   * njih"), and van Steenbergen's North Wind writes "koj iz njih jest
   * silnějši" and "silnějše iz njih dvoh". It is partitive when it depends on
   * a numeral, a comparative or superlative, or a quantifying or
   * interrogative pronoun; "the book of my brother" keeps the bare genitive.
   */
  if (lemma === 'of') {
    const complement = sentence.tokens.find((t) => t.id === adp.head);
    const whole = complement && sentence.tokens.find((t) => t.id === complement.head);
    const partitive =
      whole !== undefined &&
      (whole.upos === 'NUM' ||
        whole.feats['Degree'] === 'Cmp' ||
        whole.feats['Degree'] === 'Sup' ||
        ((whole.upos === 'PRON' || whole.upos === 'DET') &&
          ['Int', 'Ind', 'Tot', 'Neg'].includes(whole.feats['PronType'] ?? '')));
    if (partitive) {
      return {
        kind: 'preposition',
        prep: 'iz',
        case: decide<Case>('Gen', 'case.prep.partitive', 'high',
          'a part out of a whole: "iz" with the genitive ("jedin iz njih", "silnějše iz njih dvoh")'),
        alternatives: [],
      };
    }
  }

  // Case markers: delete the word, keep the case.
  const marker = CASE_MARKER_PREPOSITIONS[lemma];
  if (marker && (lemma !== 'to' || isRecipientTo(adp, sentence))) {
    return {
      kind: 'caseMarker',
      case: decide<Case>(
        marker,
        `rewrite.en.${lemma}AsCase`,
        'high',
        MARKER_REASON[lemma] ?? `English "${lemma}" is a case marker, not a preposition`,
      ),
    };
  }

  const complement = sentence.tokens.find((t) => t.id === adp.head);
  const governor = complement && sentence.tokens.find((t) => t.id === complement.head);

  /**
   * A span of time takes no preposition. "They have lived here for ten years"
   * was "Oni žili tu dlja deset rokov", which reads as living on ten years'
   * behalf - `dlja` is the benefactive "for" and is never temporal.
   *
   *   "Eksperiment trval samo několiko lět"   (the experiment lasted only a
   *                                            few years - no preposition)
   *   https://incubator.wikimedia.org/wiki/Wp/isv/Jediny_bog
   *   "Dėnj i noć ja blųđų po lěsah i poljah" (day and night I wander)
   *   http://steen.free.fr/interslavic/volk_i_pes.html
   *
   * This is checked before verb government, because "I waited for an hour" is
   * a duration and not the thing waited for.
   */
  if (lemma === 'for' && complement && isTimeUnit(complement.lemma)) {
    return {
      kind: 'caseMarker',
      case: decide<Case>('Acc', 'case.durationAccusative', 'high',
        'a span of time takes no preposition - "dlja" is the benefactive "for" and is never temporal'),
    };
  }

  /**
   * Some words pick the preposition themselves, and the English one is no
   * guide: "wait FOR" is `čekati na`, "depend ON" is `zavisěti od`,
   * "responsible FOR" is `odgovorny za`.
   */
  if (governor && ['VERB', 'AUX', 'ADJ', 'NOUN'].includes(governor.upos)) {
    const governed = verbGovernedPhrase(governor.lemma, lemma);
    if (governed) {
      const because = `${governed.why} (${governed.evidence})`;
      return governed.prep === null
        ? { kind: 'caseMarker', case: decide<Case>(governed.case, 'case.verbGovernedPrep', 'high', because) }
        : {
            kind: 'preposition',
            prep: governed.prep,
            case: decide<Case>(governed.case, 'case.verbGovernedPrep', 'high', because),
            alternatives: [],
          };
    }
  }

  /**
   * "towards" governing the second half of a reciprocal is `k` with the
   * dative: "jedin k drugomu", as van Steenbergen writes it in both his UDHR
   * and his Tower of Babel. The prepositions page lists "do - to, towards,
   * till" and "k - to, towards (direction)"; his texts choose k here.
   */
  if (lemma === 'towards' && complement?.feats['PronType'] === 'Rcp') {
    return {
      kind: 'preposition',
      prep: 'k',
      case: decide<Case>('Dat', 'reciprocal.formula', 'high',
        'towards each other: "jedin k drugomu", k with the dative'),
      alternatives: [],
    };
  }

  /** "driving around in Moscow" -> "jezdil po Moskvě" (rules/src/motion.ts). */
  if (lemma === 'in' && governor && sentence.tokens.some((t) => t.head === governor.id && isAroundAPlace(t, sentence))) {
    return {
      kind: 'preposition',
      prep: 'po',
      case: decide<Case>('Loc', 'case.prep.around', 'high',
        'moving around in a place covers it: "po" with the locative, "throughout, round, all over"'),
      alternatives: [],
    };
  }

  /**
   * "at" a clock time is `v` with the accusative: "umrl ... v 9:15",
   * "nadavano ... v 20:00", "Solnce světi z juga v poldenj" (Wp/isv), as
   * Russian "в восемь", Czech "v osm", Croatian "u osam" and Bulgarian "в осем"
   * say it - Polish "o ósmej" is the one exception. Frequency gave the
   * locative `na`: "Ja vstavaju na sedmi", "na polnoči".
   */
  if (lemma === 'at' && complement && (complement.upos === 'NUM' || TIMES_OF_DAY.has(complement.lemma.toLowerCase()))) {
    return {
      kind: 'preposition',
      prep: 'v',
      case: decide<Case>('Acc', 'case.prep.clockTime', 'high',
        'at a clock time: "v" with the accusative ("v 9:15", "v poldenj")'),
      alternatives: [],
    };
  }

  /**
   * "at" was always `na`: it is the only candidate glossed "at" with the
   * locative, and frequency cannot tell "na stanciji" from "na školě". The
   * page's "na - on, at" stays the default; a building or institution the
   * Slavic languages all mark with "in" takes `v` (rules/data/at-inside.json,
   * the grammar page's "majority solutions"). A compound ("post office") is
   * a different noun - "na poště" - so only a bare noun is looked up.
   */
  if (
    lemma === 'at' &&
    complement &&
    isInsidePlace(complement.lemma) &&
    !sentence.tokens.some((t) => t.head === complement.id && t.deprel === 'compound')
  ) {
    return {
      kind: 'preposition',
      prep: 'v',
      case: decide<Case>('Loc', 'case.prep.atInside', 'high',
        `at a building or institution: "v" with the locative, as every Slavic language says "in" here`),
      alternatives: ['na'],
    };
  }

  const cands = candidatesForEnglish(lemma);
  if (cands.length === 0) return { kind: 'unknown' };

  /**
   * "The instrumental is used when the location is stable (Kot spi pod
   * stolom), the accusative expresses a motion toward it (Kot poběgl pod
   * stol)." English writes "under" for both, so the governing verb is the only
   * signal; without it the planner chose by frequency and gave the
   * sleeping-cat reading for a fleeing cat.
   */
  const noun = complement;

  /**
   * The agent of a passive: "The agent in passive construction is either in the
   * instrumental case or preceded by the preposition od with the genitive."
   * Ranking by frequency picked `od stråny` ("on the part of", 8856) over plain
   * `od` (7699), giving "od strany togo muža" where the page writes
   * "od togo muža".
   */
  if (noun?.deprel === 'obl:agent') {
    const agent = cands.find((c) => c.prep === 'od' && c.case === 'Gen');
    if (agent) {
      return {
        kind: 'preposition',
        prep: agent.prep,
        case: decide<Case>('Gen', 'case.prep.governed', 'certain',
          'the agent of a passive takes "od" with the genitive'),
        alternatives: ['instrumental without a preposition'],
      };
    }
  }

  const governingVerb = governor;
  const towards =
    governingVerb?.upos === 'VERB' && isMotionVerb(governingVerb.lemma)
      ? cands.find((c) => c.direction)
      : undefined;

  const best = towards ?? cands[0]!;
  const distinctCases = new Set(cands.map((c) => c.case));

  // Confidence tracks what is actually uncertain: if every candidate governs
  // the same case, the CASE is certain even when the preposition choice is not.
  const confidence =
    cands.length === 1 || towards ? 'high' : distinctCases.size === 1 ? 'high' : 'default';
  const because =
    cands.length === 1
      ? `"${best.prep}" governs the ${best.case.toLowerCase()}`
      : towards
        ? `"${governingVerb?.form}" is a verb of motion, and the accusative expresses ` +
          'movement towards a place (the instrumental or locative would be a stable location)'
        : distinctCases.size === 1
          ? `every candidate for "${lemma}" governs the ${best.case.toLowerCase()}`
          : `"${lemma}" is ambiguous - chose "${best.prep}" (+${best.case.toLowerCase()}) by frequency`;

  return {
    kind: 'preposition',
    prep: best.prep,
    case: decide<Case>(best.case, 'case.prep.governed', confidence, because,
      cands.slice(1, 4).map((c) => ({ value: c.case, because: `"${c.prep}" + ${c.case.toLowerCase()}` }))),
    alternatives: cands.slice(1, 4).map((c) => `${c.prep} (+${c.case.toLowerCase()})`),
  };
}
