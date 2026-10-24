import type { ParsedSentence, UdToken } from '../../types/index.ts';

/**
 * Motion versus location, which decides the case after several prepositions.
 *
 * The prepositions page states the rule and gives the minimal pair:
 *
 *   "the accusative case is used when a movement towards/into a location is
 *    indicated; the instrumental or locative case is used when the location is
 *    stable [...] The instrumental is used when the location is stable
 *    (Kot spi pod stolom - 'The cat is sleeping under the table'), the
 *    accusative expresses a motion toward it (Kot poběgl pod stol - 'The cat
 *    fled under the table')."
 *
 * Source: http://steen.free.fr/interslavic/prepositions.html
 *
 * English marks the distinction on the preposition for some pairs - "in" vs
 * "into", "on" vs "onto" - and the government table already carries those as
 * separate senses. For `pod`, `nad`, `prěd`, `medžu` and `za` English uses one
 * word for both, so the only signal left is the verb, and without it the
 * planner picked by frequency: "The cat fled under the table" came out as
 * `pod stolom`, the sleeping-cat reading.
 *
 * This is a list of English verbs, not of Interslavic grammar: the rule above
 * is the attested part, and the source language is what has to be classified.
 * It follows the same pattern as the aspect cue lists in `resolvers/aspect.ts`.
 *
 * WHICH preposition senses it applies to is not guessed: the dictionary glosses
 * the directional sense explicitly - "under (direction)", "before
 * (direction)" - and `prepositions.ts` keeps that marking.
 */

const MOTION_VERBS = new Set([
  // self-propelled motion
  'go', 'come', 'run', 'walk', 'flee', 'escape', 'climb', 'jump', 'leap',
  'crawl', 'swim', 'fly', 'ride', 'drive', 'travel', 'move', 'enter', 'exit',
  'arrive', 'return', 'fall', 'step', 'rush', 'march', 'wander', 'head',
  // caused motion: the object ends up somewhere
  'put', 'place', 'set', 'lay', 'throw', 'toss', 'push', 'pull', 'drag',
  'send', 'bring', 'carry', 'lead', 'drop', 'pour', 'hang', 'insert', 'stick',
]);

/**
 * True when this English verb describes motion or placement, so a preposition
 * that distinguishes the two takes the accusative.
 */
export function isMotionVerb(lemma: string): boolean {
  return MOTION_VERBS.has(lemma.trim().toLowerCase());
}

/**
 * "around" on a verb of motion that also has a place it moves IN: the movement
 * covers the place, which Interslavic says with `po` and the locative.
 *
 *   "Igor jezdil po Moskvě „Igor was driving around in Moscow""
 *   http://steen.free.fr/interslavic/verbs.html
 *
 * The prepositions page gives po with the locative as "throughout, round, all
 * over", and the dictionary glosses po (+loc) "throughout". The adverb is then
 * carried by the preposition, so it is not translated on its own - it came out
 * as "vokrug v Moskvě", "round about in Moscow".
 */
export function isAroundAPlace(adverb: UdToken, sentence: ParsedSentence): boolean {
  if (adverb.deprel !== 'advmod' || adverb.lemma.toLowerCase() !== 'around') return false;
  const verb = sentence.tokens.find((t) => t.id === adverb.head);
  if (verb?.upos !== 'VERB' || !isMotionVerb(verb.lemma)) return false;
  return sentence.tokens.some(
    (obl) =>
      obl.head === verb.id &&
      obl.deprel === 'obl' &&
      sentence.tokens.some((c) => c.head === obl.id && c.deprel === 'case' && c.lemma.toLowerCase() === 'in'),
  );
}
