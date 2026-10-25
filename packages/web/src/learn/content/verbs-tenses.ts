import type { LessonPage } from '../types.ts';
import { conjugation, IMPERATIVE_PERSONS } from './helpers.ts';

const VERBS = 'http://steen.free.fr/interslavic/verbs.html';

const verbsTenses: LessonPage = {
  slug: 'verbs-tenses',
  title: 'Verbs: past, future, would, commands',
  summary: 'The past with -l, the future with budu, "would" with by, and the imperative.',
  section: 'Grammar',
  blocks: [
    { kind: 'h2', text: 'The past' },
    {
      kind: 'p',
      text:
        'The past is made from two words: the present of {byti} ({jesm}, {jesi}...) and a form ' +
        'of the verb ending in **-l**. That form takes the gender of the subject: **-l** for a ' +
        'man, **-la** for a woman, **-lo** for a neuter noun, **-li** for several.',
    },
    {
      kind: 'table',
      caption: 'dělati "to do" in the past',
      head: ['', 'man', 'woman'],
      rows: [
        ['ja', 'jesm dělal', 'jesm dělala'],
        ['ty', 'jesi dělal', 'jesi dělala'],
        ['on / ona', 'dělal', 'dělala'],
        ['my', 'jesmo dělali', 'jesmo dělali'],
        ['vy', 'jeste dělali', 'jeste dělali'],
        ['oni / one', 'dělali', 'dělali'],
      ],
      isvColumns: [1, 2],
    },
    {
      kind: 'p',
      text:
        'In the third person - he, she, it, they - the {jest} or {sut} is usually left out. Take ' +
        'off **-ti** and add **-l**: {nesti} → {nesl}, {hvaliti} → {hvalil}. The one exception ' +
        'is {idti} "to go": {šel}, {šla}, {šli}.',
    },
    { kind: 'example', isv: 'On žil s nami.', en: 'He lived with us.', note: 'Tatoeba 13843377', tryIt: true },

    { kind: 'h2', text: 'The future' },
    {
      kind: 'p',
      text:
        'For the future, put {budu} - the future of {byti} - before the infinitive. {budu} ' +
        'changes for the person like a present tense; the infinitive stays as it is.',
    },
    {
      kind: 'table',
      caption: 'dělati in the future',
      head: ['', 'future'],
      rows: [
        ['ja', 'budu dělati'],
        ['ty', 'budeš dělati'],
        ['on / ona / ono', 'bude dělati'],
        ['my', 'budemo dělati'],
        ['vy', 'budete dělati'],
        ['oni / one', 'budut dělati'],
      ],
      isvColumns: [1],
    },
    { kind: 'example', isv: 'Ja budu s vami.', en: "I'll be with you.", note: 'Tatoeba 13000110', tryIt: true },
    {
      kind: 'note',
      text:
        'Russian, Polish and Czech also use the present of a perfective verb for the future. ' +
        'Avoid that in Interslavic: South Slavs may read it as a present. Say {budu} + infinitive.',
    },

    { kind: 'h2', text: '"Would": by' },
    {
      kind: 'p',
      text:
        'For "would", use {by} with the **-l** form: {ja byh dělal} "I would do". {by} changes ' +
        'for the person: {byh}, {bys}, {by}, {byhmo}, {byste}, {by}.',
    },
    {
      kind: 'table',
      caption: 'dělati with "would"',
      head: ['', 'would do'],
      rows: [
        ['ja', 'byh dělal / dělala'],
        ['ty', 'bys dělal / dělala'],
        ['on / ona', 'by dělal / dělala'],
        ['my', 'byhmo dělali'],
        ['vy', 'byste dělali'],
        ['oni / one', 'by dělali'],
      ],
      isvColumns: [1],
    },

    { kind: 'h2', text: 'Commands' },
    {
      kind: 'p',
      text:
        'The imperative has three forms: to one person you know well, "let\'s", and to several ' +
        'people or one person politely (the {vy} form).',
    },
    conjugation('The imperative', { Mood: 'Imp', VerbForm: 'Fin' }, [
      { lemma: 'dělati', xpos: 'v.tr. ipf.', forms: ['dělaj', 'dělajmo', 'dělajte'] },
      { lemma: 'nesti', xpos: 'v.tr. ipf.', forms: ['nesi', 'nesimo', 'nesite'] },
      { lemma: 'hvaliti', xpos: 'v.tr. ipf.', forms: ['hvali', 'hvalimo', 'hvalite'] },
    ], IMPERATIVE_PERSONS),
    { kind: 'example', isv: 'Daj studentu knigu.', en: 'Give a book to the student.', note: 'to a friend - Tatoeba 13467189' },
    { kind: 'example', isv: 'Dajte studentu knigu.', en: 'Give a book to the student.', note: 'polite or to several - Tatoeba 13467190' },
    {
      kind: 'p',
      text:
        'For "let him...", use {nehaj}: {Nehaj žive dolgo!} "May he live long!"',
    },
    { kind: 'source', url: VERBS, title: 'Jan van Steenbergen, Interslavic verbs' },
    {
      kind: 'source',
      url: 'https://tatoeba.org/en/sentences/search?from=isv',
      title: 'Example sentences: Tatoeba (CC BY 2.0 FR), numbered by sentence',
    },

    { kind: 'h2', text: 'Check yourself' },
    {
      kind: 'choice',
      prompt: 'Ona ___ knigu. "She was reading a book." ({čitati})',
      options: ['čital', 'čitala', 'čitalo'],
      answer: 'čitala',
      why: 'The -l form takes the gender of the subject: a woman, so -la.',
    },
    {
      kind: 'choice',
      prompt: 'My ___ dělati. "We will do (it)."',
      options: ['budu', 'budemo', 'budete'],
      answer: 'budemo',
      why: '{budu} changes for the person; "we" is {budemo}.',
    },
    {
      kind: 'fill',
      prompt: 'Ja ___ dělal. "I would do (it)."',
      answer: 'byh',
      why: 'Would = {by} with the -l form; for "I" it is {byh}.',
    },
    {
      kind: 'fill',
      prompt: '___ ! "Do (it)!" - to several people ({dělati})',
      answer: 'dělajte',
      why: 'The vy form of the imperative ends in -te.',
    },
  ],
};

export default verbsTenses;
