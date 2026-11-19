import type { Track } from '../video/keyframes.ts';
import type { Anims } from '../video/text-anim.ts';
import { DEFAULT_STYLE, layoutText, type Rect, type TextStyle } from './text-style.ts';

/**
 * Text placed on a picture or a video frame. A layer is plain data; the
 * functions here return new lists and never change the ones they are given, so
 * the editors can keep every step for undo.
 */

export interface EraseRect extends Rect {
  /** The colour that covers the original lettering, sampled from around it. */
  color: string;
}

export interface TextLayer {
  id: string;
  text: string;
  /** Top-left corner on the image or frame, in pixels. */
  x: number;
  y: number;
  /** Wrap width in pixels; 0 lets the text run on one line. */
  maxWidth: number;
  style: TextStyle;
  /** The text as first found in a photo, so it can be brought back. */
  original?: string;
  /** Hides the lettering this layer replaces, while the layer exists. */
  erase?: EraseRect;
  /** Photo only: hidden layers are not drawn and cannot be picked (the layers panel's eye). */
  hidden?: boolean;
  /** Photo only: locked layers cannot be picked or moved on the canvas (the layers panel's padlock). */
  locked?: boolean;
  /** Photo only: a name shown in the layers panel. */
  name?: string;
  /** Video only: the stretch of the finished video, in seconds, the text is shown for. */
  start?: number;
  end?: number;
  /** Video only: which lane the layer sits in. Higher lanes are drawn in front. 0 when missing. */
  track?: number;
  /** Video only: degrees, clockwise, about the layer's centre. */
  rotation?: number;
  /** Video only: values that change over the layer's time (see video/keyframes.ts). */
  tracks?: Track[];
  /** Video only: how the layer comes in, goes out and loops (see video/text-anim.ts). */
  anims?: Anims;
}

let counter = 0;
export const newId = (prefix = 'l'): string => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newLayer(over: Partial<TextLayer> & { x: number; y: number }): TextLayer {
  return { id: newId(), text: 'Your text', maxWidth: 0, style: { ...DEFAULT_STYLE }, ...over };
}

export const updateLayer = (layers: TextLayer[], id: string, patch: Partial<TextLayer>): TextLayer[] =>
  layers.map((l) => (l.id === id ? { ...l, ...patch } : l));

export const updateStyle = (layers: TextLayer[], id: string, patch: Partial<TextStyle>): TextLayer[] =>
  layers.map((l) => (l.id === id ? { ...l, style: { ...l.style, ...patch } } : l));

export const removeLayer = (layers: TextLayer[], id: string): TextLayer[] => layers.filter((l) => l.id !== id);

/** A copy placed a little down and right of the original, on top of everything. */
export function duplicateLayer(layers: TextLayer[], id: string, offset = 24): TextLayer[] {
  const src = layers.find((l) => l.id === id);
  if (!src) return layers;
  const { erase: _erase, original: _original, ...rest } = src;
  return [...layers, { ...rest, id: newId(), x: src.x + offset, y: src.y + offset }];
}

/** Moves a layer to the front or the back of the stack (later in the list is drawn later, so on top). */
export function reorder(layers: TextLayer[], id: string, where: 'front' | 'back'): TextLayer[] {
  const l = layers.find((x) => x.id === id);
  if (!l) return layers;
  const rest = layers.filter((x) => x.id !== id);
  return where === 'front' ? [...rest, l] : [l, ...rest];
}

export type StepKind = 'front' | 'forward' | 'backward' | 'back';

/**
 * Moves one layer through the stack of any list of things with an `id`: to the
 * very front or back, or one place at a time (later in the list is in front). A
 * layer already at the end it is sent to is left as it is, and the same list is
 * returned so callers can tell nothing changed.
 */
export function stepOrder<T extends { id: string }>(layers: T[], id: string, kind: StepKind): T[] {
  const i = layers.findIndex((x) => x.id === id);
  if (i < 0) return layers;
  const to = kind === 'front' ? layers.length - 1 : kind === 'back' ? 0 : Math.min(layers.length - 1, Math.max(0, i + (kind === 'forward' ? 1 : -1)));
  if (to === i) return layers;
  const out = layers.slice();
  const [l] = out.splice(i, 1);
  out.splice(to, 0, l!);
  return out;
}

/** Keeps a layer's top-left corner within the frame, with at least `keep` pixels of it showing. */
export function clampPosition(x: number, y: number, frame: { w: number; h: number }, keep = 24): { x: number; y: number } {
  return { x: Math.min(Math.max(x, keep - frame.w), frame.w - keep), y: Math.min(Math.max(y, keep - frame.h), frame.h - keep) };
}

type MeasureCtx = Parameters<typeof layoutText>[0];

export function boundsOf(ctx: MeasureCtx, layer: TextLayer): Rect {
  const L = layoutText(ctx, layer.text, layer.style, layer.maxWidth);
  return { x: layer.x, y: layer.y, w: layer.maxWidth > 0 ? Math.max(L.width, layer.maxWidth) : L.width, h: L.height };
}

/** The top-most layer under a point, or null. Thin text is given a few pixels of slack. */
export function hitTest(ctx: MeasureCtx, layers: TextLayer[], px: number, py: number, slack = 6): string | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const b = boundsOf(ctx, layers[i]!);
    if (px >= b.x - slack && px <= b.x + b.w + slack && py >= b.y - slack && py <= b.y + b.h + slack) return layers[i]!.id;
  }
  return null;
}

/** Layers shown at time `t` of a video; a layer with no times is always shown. */
export const visibleAt = (layers: TextLayer[], t: number): TextLayer[] =>
  layers.filter((l) => (l.start === undefined || t >= l.start) && (l.end === undefined || t < l.end));
