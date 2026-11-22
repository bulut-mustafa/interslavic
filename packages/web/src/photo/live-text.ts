import { DEFAULT_STYLE, type Rect } from '../editor/text-style.ts';
import type { Matched } from './font-match.ts';
import { newLayer, type TextLayer } from '../editor/layers.ts';
import { luminance } from './find-text.ts';
import type { OcrBox, OcrLine } from './ocr.ts';
import { isReadableLine } from './readable.ts';

/**
 * Text in a picture that can be picked out letter by letter, the way text is on
 * a page: the lettering stays part of the picture, untouched, until the person
 * has picked some and does something with it. Only then does what they picked
 * become a text layer that can be changed.
 */

export interface Glyph {
  /** Position in reading order across the whole picture: a selection is a stretch of these. */
  index: number;
  /** Which line of the picture it is on. */
  line: number;
  /** One letter, or a space between two words. */
  text: string;
  box: OcrBox;
}

const hasContent = (t: string) => /\p{L}|\p{N}/u.test(t);

/** How wide a letter is next to an average one: enough to split a word's width between its letters when the reader did not. */
function weight(ch: string): number {
  if (/[iljtfrI'.,:;!|`]/.test(ch)) return 0.5;
  if (/[mwMW@]/.test(ch)) return 1.45;
  if (/\p{Lu}/u.test(ch)) return 1.15;
  return 1;
}

/** The letters of a word, each with a box: the reader's own where it gave them, otherwise the word's width shared out. */
function lettersOf(word: { text: string; bbox: OcrBox; symbols?: { text: string; bbox: OcrBox }[] }): { text: string; box: OcrBox }[] {
  const chars = [...word.text.trim()];
  const syms = word.symbols;
  if (syms && syms.length === chars.length && syms.every((y) => y.bbox.x1 > y.bbox.x0)) {
    return syms.map((y) => ({ text: y.text, box: { x0: y.bbox.x0, y0: word.bbox.y0, x1: y.bbox.x1, y1: word.bbox.y1 } }));
  }
  const total = chars.reduce((n, c) => n + weight(c), 0);
  const width = word.bbox.x1 - word.bbox.x0;
  let at = word.bbox.x0;
  return chars.map((c) => {
    const w = (width * weight(c)) / total;
    const out = { text: c, box: { x0: at, y0: word.bbox.y0, x1: at + w, y1: word.bbox.y1 } };
    at += w;
    return out;
  });
}

/** The words of a line; when the reader gave none, the line is split on spaces and the width shared out by letters. */
function wordsOfLine(line: OcrLine): { text: string; confidence: number; bbox: OcrBox; symbols?: { text: string; bbox: OcrBox }[] }[] {
  if (line.words && line.words.length > 0) return line.words;
  const parts = line.text.split(/\s+/).filter(Boolean);
  const total = parts.reduce((n, p) => n + p.length, 0) + Math.max(0, parts.length - 1);
  if (total === 0) return [];
  const width = line.bbox.x1 - line.bbox.x0;
  let at = line.bbox.x0;
  return parts.map((p) => {
    const w = (width * p.length) / total;
    const out = { text: p, confidence: line.confidence, bbox: { x0: at, y0: line.bbox.y0, x1: at + w, y1: line.bbox.y1 } };
    at += w + width / total;
    return out;
  });
}

/**
 * Every readable letter in the picture, and the spaces between words, in reading
 * order. Words the reader is unsure of, or that hold no letter or digit, are
 * left out.
 */
export function glyphsFrom(lines: OcrLine[], minConfidence = 40): Glyph[] {
  const out: Glyph[] = [];
  lines.forEach((line, li) => {
    if (!isReadableLine(line, minConfidence)) return;
    let prev: OcrBox | null = null;
    [...wordsOfLine(line)]
      .sort((a, b) => a.bbox.x0 - b.bbox.x0)
      .forEach((w) => {
        const text = w.text.trim();
        if (!hasContent(text) || w.confidence < minConfidence || w.bbox.x1 - w.bbox.x0 < 3 || w.bbox.y1 - w.bbox.y0 < 3) return;
        if (prev && out.at(-1)?.line === li) {
          out.push({ index: out.length, line: li, text: ' ', box: { x0: prev.x1, y0: Math.min(prev.y0, w.bbox.y0), x1: w.bbox.x0, y1: Math.max(prev.y1, w.bbox.y1) } });
        }
        for (const l of lettersOf(w)) out.push({ index: out.length, line: li, text: l.text, box: l.box });
        prev = w.bbox;
      });
  });
  return out;
}

const gap = (v: number, lo: number, hi: number) => (v < lo ? lo - v : v > hi ? v - hi : 0);

/** The letter nearest a point (0 apart when the point is on it), or null if there are none. */
export function nearestGlyph(glyphs: Glyph[], p: { x: number; y: number }): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const g of glyphs) {
    const d = Math.hypot(gap(p.x, g.box.x0, g.box.x1), gap(p.y, g.box.y0, g.box.y1));
    if (d < bestD) {
      bestD = d;
      best = g.index;
    }
  }
  return best;
}

/** The gap between letters that a point is nearest to, as a number from 0 (before the first letter) to the count of letters (after the last). */
export function caretAt(glyphs: Glyph[], p: { x: number; y: number }): number | null {
  const i = nearestGlyph(glyphs, p);
  if (i === null) return null;
  const g = glyphs[i]!;
  return p.x < (g.box.x0 + g.box.x1) / 2 ? i : i + 1;
}

/** The two ends of a stretch picked out between two gaps, in order, or null when they are the same gap (nothing picked). */
export const stretch = (a: number, b: number): [number, number] | null => (a === b ? null : a < b ? [a, b] : [b, a]);

/** The word around a letter: the run of letters either side of it up to a space or the end of the line. */
export function wordAround(glyphs: Glyph[], index: number): [number, number] {
  const g = glyphs[index];
  if (!g) return [index, index + 1];
  let lo = index;
  let hi = index;
  while (lo > 0 && glyphs[lo - 1]!.line === g.line && glyphs[lo - 1]!.text !== ' ') lo--;
  while (hi + 1 < glyphs.length && glyphs[hi + 1]!.line === g.line && glyphs[hi + 1]!.text !== ' ') hi++;
  return [lo, hi + 1];
}

/** All the letters of the line a letter is on. */
export function lineAround(glyphs: Glyph[], index: number): [number, number] {
  const line = glyphs[index]?.line;
  const same = glyphs.filter((g) => g.line === line);
  return same.length === 0 ? [index, index + 1] : [same[0]!.index, same.at(-1)!.index + 1];
}

/** The picked letters, split into one run for each line they sit on, without spaces at the ends of a run. */
export function runsIn(glyphs: Glyph[], range: [number, number]): Glyph[][] {
  const runs: Glyph[][] = [];
  for (const g of glyphs.slice(range[0], range[1])) {
    const last = runs.at(-1);
    if (last && last[0]!.line === g.line) last.push(g);
    else runs.push([g]);
  }
  return runs
    .map((r) => {
      let lo = 0;
      let hi = r.length;
      while (lo < hi && r[lo]!.text === ' ') lo++;
      while (hi > lo && r[hi - 1]!.text === ' ') hi--;
      return r.slice(lo, hi);
    })
    .filter((r) => r.length > 0);
}

export const unionBox = (gs: { box: OcrBox }[]): OcrBox => ({
  x0: Math.min(...gs.map((g) => g.box.x0)),
  y0: Math.min(...gs.map((g) => g.box.y0)),
  x1: Math.max(...gs.map((g) => g.box.x1)),
  y1: Math.max(...gs.map((g) => g.box.y1)),
});

/** Has this letter been replaced already, so that a text layer now sits over it? */
export function isCovered(g: Glyph, covers: Rect[]): boolean {
  const cx = (g.box.x0 + g.box.x1) / 2;
  const cy = (g.box.y0 + g.box.y1) / 2;
  return covers.some((r) => cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h);
}

export const textOf = (run: Glyph[]): string => run.map((g) => g.text).join('');

const LINE_HEIGHT = 1.15;
const SIZE_OF_BOX = 0.78;

export interface FitOptions {
  ringColorOf: (rect: Rect) => string;
  /** The lettering's own colour inside a box, given the background; null if unknown. */
  inkOf?: (rect: Rect, background: string) => string | null;
  /** How wide a text is at a size, in the font the layer will use. */
  widthAt?: (text: string, size: number) => number;
  /** The font, weight and size that look most like the words in the picture; used in preference to a width fit when it answers. */
  matchStyle?: (run: { text: string; box: OcrBox; background: string }) => Matched | null;
}

/**
 * A text layer for each run of chosen words, sitting where the words were, at
 * their size and colour, with a patch that covers the original lettering. The
 * words themselves are unchanged: this is what a change to them starts from.
 */
export function layersFromRuns(runs: Glyph[][], fit: FitOptions): TextLayer[] {
  return runs.map((run) => {
    const b = unionBox(run);
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    const text = textOf(run);
    const patch: Rect = { x: b.x0 - 3, y: b.y0 - 3, w: w + 6, h: h + 6 };
    const color = fit.ringColorOf(patch);
    let size = Math.max(10, Math.round(h * SIZE_OF_BOX));
    // The height of a box misleads (capitals have no descenders); the width does not.
    const measured = fit.widthAt?.(text, size) ?? 0;
    if (measured > 0 && text.length >= 2) size = Math.min(Math.round(h * 2), Math.max(10, Math.round((size * w) / measured)));
    const ink = fit.inkOf?.(patch, color) ?? null;
    const m = fit.matchStyle?.({ text, box: b, background: color }) ?? null;
    if (m) size = Math.max(8, Math.round(m.size));
    // Put the middle of the new lettering where the middle of the old lettering was.
    const y = m ? (b.y0 + b.y1) / 2 - m.centre - (size * LINE_HEIGHT) / 2 : b.y0 + (h - size * LINE_HEIGHT) / 2;
    // Words in capitals stay in capitals, whatever they are changed into.
    const caps = text === text.toUpperCase() && /\p{Lu}{2}/u.test(text);
    return newLayer({
      text,
      original: text,
      x: b.x0,
      y,
      maxWidth: 0,
      erase: { ...patch, color },
      style: {
        ...DEFAULT_STYLE,
        size,
        font: m?.font ?? DEFAULT_STYLE.font,
        bold: m?.bold ?? false,
        uppercase: caps,
        align: 'left',
        lineHeight: LINE_HEIGHT,
        color: ink ?? (luminance(color) > 0.55 ? '#111111' : '#ffffff'),
        outline: null,
      },
    });
  });
}
