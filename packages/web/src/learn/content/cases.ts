import type { LessonPage } from '../types.ts';
import { declension } from './helpers.ts';

const NOUNS = 'http://steen.free.fr/interslavic/nouns.html';
const PREPOSITIONS = 'http://steen.free.fr/interslavic/prepositions.html';

const cases: LessonPage = {
  slug: 'cases',
  title: 'The cases',
  summary: 'Why nouns change their endings, what each case does, and the main patterns.',
  section: 'Grammar',
  names: ['Ivan', 'Ivane'],
  blocks: [
    { kind: 'h2', text: 'Endings show the role' },
    {
      kind: 'p',
      text:
        'English shows who does what by word order: *the brother sees the house*. Interslavic ' +
        'shows it with **endings**: a noun changes its ending for its role in the sentence. Each ' +
        'set of endings is a **case**. There are six, plus an optional seventh for calling to ' +
        'someone. If you speak a Slavic language, they will feel familiar - they are the cases ' +
        'Slavic languages share.',
    },

    { kind: 'h2', text: 'What each case does' },
    {
      kind: 'table',
      caption: 'The cases and their main jobs',
      head: ['Case', 'Main job', 'Example'],
      rows: [
        ['Nominative', 'the subject; the form in the dictionary', '{učitelj} teacher'],
        ['Accusative', 'the direct object; movement *into* or *onto*', '{knigu} the book'],
        ['Genitive', '"of"; after many prepositions, such as {iz} "from" and {bez} "without"', '{iz Ukrajiny} from Ukraine'],
        ['Dative', 'the person something is given or said *to*', '{studentu} to the student'],
        ['Instrumental', '*with*, *by means of*; a stable place after {pod}, {nad}, {za}', '{s politikom} with a politician'],
        ['Locative', 'only after a preposition: *in*, *on*, *about*', '{v školě} at school'],
        ['Vocative', 'calling someone (optional)', '{brate!} brother!'],
      ],
    },
    { kind: 'h2', text: 'The cases in sentences' },
    { kind: 'example', isv: 'Moj učitelj jest iz Ukrajiny.', en: 'My teacher comes from Ukraine.', note: 'nominative {učitelj}, genitive after {iz} - Tatoeba 13820258' },
    { kind: 'example', isv: 'Vy hočete knigu?', en: 'Do you want the book?', note: 'accusative object - Tatoeba 13525298', tryIt: true },
    { kind: 'example', isv: 'Dajte studentu knigu.', en: 'Give a book to the student.', note: 'dative {studentu}, accusative {knigu} - Tatoeba 13467190' },
    { kind: 'example', isv: 'Ja govorju s politikom.', en: "I'm talking to a politician.", note: 'instrumental after {s} - Tatoeba 13820314' },
    { kind: 'example', isv: 'Ja budu s vami.', en: "I'll be with you.", note: 'instrumental of {vy} - Tatoeba 13000110', tryIt: true },
    { kind: 'example', isv: 'Ona jest v školě.', en: "She's at school.", note: 'locative: where she is - Tatoeba 12999978' },

    { kind: 'h2', text: 'Moving or staying' },
    {
      kind: 'p',
      text:
        'A few prepositions take two cases, and the case tells you whether something moves. With ' +
        '{v} "in" and {na} "on", the **locative** means a place and the **accusative** a movement ' +
        'into it: {v školě} "at school", {v školu} "to school". With {pod} "under", {nad} ' +
        '"over", {prěd} "in front of", {za} "behind" and {medžu} "between", the place is ' +
        '**instrumental** and the movement accusative:',
    },
    { kind: 'example', isv: 'Kot spi pod stolom.', en: 'The cat is sleeping under the table.', note: 'instrumental: a place', tryIt: true },
    { kind: 'example', isv: 'Kot poběgl pod stol.', en: 'The cat ran under the table.', note: 'accusative: a movement', tryIt: true },
    { kind: 'source', url: PREPOSITIONS, title: 'Jan van Steenbergen, Interslavic prepositions (the cat examples are his)' },

    { kind: 'h2', text: 'The patterns' },
    {
      kind: 'p',
      text:
        'Nouns change in a few patterns, decided by gender and by the last sound. Here are the ' +
        'main ones; the [nouns](/learn/nouns) lesson explains hard and soft stems.',
    },
    declension('Masculine, animate: brat "brother"', 'brat', 'm.anim.',
      ['brat', 'brata', 'brata', 'bratu', 'bratom', 'bratu', 'brate'],
      ['brati', 'bratov', 'bratov', 'bratam', 'bratami', 'bratah']),
    declension('Masculine, inanimate: dom "house"', 'dom', 'm.',
      ['dom', 'dom', 'doma', 'domu', 'domom', 'domu'],
      ['domy', 'domy', 'domov', 'domam', 'domami', 'domah']),
    declension('Neuter: slovo "word"', 'slovo', 'n.',
      ['slovo', 'slovo', 'slova', 'slovu', 'slovom', 'slovu'],
      ['slova', 'slova', 'slov', 'slovam', 'slovami', 'slovah']),
    declension('Feminine in -a: žena "woman"', 'žena', 'f.',
      ['žena', 'ženu', 'ženy', 'ženě', 'ženoju', 'ženě', 'ženo'],
      ['ženy', 'ženy', 'žen', 'ženam', 'ženami', 'ženah']),
    declension('Feminine in a consonant: kost "bone"', 'kosť', 'f.',
      ['kost', 'kost', 'kosti', 'kosti', 'kostju', 'kosti'],
      ['kosti', 'kosti', 'kostij', 'kostam', 'kostami', 'kostah']),
    {
      kind: 'note',
      text:
        'Look at the accusative. For **animate** masculine nouns it is the same as the genitive ' +
        '({brata}); for everything else masculine or neuter it is the same as the nominative ' +
        '({dom}, {slovo}). The plural dative, instrumental and locative end in **-am**, **-ami**, ' +
        '**-ah** for every noun.',
    },
    {
      kind: 'p',
      text:
        'Soft stems follow the same patterns with **e** for **o**: {muž} "man" has instrumental ' +
        '{mužem}, {zemja} "earth" has {zemjeju}. In the locative singular of masculine and neuter ' +
        'nouns, **-ě** (after soft stems **-i**) is also correct - *v domě* as well as {v domu} - but **-u** is the recommended form.',
    },

    { kind: 'h2', text: 'The vocative' },
    {
      kind: 'p',
      text:
        'Calling someone, many Slavic languages change the ending: {Ivane!}, {brate!}, {ženo!}. ' +
        'Several do not, so in Interslavic the vocative is optional - the nominative is always ' +
        'fine: {Ivan!}',
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
      prompt: 'Ja vidim ___ . "I see the house."',
      options: ['dom', 'doma', 'domu'],
      answer: 'dom',
      why: 'A house is inanimate, so its accusative is the same as the nominative.',
    },
    {
      kind: 'choice',
      prompt: 'Ja vidim ___ . "I see the brother."',
      options: ['brat', 'brata', 'bratu'],
      answer: 'brata',
      why: 'A brother is animate, so the accusative is the same as the genitive.',
    },
    {
      kind: 'choice',
      prompt: 'Kot spi pod ___ . "The cat sleeps under the table."',
      options: ['stol', 'stolom', 'stola'],
      answer: 'stolom',
      why: 'A place under something, with no movement, is instrumental.',
    },
    {
      kind: 'fill',
      prompt: 'Dajte ___ knigu. "Give the book to the woman." ({žena})',
      answer: 'ženě',
      why: 'The person something is given to is in the dative: {ženě}.',
    },
    {
      kind: 'fill',
      prompt: 'Ona jest v ___ . "She is in the house." ({dom})',
      answer: 'domu',
      accept: ['domě'],
      why: 'A place after {v} is locative: {domu}.',
    },
  ],
};

export default cases;
