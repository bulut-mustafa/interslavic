import type { ParsedSentence, UdToken } from '../../../types/index.ts';
import { rank, type Entry, type Lexicon } from '../../../lexicon/src/reader.ts';
import { resolveAspect } from '../resolvers/aspect.ts';
import { contextWordsOf } from '../gloss.ts';

export interface PhrasalVerbPlan {
  /** Verb token id -> the multiword entry chosen for it. */
  phrasalVerbs: Map<number, Entry>;
  /** Particle tokens, which the Interslavic verb absorbs and so are deleted. */
  phrasalParticles: Set<number>;
}

/**
 * Match source verb+particle phrases against the dictionary's own multiword
 * glosses, before anything looks a verb up word by word.
 */
export function planPhrasalVerbs(sentence: ParsedSentence, lex: Lexicon): PhrasalVerbPlan {
  const contextWords = contextWordsOf(sentence);
  /**
   * ---- Phase 0-: phrasal verbs -------------------------------------------
   *
   * English carries a great deal of verb meaning in a particle, and the
   * dictionary already glosses those phrases: "look after" is `doględati`,
   * "wake up" is `buditi sę`, "ought to" is `byti dȯlžėn`. 1,081 verb+particle
   * glosses exist, 911 of them with a single-word Interslavic verb, and every
   * one of them was being translated a word at a time - "I look after my
   * brother" took `ględěti` for "look" and a preposition for "after".
   *
   * UD marks the two shapes differently, and both are read here:
   *   compound:prt   a true particle    "wake UP"
   *   case on an obl a prepositional verb "look AFTER my brother"
   *
   * The dictionary itself is the gate: the pair is only treated as a phrasal
   * verb when an EXACT two-word gloss exists. That keeps ordinary
   * verb-plus-preposition out - "wait for", "live in", "go to", "talk about"
   * and "believe in" all have no such gloss and are left alone.
   *
   * Runs before the prepositional planner so a consumed particle is never also
   * planned as a preposition.
   */
  const phrasalVerbs = new Map<number, Entry>(); // verb token id -> chosen entry
  const phrasalParticles = new Set<number>(); // particle tokens, deleted

  if (sentence.lang === 'en') {
    for (const verb of sentence.tokens) {
      if (verb.upos !== 'VERB' && verb.upos !== 'AUX') continue;

      /**
       * `compound:prt` only. A true particle is an ADVERB - "wake UP", "burn
       * DOWN", "give UP" - and UD has already decided it is not heading a
       * prepositional phrase, which makes the reading unambiguous. The
       * particle counts here are up 205, out 203, away 119, off 106, down 69,
       * so this is where the mass of the data is.
       *
       * A verb plus a genuine PREPOSITION is deliberately excluded, even
       * though "look after" and "look at" are real phrasal glosses: English
       * gives the same shape to the compositional reading, and the dictionary
       * cannot distinguish them. `podhoditi` is glossed "suit, be suitable,
       * befit, go with" - the "that tie goes with the shirt" sense - and
       * matching bare "go with" turned "I go with him" into "Ja podhodžu
       * njego", "I suit him". `after` is no safer: "look after my brother" and
       * "go after lunch" are indistinguishable without word sense.
       */
      const candidates: { particle: UdToken }[] = [];
      for (const child of sentence.tokens) {
        if (child.head !== verb.id) continue;
        if (child.deprel === 'compound:prt') candidates.push({ particle: child });
      }

      for (const { particle } of candidates) {
        const phrase = `${verb.lemma} ${particle.lemma}`.toLowerCase();
        /**
         * `lookup` is keyed by normalised gloss, so every hit already has this
         * exact two-word gloss - no further gloss filtering is needed, and a
         * multiword target needs no special handling either. Only 8 multiword
         * targets are reachable through `compound:prt`, and they are the right
         * answers: "look out" is `byti ostråžny` ("be careful"), "back up" is
         * `idti vzad`. The ones carrying their own preposition ("bazovati na",
         * "zavisěti od") are reached through a `case` relation, which this rule
         * does not read.
         */
        const hits = lex.lookup(phrase, 'en').filter((e) => e.pos.upos === 'VERB');
        if (hits.length === 0) continue;
        const aspect = resolveAspect({ token: verb, sentence });
        const best = rank(hits, {
          upos: 'VERB',
          gloss: phrase,
          lang: 'en',
          contextWords,
          ...(aspect ? { aspect: aspect.decision.value } : {}),
        })[0];
        if (!best) continue;
        phrasalVerbs.set(verb.id, best);
        phrasalParticles.add(particle.id);
        break;
      }
    }
  }

  return { phrasalVerbs, phrasalParticles };
}
