import type { ParsedSentence, UdToken } from '../../../types/index.ts';
import { rank, type Entry, type Lexicon } from '../../../lexicon/src/reader.ts';
import { resolveAspect } from '../resolvers/aspect.ts';
import { contextWordsOf } from '../gloss.ts';
import { isTimeUnit } from '../../../rules/src/verb-prepositions.ts';

export interface PhrasalVerbPlan {
  /** Head token id -> the multiword entry chosen for it: a phrasal verb, or a fixed expression. */
  phrasalVerbs: Map<number, Entry>;
  /** Tokens the multiword entry absorbs - a particle, the rest of a fixed expression - and so are deleted. */
  phrasalParticles: Set<number>;
}

/**
 * Match source verb+particle phrases against the dictionary's own multiword
 * glosses, before anything looks a verb up word by word.
 */
/** Particles the parser tags `advmod` as often as `compound:prt`. */
const ADVERB_PARTICLES = ['away', 'back'];

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
        // The parser often tags "away" and "back" as a plain adverb: "The
        // dog ran away" has advmod `away`, so `utekti` ("run away") was never
        // looked up and the result was "poběgl proč".
        if (child.deprel === 'advmod' && ADVERB_PARTICLES.includes(child.lemma.toLowerCase())) {
          candidates.push({ particle: child });
        }
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
        const aspect = resolveAspect({ token: verb, sentence, lex });
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

  /**
   * ---- fixed expressions --------------------------------------------------
   *
   * UD marks a multiword expression that works as one word with `fixed`:
   * Russian "друг друга" is `друг` + fixed `друга`. Word by word it became
   * "prijatelj prijatelja", "friend of a friend", where the dictionary has the
   * phrase itself - `jedin drugogo` (pron.rec.), glossed "друг друга" - and
   * the pronouns page gives the same formula: "Oni bijut se jedin drugogo".
   *
   * The same gate as above: only an EXACT gloss of the whole surface phrase
   * counts, so nothing is assembled that the dictionary does not list. Forms,
   * not lemmas: both halves of "друг друга" have the lemma "друг".
   */
  for (const head of sentence.tokens) {
    if (phrasalVerbs.has(head.id)) continue;
    const parts = sentence.tokens.filter((t) => t.head === head.id && t.deprel === 'fixed');
    if (parts.length === 0) continue;
    const phrase = [head, ...parts]
      .sort((a, b) => a.id - b.id)
      .map((t) => t.form)
      .join(' ')
      .toLowerCase();
    const best = rank(lex.lookup(phrase, sentence.lang), { gloss: phrase, lang: sentence.lang, contextWords })[0];
    if (!best) continue;
    phrasalVerbs.set(head.id, best);
    for (const p of parts) phrasalParticles.add(p.id);
  }

  /**
   * ---- "be" + participle the dictionary lists as ONE verb ------------------
   *
   * "be born" is `roditi sę`. Read as a passive of "bear" it became "sut
   * trpěni", "are endured", where van Steenbergen's UDHR has "rodet se". The
   * passive auxiliary is absorbed like a particle, and the verb is looked up
   * by its participle FORM, since the lemma "bear" is what misleads.
   */
  if (sentence.lang === 'en') {
    for (const verb of sentence.tokens) {
      if (verb.upos !== 'VERB' || phrasalVerbs.has(verb.id)) continue;
      const aux = sentence.tokens.find(
        (t) => t.head === verb.id && t.deprel === 'aux:pass' && t.lemma.toLowerCase() === 'be',
      );
      if (!aux) continue;
      const phrase = `be ${verb.form}`.toLowerCase();
      const hits = lex.lookup(phrase, 'en').filter((e) => e.pos.upos === 'VERB');
      const aspect = resolveAspect({ token: verb, sentence, lex });
      const best = rank(hits, {
        upos: 'VERB',
        gloss: phrase,
        lang: 'en',
        contextWords,
        ...(aspect ? { aspect: aspect.decision.value } : {}),
      })[0];
      if (!best) continue;
      phrasalVerbs.set(verb.id, best);
      phrasalParticles.add(aux.id);
    }
  }

  /**
   * ---- adjective + noun the dictionary lists as ONE noun -------------------
   *
   * "human being" is `člověk`, glossed exactly that; word by word "All human
   * beings" became "Vse člověčje jestestvo", "all human essence", where van
   * Steenbergen's UDHR has "Vsi ljudi". Same exact-gloss gate, and only for a
   * single-word Interslavic noun, so a phrase the dictionary itself translates
   * as adjective + noun keeps being built from its parts.
   */
  for (const noun of sentence.tokens) {
    if (noun.upos !== 'NOUN' || phrasalVerbs.has(noun.id)) continue;
    const modifier = sentence.tokens.find(
      (t) => t.head === noun.id && t.deprel === 'amod' && t.id === noun.id - 1,
    );
    if (!modifier) continue;
    const phrase = `${modifier.lemma} ${noun.lemma}`.toLowerCase();
    const hits = lex
      .lookup(phrase, sentence.lang)
      .filter((e) => e.pos.upos === 'NOUN' && !/\s/.test(e.lemma));
    const best = rank(hits, { upos: 'NOUN', gloss: phrase, lang: sentence.lang, contextWords })[0];
    if (!best) continue;
    phrasalVerbs.set(noun.id, best);
    phrasalParticles.add(modifier.id);
  }

  /**
   * ---- noun + noun the dictionary translates as adjective + noun ----------
   *
   * "train station" is `želěznična stancija`, glossed exactly that. Word by
   * word "train" has no adjective, so it became the verb `trenovati`:
   * "Kde jest trenovala stancija?". The entry is one lemma, but it inflects
   * only its last word ("želěznična stanciju"), so it is used as its two
   * entries instead - the adjective `želězničny` on the modifier and the noun
   * on the head - and agreement inflects both. Only when the dictionary has
   * both: an adjective whose stem is the phrase's first word, and the noun.
   */
  for (const noun of sentence.tokens) {
    if (noun.upos !== 'NOUN' || phrasalVerbs.has(noun.id)) continue;
    const modifier = sentence.tokens.find(
      (t) => t.head === noun.id && t.deprel === 'compound' && t.upos === 'NOUN' && t.id === noun.id - 1,
    );
    if (!modifier) continue;
    const phrase = `${modifier.lemma} ${noun.lemma}`.toLowerCase();
    const stem = (w: string) => w.replace(/[aoyieå]$/, '');
    for (const hit of lex.lookup(phrase, sentence.lang)) {
      const words = hit.lemma.split(' ');
      if (hit.pos.upos !== 'NOUN' || words.length !== 2) continue;
      // The dictionary cites adjectives in the masculine: -y, or -i after a soft stem.
      const adjective = [`${stem(words[0]!)}y`, `${stem(words[0]!)}i`]
        .flatMap((lemma) => lex.lookupLemma(lemma, 'ADJ'))[0];
      const head = lex.lookupLemma(words[1]!, 'NOUN').find((e) => e.pos.xpos === hit.pos.xpos);
      if (!adjective || !head) continue;
      phrasalVerbs.set(modifier.id, adjective);
      phrasalVerbs.set(noun.id, head);
      break;
    }
  }

  /**
   * ---- preposition + word the dictionary lists as ONE adverb ---------------
   *
   * "at last" is `nakonėc`, glossed exactly that; word by word it became "na
   * poslědnjej", "on the last (one)", where van Steenbergen's North Wind and
   * the Sun has "I nakonec". Only a bare phrase - the preposition and one word
   * with nothing else attached - so "at last year's party" is left alone, and
   * only a one-word adverb, by the same exact-gloss gate as above.
   */
  for (const word of sentence.tokens) {
    if (phrasalVerbs.has(word.id)) continue;
    // Punctuation does not count: "At home, we only speak Dutch" hangs the
    // comma off "home" too, which hid "doma".
    const children = sentence.tokens.filter((t) => t.head === word.id && t.upos !== 'PUNCT');
    const prep = children[0];
    if (children.length !== 1 || prep?.deprel !== 'case' || prep.id !== word.id - 1) continue;
    const phrase = `${prep.form} ${word.form}`.toLowerCase();
    const hits = lex
      .lookup(phrase, sentence.lang)
      .filter((e) => e.pos.upos === 'ADV' && !/\s/.test(e.lemma));
    const best = rank(hits, { upos: 'ADV', gloss: phrase, lang: sentence.lang, contextWords })[0];
    if (!best) continue;
    phrasalVerbs.set(word.id, best);
    phrasalParticles.add(prep.id);
  }

  /**
   * ---- determiner + word the dictionary lists as ONE pronoun ---------------
   *
   * "no one" is `nikto`, glossed "no one, nobody"; word by word "No one loves
   * Trump" became "Ne ne jedin ne ljubi", where the syntax page writes "Nikto
   * ne prijehal na zabavu". Same bare-phrase and exact-gloss gates.
   */
  if (sentence.lang === 'en') {
    for (const word of sentence.tokens) {
      if (phrasalVerbs.has(word.id) || word.upos !== 'PRON') continue;
      const children = sentence.tokens.filter((t) => t.head === word.id);
      const det = children[0];
      if (children.length !== 1 || det?.deprel !== 'det' || det.id !== word.id - 1) continue;
      const phrase = `${det.form} ${word.form}`.toLowerCase();
      const hits = lex
        .lookup(phrase, 'en')
        .filter((e) => e.pos.upos === 'PRON' && !/\s/.test(e.lemma));
      const best = rank(hits, { upos: 'PRON', gloss: phrase, lang: 'en', contextWords })[0];
      if (!best) continue;
      phrasalVerbs.set(word.id, best);
      phrasalParticles.add(det.id);
    }
  }

  /**
   * ---- "take" + a stretch of time is "last" ---------------------------------
   *
   * "The trip took three days", "It takes an hour": the object is a span of
   * time, and the verb means "last" - `trvati` "last, continue, endure, go on"
   * - not `vzeti` "take (hold of)". Word by word it was "Putovanje vzelo tri
   * dnje", "the trip grabbed three days", and "Ono bere časinu". The span then
   * stays a bare accusative, as for any duration ("Eksperiment trval samo
   * několiko lět", Wp/isv). Only with no other object ("take me an hour to"
   * is a different construction) and only for a time unit.
   */
  if (sentence.lang === 'en') {
    for (const verb of sentence.tokens) {
      if (verb.upos !== 'VERB' || verb.lemma.toLowerCase() !== 'take' || phrasalVerbs.has(verb.id)) continue;
      const deps = sentence.tokens.filter((t) => t.head === verb.id);
      const objects = deps.filter((t) => ['obj', 'iobj'].includes(t.deprel));
      if (objects.length !== 1 || !isTimeUnit(objects[0]!.lemma)) continue;
      const aspect = resolveAspect({ token: verb, sentence, lex });
      const best = rank(lex.lookup('last', 'en').filter((e) => e.pos.upos === 'VERB'), {
        upos: 'VERB',
        gloss: 'last',
        lang: 'en',
        contextWords,
        ...(aspect ? { aspect: aspect.decision.value } : {}),
      })[0];
      if (best) phrasalVerbs.set(verb.id, best);
    }
  }

  return { phrasalVerbs, phrasalParticles };
}
