import type { SourceLang } from './translate.ts';

/**
 * Which language a subtitle file is in, from its letters alone, so the person
 * does not have to say. Cyrillic with letters only Ukrainian has (i, yi, ye,
 * ghe with upturn) is Ukrainian, other Cyrillic is Russian, Latin is English.
 * Null when there are too few letters to tell.
 */
export function guessLang(text: string): SourceLang | null {
  // Time lines and numbers are the same in every language; leave them out.
  const words = text
    .split(/\r?\n/)
    .filter((l) => !/-->/.test(l) && !/^\s*\d+\s*$/.test(l))
    .join(' ');
  const cyr = (words.match(/[Ѐ-ӿ]/g) ?? []).length;
  const lat = (words.match(/[A-Za-z]/g) ?? []).length;
  if (cyr + lat < 8) return null;
  if (cyr > lat) return /[іїєґІЇЄҐ]/.test(words) ? 'uk' : 'ru';
  return 'en';
}
