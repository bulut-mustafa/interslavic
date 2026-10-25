import type { LessonPage } from '../types.ts';

const NUMERALS = 'http://steen.free.fr/interslavic/numerals.html';

const numerals: LessonPage = {
  slug: 'numerals',
  title: 'Numbers',
  summary: 'Counting, the noun after a number, and first, second, third.',
  section: 'Grammar',
  blocks: [
    { kind: 'h2', text: 'Zero to ten' },
    {
      kind: 'table',
      caption: 'The first numbers',
      head: ['', 'Number', ''],
      rows: [
        ['0', 'nula', ''],
        ['1', 'jedin', 'jedna, jedno for feminine and neuter'],
        ['2', 'dva', 'dvě for feminine'],
        ['3', 'tri', ''],
        ['4', 'četyri', ''],
        ['5', 'pet', ''],
        ['6', 'šest', ''],
        ['7', 'sedm', ''],
        ['8', 'osm', ''],
        ['9', 'devet', ''],
        ['10', 'deset', ''],
      ],
      isvColumns: [1],
    },

    { kind: 'h2', text: 'Building bigger numbers' },
    {
      kind: 'table',
      caption: 'Teens, tens and hundreds follow a pattern',
      head: ['Pattern', 'Example', 'Number'],
      rows: [
        ['+ -nadset (said "-nacet") for 11-19', 'dvanadset', '12'],
        ['+ -deset for 20-90', 'petdeset', '50'],
        ['+ -sto for 200-900', 'tristo', '300'],
        ['', 'sto', '100'],
        ['', 'tyseč', '1000'],
        ['', 'milion', '1 000 000'],
      ],
      isvColumns: [1],
    },
    {
      kind: 'p',
      text:
        'Say them from big to small, with {i} "and" before the last if you like: {tri tyseč ' +
        'četyristo petdeset i šest} = 3456. In writing, digits are often the clearest choice of ' +
        'all - every Slav reads them.',
    },

    { kind: 'h2', text: 'The noun after a number' },
    {
      kind: 'table',
      caption: 'Which form of the noun to use',
      head: ['After', 'The noun is', 'Example'],
      rows: [
        ['1', 'singular', 'jedin dom'],
        ['2, 3, 4', 'plural', 'dva domy'],
        ['5 and more', 'genitive plural', 'pet domov'],
      ],
      isvColumns: [2],
    },
    {
      kind: 'p',
      text:
        'Five and up behave like "five of houses" - the genitive plural. Some Slavic languages ' +
        'use other forms after 2-4, but this rule is the one recommended for Interslavic because ' +
        'it is the clearest.',
    },

    { kind: 'h2', text: 'First, second, third' },
    {
      kind: 'p',
      text:
        'Ordinal numbers are adjectives, and agree like {dobry}: {prvy} "first", {drugy} ' +
        '"second", {tretji} "third", {četvrty} "fourth". From five on, add **-y** to the number: ' +
        '{pety} "fifth", {desety} "tenth". {prva kniga} "the first book".',
    },
    {
      kind: 'p',
      text:
        'For "half" say {pol} or {polovina}; other fractions end in **-ina**, like {četvrtina} ' +
        '"a quarter".',
    },

    { kind: 'h2', text: 'Some, many, how many' },
    {
      kind: 'p',
      text:
        '{mnogo} "much, many", {malo} "little, few", {koliko} "how many", {několiko} "a few" - ' +
        'like five and up, they are followed by the genitive plural: {mnogo domov}.',
    },
    { kind: 'source', url: NUMERALS, title: 'Jan van Steenbergen, Interslavic numerals' },

    { kind: 'h2', text: 'Check yourself' },
    {
      kind: 'choice',
      prompt: 'tri ___ "three houses"',
      options: ['dom', 'domy', 'domov'],
      answer: 'domy',
      why: 'After 2, 3 and 4 the noun is in the plural.',
    },
    {
      kind: 'choice',
      prompt: 'šest ___ "six houses"',
      options: ['dom', 'domy', 'domov'],
      answer: 'domov',
      why: 'From 5 up, the genitive plural.',
    },
    {
      kind: 'fill',
      prompt: '"twenty":',
      answer: 'dvadeset',
      why: 'dva + -deset.',
    },
    {
      kind: 'fill',
      prompt: '"the third":',
      answer: 'tretji',
      why: 'One of the four ordinals with a form of its own.',
    },
  ],
};

export default numerals;
