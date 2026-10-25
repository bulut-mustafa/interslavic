import type { LessonPage } from '../types.ts';

const WORD_FORMATION = 'http://steen.free.fr/interslavic/word_formation.html';

const wordFormation: LessonPage = {
  slug: 'word-formation',
  title: 'Building words',
  summary: 'Endings and prefixes that turn one word into many.',
  section: 'Grammar',
  blocks: [
    { kind: 'h2', text: 'One root, many words' },
    {
      kind: 'p',
      text:
        'Interslavic, like every Slavic language, builds new words from old ones with a small set ' +
        'of endings and prefixes. Learn the common ones and your vocabulary multiplies - and you ' +
        'will recognise words you have never seen.',
    },

    { kind: 'h2', text: 'People and things' },
    {
      kind: 'table',
      caption: 'Endings that make nouns',
      head: ['Ending', 'Makes', 'Example'],
      rows: [
        ['-telj', 'the person who does it', '{učiti} "to teach" → {učitelj} "teacher"'],
        ['-ka', 'a woman (from a man\'s word)', '{prijatelj} "friend" → {prijateljka}'],
        ['-ost', 'a quality', '{dobry} "good" → {dobrost} "goodness"'],
        ['-stvo', 'a quality of a person', '{prijatelj} → {prijateljstvo} "friendship"'],
        ['-nje', 'the action itself', '{dělati} "to do" → {dělanje} "doing"'],
        ['-išče', 'a place', '{mokry} "wet" → {mokrišče} "wetland"'],
        ['-ka, -ok', 'something small', '{kniga} "book" → {knižka} "booklet"'],
      ],
    },

    { kind: 'h2', text: 'Describing words' },
    {
      kind: 'table',
      caption: 'Endings and prefixes for adjectives',
      head: ['', 'Meaning', 'Example'],
      rows: [
        ['-sky', 'of a place, people or profession', '{žena} "woman" → {žensky} "female"'],
        ['-ny', 'having to do with', '{noč} "night" → {nočny} "night-"'],
        ['ne-', 'not', '{dobry} → {nedobry} "not good"'],
        ['bez-...-ny', 'without', '{dom} → {bezdomny} "homeless"'],
        ['-livy', 'tending to; -able', '{razuměti} "to understand" → {razumlivy} "understandable"'],
      ],
    },

    { kind: 'h2', text: 'Prefixes on verbs' },
    {
      kind: 'p',
      text:
        'Prefixes change a verb\'s meaning - and make it perfective (see [Aspect](/learn/aspect)).',
    },
    {
      kind: 'table',
      caption: 'Some common prefixes',
      head: ['Prefix', 'Meaning', 'Example'],
      rows: [
        ['do-', 'all the way, to the end', '{dojdti} "to arrive"'],
        ['iz-', 'out', '{izbrati} "to pick out, choose"'],
        ['na-', 'onto; often just completes', '{napisati} "to write (down)"'],
        ['od-', 'away', '{odidti} "to go away"'],
        ['po-', 'a little; start to', '{pospati} "to have a nap"'],
        ['pri-', 'towards, arriving', '{prinesti} "to bring"'],
      ],
    },
    {
      kind: 'note',
      text:
        'Before some endings, **k** becomes **č**, **g** becomes **ž** and **h** becomes **š**: ' +
        '{kniga} → {knižka}, {ruka} → {ručny}.',
    },
    { kind: 'source', url: WORD_FORMATION, title: 'Jan van Steenbergen, Interslavic word formation' },

    { kind: 'h2', text: 'Check yourself' },
    {
      kind: 'choice',
      prompt: '{pisati} "to write" + -telj = ?',
      options: ['pisatelj', 'pisanje', 'pisany'],
      answer: 'pisatelj',
      why: '-telj makes the person who does it: a writer.',
    },
    {
      kind: 'choice',
      prompt: '{novy} "new" + -ost = ?',
      options: ['novost', 'novka', 'novsky'],
      answer: 'novost',
      why: '-ost makes a quality: "newness, novelty".',
    },
    {
      kind: 'fill',
      prompt: '"not good":',
      answer: 'nedobry',
      why: '{ne-} in front makes the opposite.',
    },
  ],
};

export default wordFormation;
