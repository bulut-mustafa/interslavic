import type { ParsedSentence } from '../../types/index.ts';

/**
 * English expressions whose meaning is not the sum of their words, and for
 * which there is no cited Interslavic equivalent - so the translator can only
 * render them word by word, and says so instead of passing nonsense off as a
 * translation: "It's raining cats and dogs" came out "Doždi kotov i psov".
 *
 * A source-side lexical fact about ENGLISH, like the time units in
 * verb-prepositions.ts: nothing here is a claim about Interslavic. Each entry
 * is the phrase in its base forms (as the parser lemmatises it), matched as a
 * run of adjacent words. When an equivalent is sourced, it belongs in
 * data/formulas.json or the light-verb rewrites, and leaves this list.
 */
const IDIOMS: string[] = [
  'rain cat and dog', 'piece of cake', 'break a leg', 'under the weather', 'spill the bean',
  'let the cat out of the bag', 'once in a blue moon', 'bite the bullet', 'call it a day',
  'hit the sack', 'hit the hay', 'kill two bird with one stone', 'cost an arm and a leg',
  'beat around the bush', 'the last straw', 'get cold foot', 'in hot water', 'on cloud nine',
  'over the moon', 'a blessing in disguise', 'cut corner', 'get out of hand', 'hang in there',
  'speak of the devil', 'the ball be in your court', 'when pig fly', 'a dime a dozen',
  'better late than never', 'no pain no gain', 'pull my leg', 'pull your leg',
];

/** Set phrases with no sourced Interslavic form yet: word by word may not be how it is said. */
const UNSOURCED_FORMULAS: string[] = [
  'nice to meet you', 'see you later', 'see you tomorrow', 'see you soon', 'never mind',
  'pay attention', 'take a shower',
];

export function idiomWarnings(sentence: ParsedSentence): string[] {
  if (sentence.lang !== 'en') return [];
  const words = sentence.tokens.filter((t) => t.upos !== 'PUNCT');
  // Matched on base forms ("raining cats" -> "rain cat") or as written: the
  // parser gives "later" the base form "late".
  const spellings = [(t: (typeof words)[number]) => t.lemma, (t: (typeof words)[number]) => t.form];
  /** The phrase as the reader wrote it, or undefined if it is not there. */
  const found = (phrase: string): string | undefined => {
    const n = phrase.split(' ').length;
    for (let i = 0; i + n <= words.length; i++) {
      const run = words.slice(i, i + n);
      if (spellings.some((sp) => run.map((t) => sp(t).toLowerCase()).join(' ') === phrase)) {
        return run.map((t) => t.form).join(' ').replace(/ (?=('|’|n't\b))/g, '');
      }
    }
    return undefined;
  };
  const warn = (list: string[], message: (quoted: string) => string) =>
    list.map(found).filter((q): q is string => q !== undefined).map(message);
  return [
    ...warn(IDIOMS, (q) => `"${q}" is an English idiom. Translated word by word, it will not mean the same in Interslavic.`),
    ...warn(UNSOURCED_FORMULAS, (q) => `"${q}" is a set phrase, translated here word by word - Interslavic may say it differently.`),
  ];
}
