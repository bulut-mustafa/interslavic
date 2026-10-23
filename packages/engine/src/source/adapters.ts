import type { ParsedSentence } from '../../../types/index.ts';

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
};

const BY_LANG: Record<string, SourceAdapter> = { en: EN, ru: RU };

export function adapterFor(sentence: ParsedSentence): SourceAdapter {
  const a = BY_LANG[sentence.lang];
  if (!a) throw new Error(`no source adapter for language "${sentence.lang}"`);
  return a;
}
