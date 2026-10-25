import type { LessonPage } from '../types.ts';

const PREPOSITIONS = 'http://steen.free.fr/interslavic/prepositions.html';

const prepositions: LessonPage = {
  slug: 'prepositions',
  title: 'Prepositions',
  summary: 'The common prepositions, and the case each one takes.',
  section: 'Grammar',
  blocks: [
    { kind: 'h2', text: 'Every preposition takes a case' },
    {
      kind: 'p',
      text:
        'A noun after a preposition goes into the case that preposition asks for. Most take the ' +
        '**genitive**. For place and time there is a guideline: the genitive for moving *away ' +
        'from* somewhere, the accusative for moving *towards* or *into* it, and the instrumental ' +
        'or locative for being *in* a place.',
    },

    { kind: 'h2', text: 'The common ones' },
    {
      kind: 'table',
      caption: 'Prepositions with the genitive',
      head: ['Preposition', 'Meaning'],
      rows: [
        ['bez', 'without'],
        ['do', 'to, up to, until'],
        ['iz', 'from, out of'],
        ['od', 'from, away from; since; by (who did it)'],
        ['u', 'at, at the place of'],
        ['blizko', 'near'],
        ['dlja', 'for (the benefit of)'],
        ['poslě', 'after'],
        ['kromě', 'except'],
      ],
      isvColumns: [0],
    },
    {
      kind: 'table',
      caption: 'Other cases',
      head: ['Preposition', 'Case', 'Meaning'],
      rows: [
        ['k', 'dative', 'to, towards'],
        ['protiv', 'dative', 'against'],
        ['črěz', 'accusative', 'through, across'],
        ['s', 'instrumental', 'with'],
        ['o', 'locative', 'about'],
        ['pri', 'locative', 'near; during'],
      ],
      isvColumns: [0],
    },
    { kind: 'example', isv: 'Moj učitelj jest iz Ukrajiny.', en: 'My teacher comes from Ukraine.', note: '{iz} + genitive - Tatoeba 13820258' },
    { kind: 'example', isv: 'Ja govorju s politikom.', en: "I'm talking to a politician.", note: '{s} + instrumental - Tatoeba 13820314' },

    { kind: 'h2', text: 'In or into: two cases' },
    {
      kind: 'p',
      text:
        'Some prepositions of place take two cases, and the case says whether there is ' +
        'movement. {v} "in" and {na} "on": **locative** for a place, **accusative** for going ' +
        'into or onto it. {pod} "under", {nad} "over", {prěd} "in front of", {za} "behind" and ' +
        '{medžu} "between": **instrumental** for a place, **accusative** for a movement.',
    },
    {
      kind: 'table',
      caption: 'Place or movement',
      head: ['', 'Place (no movement)', 'Movement'],
      rows: [
        ['{v}', '{v školě} - at school', '{v školu} - to school'],
        ['{pod}', '{pod stolom} - under the table', '{pod stol} - (to) under the table'],
      ],
    },
    { kind: 'example', isv: 'Ona jest v školě.', en: "She's at school.", note: 'locative - Tatoeba 12999978' },
    { kind: 'example', isv: 'Kot poběgl pod stol.', en: 'The cat ran under the table.', note: 'accusative: a movement', tryIt: true },

    { kind: 'h2', text: 'He, she, they after a preposition' },
    {
      kind: 'p',
      text:
        'After a preposition, the pronouns for he, she, it and they begin with **n-**: {s njim} ' +
        '"with him", {do njej} "to her", {od njih} "from them".',
    },
    {
      kind: 'note',
      text:
        'Use a preposition for what it means, not because your own language uses it in an ' +
        'idiom - another Slav may not share the idiom.',
    },
    { kind: 'source', url: PREPOSITIONS, title: 'Jan van Steenbergen, Interslavic prepositions' },
    {
      kind: 'source',
      url: 'https://tatoeba.org/en/sentences/search?from=isv',
      title: 'Example sentences: Tatoeba (CC BY 2.0 FR), numbered by sentence',
    },

    { kind: 'h2', text: 'Check yourself' },
    {
      kind: 'choice',
      prompt: 'bez ___ "without water" ({voda})',
      options: ['voda', 'vodu', 'vody'],
      answer: 'vody',
      why: '{bez} takes the genitive.',
    },
    {
      kind: 'choice',
      prompt: 'Ja idu v ___ . "I am going to school."',
      options: ['školu', 'školě', 'škola'],
      answer: 'školu',
      why: 'Movement into a place: accusative.',
    },
    {
      kind: 'fill',
      prompt: 'Ja jesm s ___ . "I am with my brother." ({brat})',
      answer: 'bratom',
      why: '{s} "with" takes the instrumental.',
    },
  ],
};

export default prepositions;
