import type { LessonPage } from '../types.ts';
import { conjugation } from './helpers.ts';

const VERBS = 'http://steen.free.fr/interslavic/verbs.html';
const PRESENT = { Tense: 'Pres', Mood: 'Ind', VerbForm: 'Fin' };

const verbsPresent: LessonPage = {
  slug: 'verbs-present',
  title: 'Verbs: the present',
  summary: 'The infinitive, the two sets of present endings, and the verb "to be".',
  section: 'Grammar',
  blocks: [
    { kind: 'h2', text: 'The infinitive ends in -ti' },
    {
      kind: 'p',
      text:
        'The dictionary gives every verb in the infinitive, and it always ends in **-ti**: ' +
        '{dělati} "to do", {nesti} "to carry", {hvaliti} "to praise", {viděti} "to see". Take ' +
        'off **-ti** and you have the stem the other forms are built on.',
    },

    { kind: 'h2', text: 'Two sets of endings' },
    {
      kind: 'p',
      text:
        'In the present, a verb changes its ending for the person. There are two sets. Verbs in ' +
        '**-iti** and most in **-ěti** take the second set, with **-i-**; the rest take the first, ' +
        'with **-e-**. Verbs in **-ati** add a **j** before the ending: {dělaj-u}.',
    },
    conjugation('First set (-u, -eš, -e, ...) and second set (-ju, -iš, -i, ...)', PRESENT, [
      { lemma: 'dělati', xpos: 'v.tr. ipf.', forms: ['dělaju', 'dělaješ', 'dělaje', 'dělajemo', 'dělajete', 'dělajut'] },
      { lemma: 'nesti', xpos: 'v.tr. ipf.', forms: ['nesu', 'neseš', 'nese', 'nesemo', 'nesete', 'nesut'] },
      { lemma: 'hvaliti', xpos: 'v.tr. ipf.', forms: ['hvalju', 'hvališ', 'hvali', 'hvalimo', 'hvalite', 'hvalet'] },
      { lemma: 'viděti', xpos: 'v.tr. ipf.', forms: ['vidžu', 'vidiš', 'vidi', 'vidimo', 'vidite', 'videt'] },
    ]),
    {
      kind: 'note',
      text:
        'Other forms are correct too. For "I", **-em**/**-im** instead of **-u**/**-ju**: {nesem}, ' +
        '{hvalim} - the Slovak and South Slavic way, where **-u** is the East Slavic and Polish ' +
        'one. And verbs in -ati can contract **-aje-**, as West and South Slavic do: {dělam}, ' +
        '{dělaš}, {děla}.',
    },
    {
      kind: 'p',
      text:
        'Two sound changes to know: **k** and **g** become **č** and **ž** before **e** ' +
        '({mogti} "can" - {možeš}); and in the second set, "I" softens **s z t d** into **š ž č ' +
        'dž** ({prositi} "to ask" - {prošu}, {viděti} - {vidžu}).',
    },
    { kind: 'example', isv: 'Ja govorju s politikom.', en: "I'm talking to a politician.", note: 'Tatoeba 13820314' },
    { kind: 'example', isv: 'Vy znajete tu knigu.', en: 'You know that book.', note: 'Tatoeba 13125304', tryIt: true },

    { kind: 'h2', text: 'Verbs with a second stem' },
    {
      kind: 'p',
      text:
        'Some verbs build the present on a different stem, which the dictionary gives in ' +
        'brackets. Learn them as you meet them: {pisati} "to write" - {pišu}; {htěti} "to want" ' +
        '- {hoču}, {hočeš}; {spati} "to sleep" - {spi}; {zvati} "to call" - {zovu}; {brati} "to ' +
        'take" - {beru}.',
    },
    { kind: 'example', isv: 'Ty hočeš knigu?', en: 'Do you want the book?', note: 'Tatoeba 13525297' },

    { kind: 'h2', text: 'To be: byti' },
    conjugation('byti "to be" in the present', PRESENT, [
      { lemma: 'byti', xpos: 'v.intr. ipf.', forms: ['jesm', 'jesi', 'jest', 'jesmo', 'jeste', 'sut'] },
    ]),
    {
      kind: 'p',
      text:
        'For "he/she/it is" the short {je} is correct too.',
    },
    { kind: 'example', isv: 'Ona jest v školě.', en: "She's at school.", note: 'Tatoeba 12999978' },
    { kind: 'source', url: VERBS, title: 'Jan van Steenbergen, Interslavic verbs' },
    {
      kind: 'source',
      url: 'https://tatoeba.org/en/sentences/search?from=isv',
      title: 'Example sentences: Tatoeba (CC BY 2.0 FR), numbered by sentence',
    },

    { kind: 'h2', text: 'Check yourself' },
    {
      kind: 'choice',
      prompt: 'My ___ knigu. "We are carrying the book." ({nesti})',
      options: ['nesu', 'nesemo', 'nesete'],
      answer: 'nesemo',
      why: '"we" takes -emo in the first set.',
    },
    {
      kind: 'choice',
      prompt: 'Oni ___ . "They praise." ({hvaliti})',
      options: ['hvalut', 'hvalet', 'hvalimo'],
      answer: 'hvalet',
      why: 'Verbs in -iti take the second set, where "they" ends in -et.',
    },
    {
      kind: 'fill',
      prompt: 'Ty ___ . "You do." ({dělati})',
      answer: 'dělaješ',
      accept: ['dělaš'],
      why: 'First set, with the j of -ati: {dělaješ}, or short {dělaš}.',
    },
    {
      kind: 'fill',
      prompt: 'Ja ___ student. "I am a student."',
      answer: 'jesm',
      why: 'The present of {byti}: {jesm}, {jesi}, {jest}...',
    },
  ],
};

export default verbsPresent;
