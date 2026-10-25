import type { LessonPage } from '../types.ts';
import { agreement } from './helpers.ts';

const ADJECTIVES = 'http://steen.free.fr/interslavic/adjectives.html';

const adjectives: LessonPage = {
  slug: 'adjectives',
  title: 'Adjectives',
  summary: 'Adjectives take the gender, number and case of their noun; and how to compare.',
  section: 'Grammar',
  names: ['Petr', 'Petrov', 'Petrova'],
  blocks: [
    { kind: 'h2', text: 'An adjective follows its noun' },
    {
      kind: 'p',
      text:
        'An adjective takes the gender, number and case of the noun it describes. The dictionary ' +
        'gives the masculine form, ending in **-y**: {dobry} "good", {novy} "new". With a ' +
        'feminine noun it ends in **-a**, with a neuter one in **-o**:',
    },
    {
      kind: 'table',
      caption: 'One adjective, three genders',
      head: ['', 'Adjective + noun', 'Meaning'],
      rows: [
        ['masculine', 'dobry denj', 'good day'],
        ['feminine', 'nova kniga', 'new book'],
        ['neuter', 'novo selo', 'new village'],
      ],
      isvColumns: [1],
    },
    { kind: 'example', isv: 'To jest krasiva poema.', en: "It's a beautiful poem.", note: 'Tatoeba 12989674', tryIt: true },
    { kind: 'example', isv: 'Medžuslovjansky jest moja nova obsesija.', en: 'Interslavic is my new obsession.', note: 'Tatoeba 12994632' },

    { kind: 'h2', text: 'All the forms' },
    {
      kind: 'p',
      text:
        'The endings are the same for every adjective. As with nouns, the accusative of an ' +
        '**animate** masculine noun looks like the genitive ({dobrogo brata}), and in the plural ' +
        'only animate masculine nouns are different ({dobri brati}, but {dobre ženy}, {dobre ' +
        'domy}).',
    },
    agreement('dobry "good"', 'dobry', [
      ['dobry', 'dobry', 'dobro', 'dobra', 'dobri', 'dobre'],
      ['dobrogo', 'dobry', 'dobro', 'dobru', 'dobryh', 'dobre'],
      ['dobrogo', 'dobrogo', 'dobrogo', 'dobroj', 'dobryh', 'dobryh'],
      ['dobromu', 'dobromu', 'dobromu', 'dobroj', 'dobrym', 'dobrym'],
      ['dobrym', 'dobrym', 'dobrym', 'dobroju', 'dobrymi', 'dobrymi'],
      ['dobrom', 'dobrom', 'dobrom', 'dobroj', 'dobryh', 'dobryh'],
    ]),
    {
      kind: 'p',
      text:
        'After **š ž č j** the stem is soft: every **o** of the ending becomes **e**, and every ' +
        '**y** becomes **i** - {svěži} "fresh", {svěže}, {svěžego}, {svěžim}.',
    },

    { kind: 'h2', text: 'Whose: Petrov, materin' },
    {
      kind: 'p',
      text:
        'From a single name you can make an adjective of ownership: **-ov** for a man, **-in** for ' +
        'a woman. {Petrov dom} "Peter\'s house", {Petrova kniga} "Peter\'s book". When the owner ' +
        'is more than one word, use the genitive instead: {kniga mojego brata} "my brother\'s book".',
    },

    { kind: 'h2', text: 'Adverbs' },
    {
      kind: 'p',
      text:
        'The neuter form doubles as the adverb: {dobro} "well", {novo} "newly", {prosto} "simply".',
    },

    { kind: 'h2', text: 'Comparing' },
    {
      kind: 'p',
      text:
        'The easy way works for every adjective: put {bolje} or {vyše} "more" in front: {bolje ' +
        'prosty} "simpler". The usual way replaces **-y** with **-ějši**: {novy} → {novějši} ' +
        '"newer", {prosty} → {prostějši}. For "the most", add **naj-**: {najnovějši} "newest".',
    },
    {
      kind: 'table',
      caption: 'Comparatives with a form of their own',
      head: ['Adjective', 'Comparative', 'Superlative'],
      rows: [
        ['dobry "good"', 'lěpši / lučši', 'najlěpši'],
        ['zly "bad"', 'gorši', 'najgorši'],
        ['veliky "big"', 'večši / bolši', 'največši'],
        ['maly "small"', 'menši', 'najmenši'],
      ],
      isvColumns: [1, 2],
    },
    { kind: 'source', url: ADJECTIVES, title: 'Jan van Steenbergen, Interslavic adjectives' },
    {
      kind: 'source',
      url: 'https://tatoeba.org/en/sentences/search?from=isv',
      title: 'Example sentences: Tatoeba (CC BY 2.0 FR), numbered by sentence',
    },

    { kind: 'h2', text: 'Check yourself' },
    {
      kind: 'choice',
      prompt: '___ kniga "a good book"',
      options: ['dobry', 'dobra', 'dobro'],
      answer: 'dobra',
      why: '{kniga} is feminine, so the adjective ends in -a.',
    },
    {
      kind: 'choice',
      prompt: 'Ja imam ___ brata. "I have a good brother."',
      options: ['dobry', 'dobrogo', 'dobru'],
      answer: 'dobrogo',
      why: 'The accusative of an animate masculine noun is like the genitive - for its adjective too.',
    },
    {
      kind: 'fill',
      prompt: '"newer": the comparative of {novy}',
      answer: 'novějši',
      why: '-y becomes -ějši.',
    },
    {
      kind: 'fill',
      prompt: '"better": the comparative of {dobry} (either form)',
      answer: 'lěpši',
      accept: ['lučši'],
      why: 'One of the adjectives with a comparative of its own: {lěpši} or {lučši}.',
    },
  ],
};

export default adjectives;
