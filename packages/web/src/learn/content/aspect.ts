import type { LessonPage } from '../types.ts';

const VERBS = 'http://steen.free.fr/interslavic/verbs.html';

const aspect: LessonPage = {
  slug: 'aspect',
  title: 'Aspect',
  summary: 'Why most verbs come in pairs, and how to choose between them.',
  section: 'Grammar',
  names: ['Igor'],
  blocks: [
    { kind: 'h2', text: 'Two verbs for one action' },
    {
      kind: 'p',
      text:
        'Most Slavic verbs come in pairs. Both mean the same action, but they look at it ' +
        'differently. The **imperfective** verb looks at the action itself - going on, ' +
        'repeated, a habit. The **perfective** verb looks at its result - done, finished, ' +
        'complete. The dictionary lists both, marked *ipf.* and *pf.*',
    },
    {
      kind: 'table',
      caption: 'Same action, two aspects',
      head: ['', 'Interslavic', 'Meaning'],
      rows: [
        ['imperfective', 'ja jesm čital knigu', 'I was reading a book'],
        ['perfective', 'ja jesm pročital knigu', 'I have read a book - and finished it'],
      ],
      isvColumns: [1],
    },

    { kind: 'h2', text: 'Making a pair' },
    {
      kind: 'p',
      text:
        'A plain verb with no prefix is almost always imperfective. Adding a prefix usually makes ' +
        'it perfective:',
    },
    {
      kind: 'table',
      caption: 'Perfective by a prefix',
      head: ['Meaning', 'Imperfective', 'Perfective'],
      rows: [
        ['to do', 'dělati', 'sdělati'],
        ['to clean', 'čistiti', 'izčistiti'],
        ['to write', 'pisati', 'napisati'],
      ],
      isvColumns: [1, 2],
    },
    {
      kind: 'p',
      text:
        'Often a prefix also changes the meaning - {zapisati} "to record", {podpisati} "to sign" ' +
        '- and the new perfective verb then gets an imperfective of its own, longer one: ' +
        '{dokazati} → {dokazyvati} "to prove", {priznati} → {priznavati} "to acknowledge".',
    },

    { kind: 'h2', text: 'Which one to use' },
    {
      kind: 'table',
      caption: 'A rule of thumb',
      head: ['Use the imperfective for...', 'Use the perfective for...'],
      rows: [
        ['an action in progress: *was reading*', 'a finished action: *has read*'],
        ['a habit or repeated action: *read every day*', 'one complete action: *read it through*'],
        ['the present tense: *I read, I am reading*', 'a result in the past or future'],
      ],
    },
    {
      kind: 'note',
      text:
        'The present of a perfective verb means the future in Russian, Polish and Czech, but not ' +
        'everywhere. In Interslavic use the imperfective for the present, and {budu} + ' +
        'infinitive for the future - the [tenses](/learn/verbs-tenses) lesson shows how.',
    },

    { kind: 'h2', text: 'Verbs of motion' },
    {
      kind: 'p',
      text:
        'Verbs of going have three forms: moving about with no single direction, going ' +
        'somewhere, and having gone.',
    },
    {
      kind: 'table',
      caption: 'Going on foot and going by vehicle',
      head: ['', 'no direction', 'one direction', 'perfective'],
      rows: [
        ['on foot', 'hoditi', 'idti', 'pojdti'],
        ['by vehicle', 'jezditi', 'jehati', 'pojehati'],
      ],
      isvColumns: [1, 2, 3],
    },
    {
      kind: 'p',
      text:
        '{Igor jezdil po Moskvě} - Igor was driving around in Moscow; {Igor jehal do Moskvy} - ' +
        'he was driving to Moscow; {Igor pojehal do Moskvy} - he has gone to Moscow.',
    },
    { kind: 'source', url: VERBS, title: 'Jan van Steenbergen, Interslavic verbs - aspect' },

    { kind: 'h2', text: 'Check yourself' },
    {
      kind: 'choice',
      prompt: '"I have written the letter (it is finished)." Which verb?',
      options: ['pisati', 'napisati'],
      answer: 'napisati',
      why: 'A finished action with a result is perfective.',
    },
    {
      kind: 'choice',
      prompt: '"Every day I write a letter." Which verb?',
      options: ['pisati', 'napisati'],
      answer: 'pisati',
      why: 'A habit is imperfective.',
    },
    {
      kind: 'choice',
      prompt: 'Without a prefix, a verb is usually...',
      english: true,
      options: ['imperfective', 'perfective'],
      answer: 'imperfective',
      why: 'Prefixes usually make verbs perfective.',
    },
  ],
};

export default aspect;
