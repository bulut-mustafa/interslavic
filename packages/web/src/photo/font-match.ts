import { DEFAULT_STYLE, fontString, type FontKey } from '../editor/text-style.ts';

/**
 * Working out which of the editor's fonts the lettering in a picture is
 * closest to, and at what size, so that text put in its place looks like what
 * was there instead of like a different font at a different size.
 *
 * Each font is tried on the original words. A font fits when, sized so the words
 * are as wide as they were, they are also as tall as they were and about as
 * heavy: a bold face covers more of its box with ink than a light one, and
 * capitals are taller for their width than lower-case.
 */

export interface Candidate {
  font: FontKey;
  bold: boolean;
}

/** The faces worth telling apart. Script is left out: it cannot be told from the others by shape alone. */
export const CANDIDATES: Candidate[] = [
  { font: 'sans', bold: false },
  { font: 'sans', bold: true },
  { font: 'serif', bold: false },
  { font: 'serif', bold: true },
  { font: 'mono', bold: false },
  { font: 'display', bold: false },
];

/** A text set in a face at size 100: how wide and tall its ink is, and how much of that box the ink fills. */
export interface Probe {
  width: number;
  height: number;
  /** How far the middle of the ink sits below the line the text is drawn on (the editor draws on the middle baseline). */
  centre: number;
  /** 0-1, or null when it could not be told. */
  ink: number | null;
}

export type Prober = (text: string, candidate: Candidate) => Probe | null;

export interface Observed {
  text: string;
  /** Pixels across and down of the words in the picture. */
  width: number;
  height: number;
  /** The share of that box the ink fills, or null if unknown. */
  ink: number | null;
}

export interface Matched extends Candidate {
  size: number;
  /** How far the middle of the ink sits below the drawing line, at this size. */
  centre: number;
}

/** How much a wrong weight counts against a face compared with a wrong height. */
const INK_WEIGHT = 4;

/**
 * Lettering in pictures is mostly set in system faces (Helvetica, Arial). Their
 * regular weight is about a fifth heavier than the editor's own regular, so
 * measured against it plain lettering would look bold; their bold is barely
 * heavier than the editor's bold. Divided out here, by weight. (Measured on
 * Helvetica against IBM Plex Sans: 1.26 regular, 1.06 bold.)
 */
const INK_BIAS = { regular: 1.2, bold: 1.05 };

/** Without clear evidence the words are plain sans-serif, the commonest thing in a picture. */
const PRIOR = { notSans: 0.03, bold: 0.02 };

export function matchFont(obs: Observed, probe: Prober, candidates: Candidate[] = CANDIDATES): Matched | null {
  if (obs.width <= 0 || obs.height <= 0 || obs.text.trim() === '') return null;
  let best: { m: Matched; score: number } | null = null;
  for (const c of candidates) {
    const p = probe(obs.text, c);
    if (!p || p.width <= 0 || p.height <= 0) continue;
    const size = (100 * obs.width) / p.width;
    const heightError = Math.abs((p.height * size) / 100 - obs.height) / obs.height;
    const inkError = obs.ink !== null && p.ink !== null ? Math.abs(p.ink - obs.ink / (c.bold ? INK_BIAS.bold : INK_BIAS.regular)) : 0;
    const score = heightError + INK_WEIGHT * inkError + (c.font === 'sans' ? 0 : PRIOR.notSans) + (c.bold ? PRIOR.bold : 0);
    if (!best || score < best.score - 1e-9) best = { m: { ...c, size, centre: (p.centre * size) / 100 }, score };
  }
  return best?.m ?? null;
}

/** A prober that measures real text on a canvas. Null where there is no canvas to measure on. */
export function canvasProber(): Prober {
  let canvas: HTMLCanvasElement | null = null;
  return (text, cand) => {
    if (typeof document === 'undefined') return null;
    canvas ??= document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const style = { ...DEFAULT_STYLE, font: cand.font, bold: cand.bold, italic: false, size: 100, letterSpacing: 0 };
    ctx.font = fontString(style);
    ctx.textBaseline = 'middle';
    const m = ctx.measureText(text);
    if (m.actualBoundingBoxAscent === undefined) return null;
    const width = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    if (!(width > 0) || !(height > 0)) return null;
    const centre = (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2;
    if (width > 6000) return { width, height, centre, ink: null };
    canvas.width = Math.ceil(width) + 4;
    canvas.height = Math.ceil(height) + 4;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.font = fontString(style);
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 2 + m.actualBoundingBoxLeft, 2 + m.actualBoundingBoxAscent);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! < 128) dark++;
    return { width, height, centre, ink: dark / (width * height) };
  };
}
