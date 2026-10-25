import type { LessonPage } from '../types.ts';

const FAQ = 'http://steen.free.fr/interslavic/faq.html';

const faq: LessonPage = {
  slug: 'faq',
  title: 'Questions',
  summary: 'Short answers to what people ask most about Interslavic.',
  section: 'More',
  blocks: [
    { kind: 'h2', text: 'Will every Slav understand me?' },
    {
      kind: 'p',
      text:
        'Most of what you say, not every word. Interslavic uses the words the most Slavic ' +
        'nations share, but some are better known in the east, others in the west or south. ' +
        'In the research its authors report, most people understood Interslavic reasonably ' +
        'well, written and spoken. Speak slowly, and check that you are followed.',
    },

    { kind: 'h2', text: 'How many people use it?' },
    {
      kind: 'p',
      text:
        'Nobody can count speakers of a language with no country. Going by its online ' +
        'communities, van Steenbergen estimated at the end of 2023 a community of some 25,000 ' +
        'people, about 7,000 of them with some active command of the language.',
    },

    { kind: 'h2', text: 'Latin or Cyrillic?' },
    {
      kind: 'p',
      text:
        'Either - both are standard and equally correct. Choose the one your readers use, or ' +
        'give both. Do not mix them in one text. See [Alphabet](/learn/alphabet).',
    },

    { kind: 'h2', text: 'Is it "jest" or "je"?' },
    {
      kind: 'p',
      text:
        'Both. The present of {byti} "to be" lists {jest} with the shorter {je} beside it. ' +
        'The translator writes {jest}, the main form; the shorter one is just as correct.',
    },

    { kind: 'h2', text: 'Why does the translator say "vy", not "ty"?' },
    {
      kind: 'p',
      text:
        'English "you" does not say whether you are talking to a friend or a stranger, so the ' +
        'translator takes the safe choice: {vy}, which is right for anyone you do not know well ' +
        'and for several people. To a friend, a relative or a child, use {ty}. See ' +
        '[Pronouns](/learn/pronouns).',
    },

    { kind: 'h2', text: 'Do I have to learn the etymological letters?' },
    {
      kind: 'p',
      text:
        'No. Letters like **ę**, **ų** and **å** are optional marks that show a word\'s history. ' +
        'Everyday Interslavic is written without them, and a reader who ignores them loses ' +
        'nothing.',
    },

    { kind: 'h2', text: 'I speak a Slavic language. Where do I start?' },
    {
      kind: 'p',
      text:
        'Mostly by reading and listening: learning Interslavic is largely learning how to bend ' +
        'your own language so other Slavs follow it. Skim the [cases](/learn/cases) and ' +
        '[verbs](/learn/verbs-present) to see where it differs from yours, then read.',
    },
    { kind: 'source', url: FAQ, title: 'Jan van Steenbergen, Interslavic FAQ' },
  ],
};

export default faq;
