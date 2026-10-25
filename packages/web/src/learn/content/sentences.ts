import type { LessonPage } from '../types.ts';

const SYNTAX = 'http://steen.free.fr/interslavic/syntax.html';

const sentences: LessonPage = {
  slug: 'sentences',
  title: 'Sentences',
  summary: 'Word order, asking questions, saying no, and "so that".',
  section: 'Grammar',
  blocks: [
    { kind: 'h2', text: 'Word order' },
    {
      kind: 'p',
      text:
        'Because endings show who does what, word order is free. The clearest order, and the ' +
        'one to use by default, is the English one: **subject - verb - object**. Adjectives ' +
        'usually come before their noun.',
    },
    { kind: 'example', isv: 'Vy znajete tu knigu.', en: 'You know that book.', note: 'Tatoeba 13125304', tryIt: true },

    { kind: 'h2', text: 'Yes-or-no questions' },
    {
      kind: 'p',
      text:
        'There are three ways to ask. Raise your voice at the end of a normal sentence; or start ' +
        'it with {či}; or put {li} straight after the word you are asking about, usually the ' +
        'verb:',
    },
    {
      kind: 'table',
      caption: '"Has father bought a book?" three ways',
      head: ['How', 'Question'],
      rows: [
        ['just the voice', 'Otec kupil knigu?'],
        ['či at the start', 'Či otec kupil knigu?'],
        ['li after the verb', 'Kupil li otec knigu?'],
      ],
      isvColumns: [1],
    },

    { kind: 'h2', text: 'Questions with a question word' },
    {
      kind: 'p',
      text:
        'Put the question word first: {kto} "who", {čto} "what", {kde} "where", {kogda} "when", ' +
        '{kako} "how", {začto} "why".',
    },
    { kind: 'example', isv: 'Čto jest to?', en: "What's that?", note: 'Tatoeba 12984803', tryIt: true },
    { kind: 'example', isv: 'Kde otec kupil tu knigu?', en: 'Where did father buy that book?' },

    { kind: 'h2', text: 'Saying no' },
    {
      kind: 'p',
      text:
        'Put {ne} "not" right before the word it negates - usually the verb: {Ja ne hoču idti v ' +
        'kino} "I don\'t want to go to the cinema".',
    },
    {
      kind: 'p',
      text:
        '**Every word that can be negative is negative.** English says "nobody came"; ' +
        'Interslavic says "nobody not came": {Nikto ne prijehal} "Nobody came", {Ja nikogda ne ' +
        'jem čokoladu} "I never eat chocolate". The {ne} stays even with {nikto}, {ničto}, ' +
        '{nikogda}, {nikde}.',
    },
    {
      kind: 'note',
      text:
        'After a negated verb, the object may be genitive instead of accusative - {Moj brat ne je ' +
        'hlěb} and {Moj brat ne je hlěba} both mean "My brother doesn\'t eat bread". Either is ' +
        'correct.',
    },

    { kind: 'h2', text: 'In order to: da by, že by' },
    {
      kind: 'p',
      text:
        'To say what something is *for*, use {da by} or {že by} with the **-l** form of the verb: ' +
        '{Ona prinosi jabloka, da by děti byli zdrave} "She brings apples so that the children ' +
        'will be healthy".',
    },
    { kind: 'source', url: SYNTAX, title: 'Jan van Steenbergen, Interslavic syntax (the examples are his)' },
    {
      kind: 'source',
      url: 'https://tatoeba.org/en/sentences/search?from=isv',
      title: 'Example sentences: Tatoeba (CC BY 2.0 FR), numbered by sentence',
    },

    { kind: 'h2', text: 'Check yourself' },
    {
      kind: 'choice',
      prompt: '"I never eat chocolate."',
      options: ['Ja nikogda jem čokoladu.', 'Ja nikogda ne jem čokoladu.'],
      answer: 'Ja nikogda ne jem čokoladu.',
      why: 'With {nikogda} the verb keeps its {ne}.',
    },
    {
      kind: 'choice',
      prompt: 'Where does {li} go in a question?',
      english: true,
      options: ['At the end of the sentence', 'Right after the word asked about', 'Before the verb'],
      answer: 'Right after the word asked about',
      why: 'Usually right after the verb: {Kupil li otec knigu?}',
    },
    {
      kind: 'fill',
      prompt: 'Ja ___ hoču. "I don\'t want (it)."',
      answer: 'ne',
      why: '{ne} goes right before the verb.',
    },
  ],
};

export default sentences;
