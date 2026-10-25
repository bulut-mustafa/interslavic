import type { LessonPage } from '../types.ts';

const PRONOUNS = 'http://steen.free.fr/interslavic/pronouns.html';

const pronouns: LessonPage = {
  slug: 'pronouns',
  title: 'Pronouns',
  summary: 'I, you, he and the rest; polite "vy"; my and your; this and that; who and what.',
  section: 'Grammar',
  names: ['Petr', 'Ivan', 'Ivanu'],
  blocks: [
    { kind: 'h2', text: 'Personal pronouns' },
    {
      kind: 'p',
      text:
        'Pronouns change for case like nouns. The forms in brackets are short, unstressed ' +
        'versions; after a preposition use the long ones: {k mně} "to me", {za tebe} "for you".',
    },
    {
      kind: 'table',
      caption: 'Singular',
      head: ['', 'I', 'you', 'he / it', 'she'],
      rows: [
        ['Nominative', 'ja', 'ty', 'on / ono', 'ona'],
        ['Accusative', 'mene (me)', 'tebe (te)', 'jego (go)', 'ju'],
        ['Genitive', 'mene', 'tebe', 'jego', 'jej'],
        ['Dative', 'mně (mi)', 'tobě (ti)', 'jemu (mu)', 'jej'],
        ['Instrumental', 'mnoju', 'toboju', 'jim', 'jeju'],
        ['Locative', 'mně', 'tobě', 'jim', 'jej'],
      ],
      isvColumns: [1, 2, 3, 4],
    },
    {
      kind: 'table',
      caption: 'Plural',
      head: ['', 'we', 'you', 'they'],
      rows: [
        ['Nominative', 'my', 'vy', 'oni (men) / one (others)'],
        ['Accusative', 'nas', 'vas', 'jih (men) / je (others)'],
        ['Genitive', 'nas', 'vas', 'jih'],
        ['Dative', 'nam', 'vam', 'jim'],
        ['Instrumental', 'nami', 'vami', 'jimi'],
        ['Locative', 'nas', 'vas', 'jih'],
      ],
      isvColumns: [1, 2],
    },
    {
      kind: 'p',
      text:
        '**After a preposition, he, she and they take an n-:** {jego} but {do njego}, {jim} but ' +
        '{s njim}. **On** and **ona** mean "it" too, for any masculine or feminine noun - a ' +
        'table ({stol}) is {on}.',
    },
    {
      kind: 'p',
      text:
        '**Keep the pronoun.** Slavic languages often leave out "I" or "you" because the verb ' +
        'ending shows it. Not every Slav reads every ending easily, so in Interslavic say {ja ' +
        'čitaju} "I read" rather than just {čitaju} - though both are correct.',
    },
    { kind: 'example', isv: 'Ja budu s vami.', en: "I'll be with you.", note: 'Tatoeba 13000110', tryIt: true },

    { kind: 'h2', text: 'Ty or vy?' },
    {
      kind: 'p',
      text:
        'Like all Slavic languages, Interslavic has two "you"s. **vy** is the general one: for ' +
        'several people, and for one person you do not know well. **ty** is for one friend, a ' +
        'relative or a child. When in doubt, say **vy** - that is why the translator uses it.',
    },
    { kind: 'example', isv: 'Vy hočete knigu?', en: 'Do you want the book?', note: 'polite or plural - Tatoeba 13525298', tryIt: true },
    { kind: 'example', isv: 'Ty hočeš knigu?', en: 'Do you want the book?', note: 'to a friend - Tatoeba 13525297' },

    { kind: 'h2', text: 'My, your, his' },
    {
      kind: 'p',
      text:
        '{moj} "my", {tvoj} "your" (to a friend), {naš} "our", {vaš} "your" take the gender of the ' +
        'thing owned, like adjectives: {moj brat}, {moja sestra}, {moje selo}. For "his", "her" ' +
        'and "their" the simplest is {jego}, {jej}, {jih}, which never change: {jego kniga} "his ' +
        'book".',
    },
    {
      kind: 'p',
      text:
        '**svoj** means "one\'s own", and is used when the owner is the subject of the sentence: ' +
        '{Ja myju svoje avto} "I am washing my car". It removes a doubt English has: {Petr dal ' +
        'Ivanu svoju knigu} - Petr gave Ivan *his own* (Petr\'s) book; with {jegovu knigu} it would ' +
        'be Ivan\'s.',
    },

    { kind: 'h2', text: 'This and that' },
    {
      kind: 'p',
      text:
        '{toj} (feminine {ta}, neuter {to}) is "this" or "that" - one word for both, unless you ' +
        'need to point: then {tutoj} "this here" and {tamtoj} "that over there". Asking what ' +
        'something is, use the neuter **to**:',
    },
    { kind: 'example', isv: 'Čto jest to?', en: "What's that?", note: 'Tatoeba 12984803', tryIt: true },
    { kind: 'example', isv: 'Vy znajete tu knigu.', en: 'You know that book.', note: 'feminine {tu}, accusative - Tatoeba 13125304', tryIt: true },

    { kind: 'h2', text: 'Who and what' },
    {
      kind: 'table',
      caption: 'kto "who" and čto "what"',
      head: ['', 'who?', 'what?'],
      rows: [
        ['Nominative', 'kto', 'čto'],
        ['Accusative', 'kogo', 'čto'],
        ['Genitive', 'kogo', 'čego'],
        ['Dative', 'komu', 'čemu'],
        ['Instrumental', 'kym', 'čim'],
        ['Locative', 'kom', 'čem'],
      ],
      isvColumns: [1, 2],
    },
    {
      kind: 'p',
      text:
        'Put **ni-** in front for "no-": {nikto} "nobody", {ničto} "nothing", {nikde} "nowhere"; ' +
        '**ně-** for "some-": {někto} "somebody", {něčto} "something".',
    },

    { kind: 'h2', text: 'Myself: se' },
    {
      kind: 'p',
      text:
        '{se} is "myself", "yourself", "himself" - one word for all persons: {Ja myju se} "I am ' +
        'washing myself". Many verbs simply come with it, as in {zvati se} "to be called".',
    },
    { kind: 'source', url: PRONOUNS, title: 'Jan van Steenbergen, Interslavic pronouns' },
    {
      kind: 'source',
      url: 'https://tatoeba.org/en/sentences/search?from=isv',
      title: 'Example sentences: Tatoeba (CC BY 2.0 FR), numbered by sentence',
    },

    { kind: 'h2', text: 'Check yourself' },
    {
      kind: 'choice',
      prompt: 'You meet an older stranger. Which "you"?',
      english: true,
      options: ['ty', 'vy'],
      answer: 'vy',
      why: 'vy is for anyone you do not know well; ty for friends, relatives and children.',
    },
    {
      kind: 'choice',
      prompt: 'Ja govorju s ___ . "I am talking with him."',
      options: ['jim', 'njim', 'jego'],
      answer: 'njim',
      why: 'After a preposition he/she/they take an n-: {s njim}.',
    },
    {
      kind: 'choice',
      prompt: '___ sestra "my sister"',
      options: ['moj', 'moja', 'moje'],
      answer: 'moja',
      why: '{sestra} is feminine.',
    },
    {
      kind: 'fill',
      prompt: '"nobody":',
      answer: 'nikto',
      why: 'ni- + {kto}.',
    },
  ],
};

export default pronouns;
