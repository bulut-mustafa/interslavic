import type { LessonPage } from '../types.ts';

const NOUNS = 'http://steen.free.fr/interslavic/nouns.html';

const nouns: LessonPage = {
  slug: 'nouns',
  title: 'Nouns and gender',
  summary: 'Masculine, feminine and neuter; one and many; and how to tell which is which.',
  section: 'Grammar',
  blocks: [
    { kind: 'h2', text: 'No "the", no "a"' },
    {
      kind: 'p',
      text:
        'Interslavic, like most Slavic languages, has no words for "the" and "a". {knigu} is "the ' +
        'book" or "a book" - the situation tells you which.',
    },
    { kind: 'example', isv: 'Vy hočete knigu?', en: 'Do you want the book?', note: 'Tatoeba 13525298' },
    { kind: 'example', isv: 'Dajte studentu knigu.', en: 'Give a book to the student.', note: 'Tatoeba 13467190' },

    { kind: 'h2', text: 'Three genders' },
    {
      kind: 'p',
      text:
        'Every noun is **masculine**, **feminine** or **neuter**. For people and animals it ' +
        'usually follows the sex; for things it follows the ending, and the ending almost always ' +
        'tells you:',
    },
    {
      kind: 'table',
      caption: 'Telling the gender from the ending',
      head: ['Ends in', 'Gender', 'Examples'],
      rows: [
        ['a consonant', 'masculine', '{brat} brother, {dom} house, {kraj} country'],
        ['-o or -e', 'neuter', '{slovo} word, {morje} sea, {ime} name'],
        ['-a', 'feminine', '{žena} woman, {zemja} earth, {voda} water'],
        ['a consonant, mostly -ost', 'feminine', '{kost} bone, {noč} night'],
      ],
    },
    {
      kind: 'note',
      text:
        'A consonant ending is usually masculine, but a group of feminine nouns ends in a ' +
        'consonant too - most of them in **-ost**. And a few nouns in **-a** name men, such as ' +
        '{sluga} "servant": they are masculine, though they change like {žena} in the singular.',
    },

    { kind: 'h2', text: 'Living and not living' },
    {
      kind: 'p',
      text:
        'Masculine nouns come in two kinds: **animate** - people and animals, like {brat} and ' +
        '{konj} - and **inanimate**, everything else, like {dom}. The difference shows when the ' +
        'noun is the object of a verb (the [cases](/learn/cases) lesson shows how), and in the ' +
        'plural.',
    },

    { kind: 'h2', text: 'Hard and soft' },
    {
      kind: 'p',
      text:
        'A noun whose stem ends in **š ž č c j lj nj** is *soft*; the rest are *hard*. Soft stems ' +
        'take slightly different endings - most often an **e** where hard stems have **o** or ' +
        '**y**: {slovo} but {morje}, {domy} but {kraje}.',
    },

    { kind: 'h2', text: 'More than one' },
    {
      kind: 'table',
      caption: 'The plural, in the basic form',
      head: ['Kind of noun', 'One', 'Many'],
      rows: [
        ['masculine, animate', 'brat', 'brati'],
        ['masculine, inanimate', 'dom', 'domy'],
        ['masculine, soft', 'kraj', 'kraje'],
        ['neuter', 'slovo', 'slova'],
        ['feminine in -a', 'žena', 'ženy'],
        ['feminine, soft', 'zemja', 'zemje'],
        ['feminine, consonant', 'kost', 'kosti'],
      ],
      isvColumns: [1, 2],
    },
    {
      kind: 'p',
      text:
        'Four common nouns have a plural of their own: {člověk} "person" - {ljudi} "people", ' +
        '{děte} "child" - {děti} "children", {oko} "eye" - {oči} "eyes", {uho} "ear" - {uši} ' +
        '"ears".',
    },
    {
      kind: 'p',
      text:
        'International words ending in **-e**, **-i** or **-u**, like {taksi} and {kafe}, do not ' +
        'change at all.',
    },
    { kind: 'source', url: NOUNS, title: 'Jan van Steenbergen, Interslavic nouns' },
    {
      kind: 'source',
      url: 'https://tatoeba.org/en/sentences/search?from=isv',
      title: 'Example sentences: Tatoeba (CC BY 2.0 FR), numbered by sentence',
    },

    { kind: 'h2', text: 'Check yourself' },
    {
      kind: 'choice',
      prompt: 'What gender is {voda} "water"?',
      english: true,
      options: ['masculine', 'feminine', 'neuter'],
      answer: 'feminine',
      why: 'It ends in -a.',
    },
    {
      kind: 'choice',
      prompt: 'What gender is {selo} "village"?',
      english: true,
      options: ['masculine', 'feminine', 'neuter'],
      answer: 'neuter',
      why: 'It ends in -o.',
    },
    {
      kind: 'choice',
      prompt: 'The plural of {syn} "son"?',
      options: ['syny', 'syni', 'syna'],
      answer: 'syni',
      why: 'A son is animate, and animate masculine nouns take -i in the plural, like {brati}.',
    },
    {
      kind: 'fill',
      prompt: 'The plural of {kniga} "book":',
      answer: 'knigy',
      why: 'Feminine nouns in -a take -y, like {ženy}.',
    },
    {
      kind: 'fill',
      prompt: 'The plural of {člověk} "person":',
      answer: 'ljudi',
      why: 'One of the four nouns with a plural of its own.',
    },
  ],
};

export default nouns;
