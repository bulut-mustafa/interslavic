import type { LessonPage } from '../types.ts';

const STEEN = 'http://steen.free.fr/interslavic/';

const translatorGuide: LessonPage = {
  slug: 'reading-the-translator',
  title: 'Reading the translator',
  summary: 'What the translator shows under each word, and how far to trust it.',
  section: 'More',
  blocks: [
    { kind: 'h2', text: 'It shows its reasons' },
    {
      kind: 'p',
      text:
        'The [translator](/) works by rules, not by guessing from examples, and it shows its ' +
        'reasoning. Click any word of a translation and the panel below explains it: the ' +
        'dictionary word it comes from, and why it has the ending it has - "subject, so ' +
        'nominative", "after {s}, so instrumental".',
    },
    {
      kind: 'p',
      text:
        'Each reason links to what says so - usually a sentence from van Steenbergen\'s grammar - ' +
        'so you can check it, and learn the rule while you are at it.',
    },

    { kind: 'h2', text: 'The coloured line: how sure it is' },
    {
      kind: 'table',
      caption: 'The line beside each reason',
      head: ['Colour', 'Means'],
      rows: [
        ['teal', 'certain - a rule with no exceptions decided it'],
        ['blue', 'lexically governed - the dictionary or a word\'s own pattern decided it'],
        ['amber', 'a default - usually right, but exceptions exist'],
        ['plum', 'a guess - check this one'],
      ],
    },

    { kind: 'h2', text: 'Words left out, words not checked' },
    {
      kind: 'p',
      text:
        '**Left out** lists English words with nothing to translate into: "the" and "a", "do" in ' +
        'questions, "of" when the genitive does its job.',
    },
    {
      kind: 'p',
      text:
        '**Not verified** lists output words the translator could not find among the forms it ' +
        'knows - treat those with care. A word with no Interslavic match is kept in the original.',
    },

    { kind: 'h2', text: 'What it gets wrong' },
    {
      kind: 'p',
      text:
        'Grammar is its strong side; **word choice** is its weak side. English words often have ' +
        'several meanings ("party", "train", "fix"), and the translator can pick the wrong one. ' +
        'Idioms are translated word by word. If a word looks odd, click it: the panel shows which ' +
        'other words it considered.',
    },
    {
      kind: 'note',
      text:
        'Found a mistake? Press **Report a problem** under the translation. Every report is read ' +
        'and used to fix the rules.',
    },

    { kind: 'h2', text: 'The four spellings' },
    {
      kind: 'p',
      text:
        'The tabs above the output switch between standard **Latin**, **Cyrillic**, ' +
        '**Etymological** (with the optional historical marks) and **Simplified** (without ' +
        '**ě**). The other script is always shown in small type under the translation.',
    },
    { kind: 'source', url: STEEN, title: 'The rules come from Jan van Steenbergen\'s grammar pages' },
  ],
};

export default translatorGuide;
