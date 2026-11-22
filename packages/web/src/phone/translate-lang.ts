import type { SourceLang } from '../subtitles/translate.ts';

/** Letters only Ukrainian uses; Russian never has them. */
const UK_ONLY = /[іїєґІЇЄҐ]/;
const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN = /[A-Za-z]/;

/**
 * The language a text most likely is in, for the Translate sheet's starting chip. The page's own setting (what the picture's words
 * were read as, English if never changed) is the default; the characters of the text itself only overrule it when they clearly
 * disagree with it: English typed on a picture of Russian words, or Russian typed on an English page.
 */
export function guessLang(texts: string[], fallback: SourceLang): SourceLang {
  const all = texts.join(' ');
  const cyr = CYRILLIC.test(all);
  const lat = LATIN.test(all);
  if (cyr && !lat) {
    if (UK_ONLY.test(all)) return 'uk';
    return fallback === 'uk' ? 'uk' : 'ru';
  }
  if (lat && !cyr) return 'en';
  return fallback;
}

/** A plain sentence for a failure of the translator: browsers word a dead network as "Load failed" or "Failed to fetch". */
export function plainTranslateError(message: string): string {
  return /load failed|failed to fetch|networkerror|network request failed|fetch/i.test(message)
    ? 'Could not reach the translator. Check your connection and try again.'
    : message;
}
