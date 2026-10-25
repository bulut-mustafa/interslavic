import type { LessonPage } from '../types.ts';

const STEEN = 'http://steen.free.fr/interslavic/';
const FAQ = 'http://steen.free.fr/interslavic/faq.html';

const introduction: LessonPage = {
  slug: 'introduction',
  title: 'Introduction',
  summary: 'What Interslavic is, where it comes from, and how these pages work.',
  section: 'Start',
  blocks: [
    { kind: 'h2', text: 'What Interslavic is' },
    {
      kind: 'p',
      text:
        'Interslavic - in its own words {Medžuslovjansky} - is a language for talking across the ' +
        'Slavic world. Russian, Polish, Czech, Serbian and the other Slavic languages are close ' +
        'relatives: a speaker of one usually gets the gist of a text in another. Interslavic is ' +
        'built from what they share, so that one text can be read by all of them, mostly without ' +
        'any study.',
    },
    {
      kind: 'p',
      text:
        'It is not meant to replace anyone\'s language. Think of it as the common ground that ' +
        'Slavs have always found when talking to their neighbours, written down with a grammar and ' +
        'a dictionary so that it is the same for everyone.',
    },
    { kind: 'example', isv: 'Medžuslovjansky jest moja nova obsesija.', en: 'Interslavic is my new obsession.', note: 'Tatoeba 12994632' },
    { kind: 'example', isv: 'Vy znajete tu knigu.', en: 'You know that book.', note: 'Tatoeba 13125304', tryIt: true },

    { kind: 'h2', text: 'Where it comes from' },
    {
      kind: 'p',
      text:
        'The idea is old: Old Church Slavonic, from the 9th century, was already a written ' +
        'language shared across Slavic lands, and many pan-Slavic projects followed from the 16th ' +
        'century on. Today\'s Interslavic grew out of two of them. **Slovianski** (2006) aimed at a ' +
        'simple, natural language based on the living Slavic languages; **Neoslavonic** (2009) was ' +
        'a modern version of Old Church Slavonic. The two worked together, grew closer and merged; ' +
        'the current standard dates from 2017.',
    },
    {
      kind: 'p',
      text:
        'In 2019 Interslavic was the language of the villagers in the film *The Painted Bird*, and ' +
        'in April 2024 it received its own international language code, `isv`.',
    },
    { kind: 'source', url: STEEN, title: 'Jan van Steenbergen, Interslavic - welcome page' },

    { kind: 'h2', text: 'Who understands it' },
    {
      kind: 'p',
      text:
        'Not every Slav understands every word - if all Slavic languages used the same words, ' +
        'there would be nothing to build. Interslavic picks the words understood by the most ' +
        'nations, and a reader fills in the rest from the sentence. In the research its authors ' +
        'describe, most people understood written and spoken Interslavic reasonably well; Czechs ' +
        'and Slovaks a little better than average, South Slavs a little worse.',
    },
    {
      kind: 'note',
      text:
        'When you speak it, help your listener: speak slowly and clearly, and check that you are ' +
        'understood.',
    },
    { kind: 'source', url: FAQ, title: 'Interslavic FAQ - "Is it true that all Slavs can understand Interslavic?"' },
    {
      kind: 'source',
      url: 'https://tatoeba.org/en/sentences/search?from=isv',
      title: 'Example sentences: Tatoeba, written by Interslavic users (CC BY 2.0 FR), numbered by sentence',
    },

    { kind: 'h2', text: 'Two alphabets, both correct' },
    {
      kind: 'p',
      text:
        'The line between the Latin and the Cyrillic alphabet runs right through the Slavic ' +
        'world, so Interslavic uses both, and treats them as equally correct. Every example on ' +
        'these pages is shown in both: Latin on top, Cyrillic below. The [Alphabet](/learn/alphabet) ' +
        'lesson goes through the letters.',
    },
    { kind: 'example', isv: 'Dobry denj!', en: 'Good afternoon!', note: 'Tatoeba 12977822' },

    { kind: 'h2', text: 'How these pages work' },
    {
      kind: 'p',
      text:
        'Read the lessons in order, or jump to what you need from the list. **Start** covers the ' +
        'letters and sounds, **Grammar** how words change and combine, and the ' +
        '[Phrasebook](/phrasebook) has everyday sentences to learn by heart.',
    },
    {
      kind: 'p',
      text:
        'Some examples have a link that opens them in the translator, where you can click each ' +
        'word to see why it has its form. Small exercises check what you have read. Your progress ' +
        'is remembered in this browser only - nothing about you is sent anywhere.',
    },
    {
      kind: 'p',
      text:
        'The facts here come from the grammar by Jan van Steenbergen, one of the language\'s ' +
        'authors, from the Interslavic dictionary, and from real sentences written by its users. ' +
        'Each page names its sources.',
    },

    { kind: 'h2', text: 'Check yourself' },
    {
      kind: 'choice',
      prompt: 'Which alphabet is correct for writing Interslavic?',
      english: true,
      options: ['Only Latin', 'Only Cyrillic', 'Both, equally'],
      answer: 'Both, equally',
      why: 'Latin and Cyrillic are treated as equally correct.',
    },
    {
      kind: 'choice',
      prompt: 'What does Interslavic build on?',
      english: true,
      options: [
        'What the Slavic languages share',
        'One Slavic language, simplified',
        'Latin and Greek roots',
      ],
      answer: 'What the Slavic languages share',
      why: 'It uses the words and forms understood by the most Slavic nations.',
    },
  ],
};

export default introduction;
