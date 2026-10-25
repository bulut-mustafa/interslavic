import type { LessonPage } from '../types.ts';

const ORTHOGRAPHY = 'http://steen.free.fr/interslavic/orthography.html';

/** Letter, its Cyrillic twin, an example word, what the word means. */
const LETTERS: [string, string, string, string][] = [
  ['A a', 'А а', 'avtobus', 'bus'],
  ['B b', 'Б б', 'brat', 'brother'],
  ['C c', 'Ц ц', 'cěna', 'price'],
  ['Č č', 'Ч ч', 'čas', 'time'],
  ['D d', 'Д д', 'dom', 'house'],
  ['Dž dž', 'Дж дж', 'džem', 'jam'],
  ['E e', 'Е е', 'selo', 'village'],
  ['Ě ě', 'Є є', 'město', 'place'],
  ['F f', 'Ф ф', 'fabrika', 'factory'],
  ['G g', 'Г г', 'glava', 'head'],
  ['H h', 'Х х', 'hlěb', 'bread'],
  ['I i', 'И и', 'ime', 'name'],
  ['J j', 'Ј ј', 'jezero', 'lake'],
  ['K k', 'К к', 'kniga', 'book'],
  ['L l', 'Л л', 'lampa', 'lamp'],
  ['Lj lj', 'Љ љ', 'ljudi', 'people'],
  ['M m', 'М м', 'mama', 'mum'],
  ['N n', 'Н н', 'noč', 'night'],
  ['Nj nj', 'Њ њ', 'konj', 'horse'],
  ['O o', 'О о', 'oko', 'eye'],
  ['P p', 'П п', 'pivo', 'beer'],
  ['R r', 'Р р', 'ryba', 'fish'],
  ['S s', 'С с', 'sestra', 'sister'],
  ['Š š', 'Ш ш', 'škola', 'school'],
  ['T t', 'Т т', 'tri', 'three'],
  ['U u', 'У у', 'uho', 'ear'],
  ['V v', 'В в', 'voda', 'water'],
  ['Y y', 'Ы ы', 'syn', 'son'],
  ['Z z', 'З з', 'zima', 'winter'],
  ['Ž ž', 'Ж ж', 'žena', 'woman'],
];

const alphabet: LessonPage = {
  slug: 'alphabet',
  title: 'Alphabet',
  summary: 'The Latin and Cyrillic letters, and what to do when your keyboard lacks one.',
  section: 'Start',
  blocks: [
    { kind: 'h2', text: 'One language, two alphabets' },
    {
      kind: 'p',
      text:
        'Interslavic has a standard Latin alphabet and a standard Cyrillic one, and neither is ' +
        'the "real" one. They were designed together, so every Latin letter has exactly one ' +
        'Cyrillic partner and a text can be switched from one to the other without losing ' +
        'anything. Neither copies a national spelling: each is a compromise most Slavs can read.',
    },
    {
      kind: 'p',
      text:
        'The Latin alphabet uses the ordinary letters except **q**, **w** and **x**, plus **č**, ' +
        '**š**, **ž** and **ě** - 27 letters - and three pairs that count as single letters: ' +
        '**dž**, **lj** and **nj**. The Cyrillic alphabet takes the letters the Cyrillic-writing ' +
        'Slavic languages share and adds **є**, **ы**, **ј**, **љ** and **њ**.',
    },

    { kind: 'h2', text: 'The letters' },
    {
      kind: 'table',
      caption: 'Each letter with its Cyrillic partner and a word that has it',
      head: ['Latin', 'Cyrillic', 'Example', 'Meaning'],
      rows: LETTERS.map(([lat, cyr, word, meaning]) => [lat, cyr, word, meaning]),
      isvColumns: [2],
    },
    {
      kind: 'note',
      text:
        '**dž**, **lj** and **nj** are one sound each, written with two Latin letters. In ' +
        'Cyrillic **lj** and **nj** have letters of their own (**љ**, **њ**), and **dž** is ' +
        'written **дж**.',
    },
    { kind: 'example', isv: 'Dobry denj!', en: 'Good afternoon!', note: 'Tatoeba 12977822' },

    { kind: 'h2', text: 'Letters to take care with' },
    {
      kind: 'p',
      text:
        '**č, š, ž** - the little hook matters. **c**, **s** and **z** are different sounds, so ' +
        '{čas} "time" written "cas" is harder to understand.',
    },
    {
      kind: 'p',
      text:
        '**ě** (Cyrillic **є**) is an *e* that softens the consonant before it, as most Slavic ' +
        'languages do in these words: {město} "place", {hlěb} "bread". If you are not sure ' +
        'where it goes, writing a plain **e** is an accepted simplification.',
    },
    {
      kind: 'p',
      text:
        '**y** (Cyrillic **ы**) helps Russians, Belarusians and Poles, who keep it apart from ' +
        '**i**. Writing **i** instead is allowed, and advised when writing mainly for South ' +
        'Slavs, whose languages merged the two.',
    },
    {
      kind: 'p',
      text:
        '**j** is Cyrillic **ј**, the Serbian and Macedonian letter, not **й**: {jezero} "lake" ' +
        'is **језеро**.',
    },

    { kind: 'h2', text: 'When your keyboard lacks a letter' },
    {
      kind: 'table',
      caption: 'Accepted ways around missing letters',
      head: ['Instead of', 'You can write'],
      rows: [
        ['č š ž', 'cz sz ż (as in Polish), or cx sx zx'],
        ['ě / є', 'e / е'],
        ['y / ы', 'i / и'],
        ['ј', 'й, and я ю for ја ју'],
        ['љ њ', 'ль нь'],
      ],
    },
    {
      kind: 'note',
      text:
        'Avoid **ch sh zh**: West Slavs read **ch** as one sound, like the *ch* in Scottish ' +
        '*loch*. And do not drop the hook from **č š ž** altogether.',
    },

    { kind: 'h2', text: 'The etymological letters' },
    {
      kind: 'p',
      text:
        'You may meet extra letters: **ę ų å ė ȯ ć đ ĺ ń ŕ ť ď ś ź**. They are optional marks ' +
        'that show where a word comes from in older Slavic, which helps link it to its relatives ' +
        'in each language. A reader who ignores them loses nothing: drop the mark and you have ' +
        'the standard spelling. Only **ć** and **đ** change more - they become **č** and **dž**.',
    },
    {
      kind: 'p',
      text:
        'The translator\'s "Etymological" tab shows its output this way. In everyday writing, ' +
        'stick to the standard letters - the extra marks put off newcomers and do not help ' +
        'South Slavs at all.',
    },
    { kind: 'source', url: ORTHOGRAPHY, title: 'Jan van Steenbergen, Interslavic orthography' },

    { kind: 'h2', text: 'Check yourself' },
    {
      kind: 'fill',
      prompt: 'Write in Latin letters: **школа**',
      answer: 'škola',
      why: 'ш is š - the word means "school".',
    },
    {
      kind: 'fill',
      prompt: 'Write in Latin letters: **коњ**',
      answer: 'konj',
      why: 'њ is the single letter nj - "horse".',
    },
    {
      kind: 'choice',
      prompt: 'Which Cyrillic letter is Latin **ě**?',
      english: true,
      options: ['е', 'є', 'э'],
      answer: 'є',
      why: 'ě and є are partners; plain е is the accepted simplification.',
    },
    {
      kind: 'choice',
      prompt: 'Which of these is one letter in Interslavic?',
      english: true,
      options: ['lj', 'st', 'kr'],
      answer: 'lj',
      why: 'lj, nj and dž are single letters (Cyrillic љ, њ, дж).',
    },
  ],
};

export default alphabet;
