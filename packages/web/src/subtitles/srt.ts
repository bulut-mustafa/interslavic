/**
 * SubRip (.srt) subtitles: read them into cues, and write cues back.
 *
 * A cue is an optional index line, a time line "00:00:01,000 --> 00:00:03,500"
 * (some tools write a "." before the milliseconds, and may add display settings
 * after the second time), then its text up to a blank line.
 */

export interface Cue {
  /** The cue's own number, or null when the file has none. */
  index: number | null;
  /** The time line exactly as written, so every setting survives. */
  timing: string;
  /** The cue's lines exactly as written, markup included. */
  lines: string[];
}

const TIMING = /^\s*\d+:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d+:\d{2}:\d{2}[,.]\d{3}.*$/;

export function parseSrt(input: string): Cue[] {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l, i, all) => l.trim() !== '' || i < all.length - 1);
    while (lines.length > 0 && lines[0]!.trim() === '') lines.shift();
    if (lines.length === 0) continue;
    let index: number | null = null;
    if (/^\d+$/.test(lines[0]!.trim()) && lines.length > 1 && TIMING.test(lines[1]!)) {
      index = Number(lines.shift()!.trim());
    }
    const timing = lines.shift();
    if (timing === undefined || !TIMING.test(timing)) continue;
    cues.push({ index, timing: timing.trim(), lines });
  }
  return cues;
}

const TIME = /(\d+):(\d{2}):(\d{2})[,.](\d{3})/g;

/** A cue's start and end in seconds, read from its time line. */
export function cueSeconds(cue: Pick<Cue, 'timing'>): { start: number; end: number } {
  const [a, b] = [...cue.timing.matchAll(TIME)].map((m) => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000);
  return { start: a ?? 0, end: b ?? a ?? 0 };
}

export function formatSrt(cues: Cue[]): string {
  return (
    cues
      .map((c, i) => [String(c.index ?? i + 1), c.timing, ...c.lines].join('\n'))
      .join('\n\n') + '\n'
  );
}

/** What to translate in a cue, and how to put the translation back. */
export interface CuePlan {
  /** The pieces to translate: one per speaker line in a dialogue, else the whole cue. */
  units: string[];
  /** Puts translated pieces back as the cue's lines. */
  rebuild(translated: string[]): string[];
}

/** Display markup that is not text: <i>, <b>, <font ...>, and {\an8}-style tags. */
const MARKUP = /<\/?[a-zA-Z][^>]*>|\{\\[^}]*\}/g;
const DASH = /^\s*[-–—]\s*/;
const HAS_LETTER = /\p{L}/u;

/**
 * A dialogue cue (every line opens with a dash) is translated line by line, so
 * each speaker keeps a line. Any other cue is one sentence broken over lines to
 * fit the screen, so it is translated whole and shown as one line. A cue that
 * is italic from start to end stays italic.
 */
export function planCue(cue: Cue): CuePlan {
  const clean = cue.lines.map((l) => l.replace(MARKUP, '').trim()).filter((l) => l !== '');
  const italic = /^\s*<i>[\s\S]*<\/i>\s*$/.test(cue.lines.join('\n'));
  const wrap = (l: string): string => (italic ? `<i>${l}</i>` : l);

  if (clean.length === 0 || !clean.some((l) => HAS_LETTER.test(l))) {
    // Music notes, empty cues: nothing to translate.
    return { units: [], rebuild: () => cue.lines };
  }
  const dialogue = clean.length > 1 && clean.every((l) => DASH.test(l));
  if (dialogue) {
    return {
      units: clean.map((l) => l.replace(DASH, '')),
      rebuild: (t) => t.map((l) => wrap(`- ${l}`)),
    };
  }
  return { units: [clean.join(' ')], rebuild: (t) => [wrap(t[0] ?? '')] };
}
