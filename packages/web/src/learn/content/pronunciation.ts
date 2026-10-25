import type { LessonPage } from '../types.ts';

const PRONUNCIATION = 'http://steen.free.fr/interslavic/pronunciation.html';

const pronunciation: LessonPage = {
  slug: 'pronunciation',
  title: 'Pronunciation',
  summary: 'How the letters sound, where the stress goes, and how to be understood.',
  section: 'Start',
  blocks: [
    { kind: 'h2', text: 'Any Slavic accent is right' },
    {
      kind: 'p',
      text:
        'Interslavic has no single "correct" accent. A Russian, a Pole and a Serb will each say ' +
        'it a little differently, and all three are fine - just as British and American English ' +
        'are both English. If you speak a Slavic language, read the letters as you would at ' +
        'home. The table below is for everyone else: approximations from English, good enough to ' +
        'be understood.',
    },
    {
      kind: 'note',
      text: 'Every letter is pronounced, and always the same way. There are no silent letters.',
    },

    { kind: 'h2', text: 'The sounds' },
    {
      kind: 'table',
      caption: 'Each letter, with an English word that has a similar sound',
      head: ['Letter', 'Sounds like', 'Example'],
      rows: [
        ['a', '*a* in "father"', 'mama'],
        ['b, d, f, m, n, z', 'as in English', 'dom'],
        ['c', '*ts* in "cats"', 'cěna'],
        ['č', '*ch* in "cheese"', 'čas'],
        ['dž', '*j* in "jam"', 'džem'],
        ['e', '*e* in "bed"', 'selo'],
        ['ě', '*ye* in "yes"', 'město'],
        ['g', '*g* in "go" (never as in "gem")', 'glava'],
        ['h', '*ch* in Scottish "loch"', 'hlěb'],
        ['i', '*ee* in "see", but shorter', 'ime'],
        ['j', '*y* in "yes"', 'jezero'],
        ['k, p, t', 'as in English, without the puff of air', 'kniga'],
        ['l', '*l* in "full"; softer before e, ě, i', 'lampa'],
        ['lj', '*lli* in "million"', 'ljudi'],
        ['nj', '*ny* in "canyon"', 'konj'],
        ['o', '*o* in "or"', 'oko'],
        ['r', 'a rolled r, as in Spanish or Scottish', 'ryba'],
        ['s', '*s* in "sun" (never like z)', 'sestra'],
        ['š', '*sh* in "ship"', 'škola'],
        ['u', '*oo* in "food"', 'uho'],
        ['v', '*v* in "very"', 'voda'],
        ['y', '*i* in "sit"', 'syn'],
        ['ž', '*s* in "measure"', 'žena'],
      ],
      isvColumns: [2],
    },

    { kind: 'h2', text: 'A few things to know' },
    {
      kind: 'p',
      text:
        '**ě softens what comes before it.** After **t d s z n l r** the consonant itself turns ' +
        'soft; after other consonants you hear a short *y* before the *e*: {pěsok} "sand" sounds ' +
        'like "pyesok".',
    },
    {
      kind: 'p',
      text:
        '**r can be a vowel.** Between consonants or at the end of a word, **r** carries the ' +
        'syllable on its own, with a hint of a vowel before it: {trg} "market", {cukr} ' +
        '"sugar".',
    },
    {
      kind: 'p',
      text:
        '**Clusters can be eased.** Where consonants pile up, you may slip in a faint vowel: ' +
        '{jesm} "I am" can sound like "jesem".',
    },
    {
      kind: 'p',
      text:
        '**Say the vowels as written.** Russian speakers reduce unstressed *o* towards *a*; in ' +
        'Interslavic keep every vowel clear, so that everyone recognises the word.',
    },
    {
      kind: 'p',
      text:
        '**Final consonants are free.** You may say {Bog} "God" as "Bok", as most Slavs do, or ' +
        'as written; both are correct. Staying close to the spelling helps listeners most.',
    },

    { kind: 'h2', text: 'Stress' },
    {
      kind: 'p',
      text:
        'Stress is free, but a safe rule of thumb is: in two-syllable words stress the first ' +
        'syllable (**ma**-ma, **ry**-ba); in longer words the first or second, or the second or ' +
        'third. Keep the stress on the same syllable when the ending changes, and avoid putting ' +
        'it on a prefix or an ending.',
    },

    { kind: 'h2', text: 'Being understood' },
    {
      kind: 'p',
      text:
        'Your listener has probably never heard Interslavic spoken, and will be connecting every ' +
        'word to their own language. Speak slowly, pause between sentences, and watch whether ' +
        'they follow. One unfamiliar word can make someone miss the rest of the sentence - give ' +
        'them time.',
    },
    { kind: 'source', url: PRONUNCIATION, title: 'Jan van Steenbergen, Interslavic pronunciation' },

    { kind: 'h2', text: 'Check yourself' },
    {
      kind: 'choice',
      prompt: 'Which English sound is closest to **h** in {hlěb}?',
      english: true,
      options: ['h in "hat"', 'ch in Scottish "loch"', 'ch in "cheese"'],
      answer: 'ch in Scottish "loch"',
      why: 'h is the rough sound at the back of the mouth; č is the "cheese" sound.',
    },
    {
      kind: 'choice',
      prompt: 'How is **c** in {cěna} pronounced?',
      english: true,
      options: ['like k', 'like s', 'like ts'],
      answer: 'like ts',
      why: 'c is always ts, as in "cats" - never k or s.',
    },
    {
      kind: 'choice',
      prompt: 'Which syllable is it safest to stress in {sestra}?',
      english: true,
      options: ['ses-', '-tra'],
      answer: 'ses-',
      why: 'In a two-syllable word, the safe choice is the first syllable.',
    },
  ],
};

export default pronunciation;
