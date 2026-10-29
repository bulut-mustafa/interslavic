import type { ParsedSentence } from '../../../types/index.ts';
import { russianNameToLatin, ukrainianNameToLatin } from '../../../morph/src/orthography.ts';

/**
 * A source language's profile. The seam exists so that adding a language is a
 * data change plus a lexicon index, not a pipeline rewrite.
 *
 * `copyCase` is the important flag. Russian marks case explicitly, so it is
 * copied with `certain` confidence and the inference cascade is skipped.
 * English does not, so the cascade runs.
 *
 * Note for later: Bulgarian and Macedonian have LOST case, so they must set
 * `copyCase: false` and run the same inference cascade English uses - they are
 * not "Slavic, therefore copy".
 */
export interface SourceAdapter {
  lang: string;
  /** Source morphology states the case; trust it. */
  copyCase: boolean;
  /** Source morphology states the aspect; trust it. */
  copyAspect: boolean;
  /** Determiners to delete, by UD feature test. */
  dropsArticles: boolean;
  /**
   * Whether the source distinguishes number in the second person. English does
   * not - "you" is both - so the unmarked `vy` is used. Russian does (`ты` is
   * Person=2 Number=Sing, `вы` is Number=Plur), and forcing `vy` would both
   * discard a distinction the source makes and make an informal sentence
   * formal.
   */
  marksSecondPersonNumber: boolean;
  /**
   * Source lemmas that introduce a complement clause, which Interslavic writes
   * `že`. Translated by gloss instead, English "that" reached the demonstrative
   * and Russian "что" reached the interrogative `čego`.
   */
  complementizers: readonly string[];
  /**
   * Whether the source omits the present-tense copula. Russian does - "Мальчик
   * мой дядя" has no verb - while Interslavic writes it, as every example on
   * the syntax page does: "Petr jest ščestliv", "dom jest velik", "Tuto avto ne
   * jest drago". Without inserting it, Russian input produced verbless
   * sentences: "Hlapčik ktory žive tam moj stryjec".
   */
  omitsPresentCopula: boolean;
  /**
   * The lemma of the source's "be" when it forms a periphrastic future with an
   * infinitive. Russian "буду читать" is structurally identical to Interslavic
   * "budu čitati", but it is tagged AUX with the lemma `быть`, so the English
   * `will`/`shall` table did not see it: "Я буду читать книгу" came out as "Ja
   * jesi čitaju knigu", a second-person copula beside a conjugated verb.
   *
   * `null` where the source forms its future otherwise, as English does.
   */
  futureAuxiliaryLemma: string | null;
  /**
   * A separate word the source puts before a POSITIVE adjective to form a
   * superlative. Russian "самый большой" is two words; Interslavic prefixes
   * `naj-` to the comparative, which `derive()` already builds. Translated as
   * a word of its own it became "sama veliky" - a stray feminine pronoun
   * beside an uncompared adjective.
   *
   * `null` where the source marks the degree on the adjective itself, as
   * English does ("biggest" carries `Degree=Sup`).
   */
  analyticSuperlative: string | null;
  /**
   * Clitics the source fuses onto a verb to make it reflexive or passive.
   * Russian `-ся`/`-сь` is part of the word, so Stanza sometimes lemmatises
   * "читается" as `читаться`, which is not a dictionary headword and came
   * through untranslated. Interslavic writes the clitic separately - "Pica
   * dělaje se" - http://steen.free.fr/interslavic/syntax.html
   */
  reflexiveVerbSuffixes: readonly string[];
  /**
   * The source's "be". Its future forms are the copula's future ("Я буду с
   * тобой" -> "Ja budu s toboju"), which the parser sometimes tags present.
   */
  copulaLemma: string | null;
  /**
   * The pronoun that presents a noun - Russian "Это кошка", Ukrainian "Це
   * кішка" - which Interslavic writes `to`: "To jest krasiva poema".
   */
  presentationalPronoun: string | null;
  /** The source's "and", which makes coordinated subjects plural together. */
  andWords: readonly string[];
  /**
   * The conjunctions of a final clause, "so that, in order to" - Russian
   * "чтобы", Ukrainian "щоб" ("щоб: so that, in order that; in order to",
   * Wiktionary after Bilodid's СУМ). Interslavic gives such a clause "že" or
   * "da" with the conditional (syntax page). English marks its own with "to"
   * and "so that", read separately.
   */
  purposeConjunctions: readonly string[];
  /**
   * Endings that turn a SHORT adjective lemma into the long form the
   * dictionary lists: Russian "прав" -> "правый". Empty where there is none.
   */
  shortAdjectiveEndings: readonly string[];
  /**
   * Writes a name from the source's Cyrillic in Interslavic Latin letters, or
   * null where it cannot. `null` for a source written in Latin.
   */
  nameToLatin: ((word: string) => string | null) | null;
  /**
   * The prefix of a one-word superlative - Ukrainian "найцінніший", Polish
   * "najlepszy" - and the comparative endings it is built on, each with the
   * positive ending the dictionary lists: "цінніший" -> "цінний". The parser
   * marks Degree=Sup, from which Interslavic builds `naj-`; only the lookup
   * needs the plain adjective. `null` where the superlative is two words.
   */
  superlativePrefix: string | null;
  comparativeToPositive: readonly [string, string][];
  /**
   * The feminine and masculine adjective endings of a language name used as a
   * noun. Ukrainian says "вивчаю іспанську [мову]" with the feminine "мова",
   * and the parser makes the adjective a feminine NOUN the dictionary does not
   * list; Interslavic names a language with the masculine adjective, as in
   * "Medžuslovjansky" (the understood noun is `jezyk`).
   */
  languageNameEndings: readonly [string, string] | null;
}

export const EN: SourceAdapter = {
  lang: 'en',
  copyCase: false,
  copyAspect: false,
  dropsArticles: true,
  marksSecondPersonNumber: false,
  complementizers: ['that'],
  omitsPresentCopula: false,
  futureAuxiliaryLemma: null,
  analyticSuperlative: null,
  reflexiveVerbSuffixes: [],
  copulaLemma: null,
  presentationalPronoun: null,
  andWords: ['and'],
  purposeConjunctions: [],
  shortAdjectiveEndings: [],
  nameToLatin: null,
  superlativePrefix: null,
  comparativeToPositive: [],
  languageNameEndings: null,
};

export const RU: SourceAdapter = {
  lang: 'ru',
  copyCase: true,
  copyAspect: true,
  // Russian has no articles to drop.
  dropsArticles: false,
  marksSecondPersonNumber: true,
  complementizers: ['что'],
  omitsPresentCopula: true,
  futureAuxiliaryLemma: 'быть',
  analyticSuperlative: 'самый',
  reflexiveVerbSuffixes: ['ся', 'сь'],
  copulaLemma: 'быть',
  presentationalPronoun: 'это',
  andWords: ['и'],
  purposeConjunctions: ['чтобы', 'чтоб'],
  shortAdjectiveEndings: ['ый', 'ий', 'ой'],
  nameToLatin: russianNameToLatin,
  superlativePrefix: null,
  comparativeToPositive: [],
  languageNameEndings: null,
};

/**
 * Ukrainian works like Russian at every point the adapter covers: it marks
 * case and aspect, drops the present copula ("Він лікар"), fuses -ся/-сь,
 * builds the future with "буду" + infinitive and the superlative with
 * "найбільш". Its own words and letters are what differ.
 */
export const UK: SourceAdapter = {
  lang: 'uk',
  copyCase: true,
  copyAspect: true,
  dropsArticles: false,
  marksSecondPersonNumber: true,
  complementizers: ['що'],
  omitsPresentCopula: true,
  futureAuxiliaryLemma: 'бути',
  analyticSuperlative: 'найбільш',
  reflexiveVerbSuffixes: ['ся', 'сь'],
  copulaLemma: 'бути',
  presentationalPronoun: 'це',
  andWords: ['і', 'й', 'та'],
  // щоби is the full form of щоб, аби its synonym (Wiktionary).
  purposeConjunctions: ['щоб', 'щоби', 'аби'],
  // Ukrainian short forms ("повен", "зелен") are poetic; the long one ends -ий.
  shortAdjectiveEndings: ['ий'],
  nameToLatin: ukrainianNameToLatin,
  superlativePrefix: 'най',
  /**
   * The comparative adds -ш-/-іш- to the stem, and -к-, -ок-, -ек- drop:
   * швидкий > швидший, глибокий > глибший, далекий > дальший, розумний >
   * розумніший (urok.osvita.ua, naurok.com.ua, "Ступені порівняння
   * прикметників"); an adverb adds -ше/-іше: швидко > швидше, тепло > тепліше
   * ("Ступені порівняння прислівників"). Undone here, most specific first;
   * a candidate counts only if the dictionary lists it. Stem alternations
   * (дорогий > дорожчий, високий > вищий) are not undone.
   */
  comparativeToPositive: [
    ['іший', 'ий'], ['ший', 'окий'], ['ший', 'екий'], ['ший', 'кий'], ['ший', 'ий'],
    ['іше', 'о'], ['ше', 'око'], ['ше', 'еко'], ['ше', 'ко'], ['ше', 'о'],
  ],
  // The suffix is "-ський (feminine -ська, alternative -цький, variant
  // -зький)" (Wiktionary): українська, німецька, французька all end -ька.
  languageNameEndings: ['ька', 'ький'],
};

const BY_LANG: Record<string, SourceAdapter> = { en: EN, ru: RU, uk: UK };

export function adapterFor(sentence: ParsedSentence): SourceAdapter {
  const a = BY_LANG[sentence.lang];
  if (!a) throw new Error(`no source adapter for language "${sentence.lang}"`);
  return a;
}
