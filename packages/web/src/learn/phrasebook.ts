/**
 * Everyday phrases. Each one is either a set phrase from the Interslavic
 * dictionary or a sentence written by an Interslavic user on Tatoeba (CC BY
 * 2.0 FR), with its number - none is our own composition. The lesson test
 * checks every word against the lexicon.
 */
export interface Phrase {
  isv: string;
  en: string;
  /** "dictionary", or a Tatoeba sentence number. */
  source: 'dictionary' | number;
  note?: string;
}

export interface PhraseGroup {
  title: string;
  phrases: Phrase[];
}

/** Names in the example sentences, which are not dictionary words. */
export const PHRASE_NAMES = ['Dilhwaz', 'Lucy'];

export const PHRASEBOOK: PhraseGroup[] = [
  {
    title: 'Hello and goodbye',
    phrases: [
      { isv: 'Dobry denj!', en: 'Good day! / Good afternoon!', source: 12977822 },
      { isv: 'Dobro utro!', en: 'Good morning!', source: 12977845 },
      { isv: 'Dobry večer!', en: 'Good evening!', source: 12977824 },
      { isv: 'Dobra noč!', en: 'Good night!', source: 'dictionary' },
      { isv: 'Čao!', en: 'Hi! / Bye!', source: 'dictionary', note: 'informal' },
      { isv: 'Dobrodošli!', en: 'Welcome!', source: 'dictionary' },
      { isv: 'Do viděnja!', en: 'Goodbye!', source: 12977828 },
    ],
  },
  {
    title: 'Being polite',
    phrases: [
      { isv: 'Hvala!', en: 'Thank you!', source: 'dictionary' },
      { isv: 'Prošu.', en: "Please. / You're welcome.", source: 12977818 },
      { isv: 'Nema za čto.', en: "You're welcome. / No problem.", source: 'dictionary' },
      { isv: 'Izvinite!', en: 'Sorry! / Excuse me!', source: 'dictionary', note: 'to someone you call vy' },
      { isv: 'Izvini!', en: 'Sorry! / Excuse me!', source: 'dictionary', note: 'to someone you call ty' },
      { isv: 'Da.', en: 'Yes.', source: 'dictionary' },
      { isv: 'Ne.', en: 'No.', source: 'dictionary' },
    ],
  },
  {
    title: 'About yourself',
    phrases: [
      { isv: 'Zovu se Dilhwaz.', en: 'My name is Dilhwaz.', source: 13525307, note: 'put your own name' },
      { isv: 'Moje ime jest Lucy.', en: 'My name is Lucy.', source: 12994746 },
      { isv: 'Kde vy živete?', en: 'Where do you live?', source: 14010395 },
      { isv: 'Kde ty živeš?', en: 'Where do you live?', source: 14010393, note: 'to a friend' },
      { isv: 'Moj učitelj jest iz Ukrajiny.', en: 'My teacher comes from Ukraine.', source: 13820258 },
    ],
  },
  {
    title: 'Finding your way',
    phrases: [
      { isv: 'Kde jest škola?', en: "Where's the school?", source: 13995231 },
      { isv: 'Kde jest klozet?', en: "Where's the restroom?", source: 12989839 },
      { isv: 'Ona jest v školě.', en: "She's at school.", source: 12999978 },
    ],
  },
  {
    title: 'Food and shopping',
    phrases: [
      { isv: 'Hlěb, prosim. Hvala.', en: 'Bread, please. Thank you.', source: 13500210 },
      { isv: 'Kde hlěb?', en: "Where's the bread?", source: 14002847 },
      { isv: 'Čego vy potrěbujete?', en: 'What do you need?', source: 13511811 },
      { isv: 'Ničego, hvala.', en: 'Nothing, thanks.', source: 13511811 },
    ],
  },
  {
    title: 'Help',
    phrases: [
      { isv: 'Ja prošu pomoč.', en: "I'm asking for help.", source: 13480596 },
      { isv: 'Ja budu s vami.', en: "I'll be with you.", source: 13000110 },
    ],
  },
  {
    title: 'Celebrations',
    phrases: [
      { isv: 'Ščestnogo Novogo Goda!', en: 'Happy New Year!', source: 'dictionary' },
      { isv: 'Ščestnogo dnja rodženja!', en: 'Happy birthday!', source: 'dictionary' },
      { isv: 'Ščestnyh svetkov!', en: 'Happy holidays!', source: 'dictionary' },
    ],
  },
];

export const sourceUrl = (source: Phrase['source']): string =>
  source === 'dictionary'
    ? 'https://interslavic-dictionary.com'
    : `https://tatoeba.org/en/sentences/show/${source}`;
