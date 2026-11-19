import { guessLang } from '../subtitles/guess.ts';

/**
 * Working out which dropped file is which, so that a video and its subtitles
 * can be dropped together, in any order, without saying what each one is.
 */

export interface Dropped {
  name: string;
  type: string;
}

export const isMedia = (f: Dropped): boolean => f.type.startsWith('video/') || f.type.startsWith('audio/') || /\.(mp4|m4v|webm|mov|mkv|ogv|mp3|wav|m4a|ogg)$/i.test(f.name);
export const isSubtitles = (f: Dropped): boolean => /\.srt$/i.test(f.name) || f.type === 'application/x-subrip';

export interface Subtitle {
  name: string;
  text: string;
}

/**
 * Of up to two subtitle files, which is the Interslavic and which the original.
 * A file in Cyrillic, or with a name that says what it is in, is the original;
 * a name that says Interslavic is the Interslavic; failing that, the first is.
 */
export function assignSubtitles(files: Subtitle[]): { isv?: Subtitle; original?: Subtitle } {
  if (files.length === 0) return {};
  if (files.length === 1) return { isv: files[0] };
  const [a, b] = files as [Subtitle, Subtitle];
  const score = (f: Subtitle): number => {
    let s = 0;
    if (/isv|interslav|medzu|medžu|inter/i.test(f.name)) s += 2;
    if (/(^|[^a-z])(en|eng|english|ru|rus|russian|uk|ukr|ukrainian|orig|original)([^a-z]|$)/i.test(f.name)) s -= 2;
    const g = guessLang(f.text);
    if (g === 'ru' || g === 'uk') s -= 3; // Interslavic is written in Latin or in its own Cyrillic; a plainly Russian or Ukrainian text is the original
    return s;
  };
  return score(b) > score(a) ? { isv: b, original: a } : { isv: a, original: b };
}
