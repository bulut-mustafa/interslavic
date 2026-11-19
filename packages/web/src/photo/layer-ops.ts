import { DEFAULT_STYLE } from '../editor/text-style.ts';
import { newId, newLayer, type StepKind, type TextLayer } from '../editor/layers.ts';
import { isImage, isShape, isText, type ImageLayer, type PhotoLayer, type ShapeKind, type ShapeLayer } from './doc.ts';

/**
 * Pure, immutable operations on a page's layer list (later in the list = in
 * front). Each returns a new array, or the same array when nothing changed.
 * A text layer has no w/h: pass `measure` (the renderer's real measurement) or
 * the estimate below is used.
 *
 * Not modelled (doc.ts has no field for it): grouping, and a "lock position
 * only" variant (there is one boolean `locked`).
 * TextLayer (editor/layers.ts) has no `hidden`, `locked`, `name` or `flip`
 * fields in its type: for text these ops write `hidden`/`locked`/`name` onto the
 * object anyway (plain JSON survives save and undo), but the types and the
 * renderer must be taught about them by their owners.
 */

export interface Size {
  w: number;
  h: number;
}
export interface Rect extends Size {
  x: number;
  y: number;
}
export type Measure = (layer: TextLayer) => Size;
export type Selection = readonly string[];

/** A rough size for text when the caller has no canvas to measure with. */
export const estimateText: Measure = (l) => {
  const lines = l.text.split('\n');
  const longest = Math.max(1, ...lines.map((s) => s.length));
  return { w: l.maxWidth > 0 ? l.maxWidth : longest * l.style.size * 0.55, h: lines.length * l.style.size * l.style.lineHeight };
};

/** The layer's box before rotation. */
export function rectOf(l: PhotoLayer, measure: Measure = estimateText): Rect {
  if (isText(l)) return { x: l.x, y: l.y, ...measure(l) };
  return { x: l.x, y: l.y, w: l.w, h: l.h };
}

const rotationOf = (l: PhotoLayer): number => (isText(l) ? (l.rotation ?? 0) : l.rotation);

/** The smallest upright rectangle around the layer after its rotation about its centre. */
export function boundsOfLayer(l: PhotoLayer, measure?: Measure): Rect {
  const r = rectOf(l, measure);
  const a = (rotationOf(l) * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const w = r.w * c + r.h * s;
  const h = r.w * s + r.h * c;
  return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
}

/** The upright rectangle around all the chosen layers, or null when none exist. */
export function selectionBounds(layers: readonly PhotoLayer[], ids: Selection, measure?: Measure): Rect | null {
  const set = new Set(ids);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const l of layers) {
    if (!set.has(l.id)) continue;
    const b = boundsOfLayer(l, measure);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const move = (l: PhotoLayer, dx: number, dy: number): PhotoLayer => ({ ...l, x: l.x + dx, y: l.y + dy });

// ---------- adding ----------

/** A size with the picture's proportions that fits `fraction` of the page in both directions. */
export function fitSize(natural: Size, page: Size, fraction = 0.5): Size {
  if (natural.w <= 0 || natural.h <= 0) return { w: page.w * fraction, h: page.h * fraction };
  const k = Math.min((page.w * fraction) / natural.w, (page.h * fraction) / natural.h);
  return { w: natural.w * k, h: natural.h * k };
}

const base = { rotation: 0, opacity: 1, blend: 'normal' as const };

/** A picture centred on the page at about half its size, on top. `src` is the id of the stored file. */
export function addImage(layers: readonly PhotoLayer[], src: string, natural: Size, page: Size, extra: { id?: string; name?: string } = {}): PhotoLayer[] {
  const { w, h } = fitSize(natural, page);
  const layer: ImageLayer = { ...base, id: extra.id ?? newId('i'), kind: 'image', src, x: (page.w - w) / 2, y: (page.h - h) / 2, w, h, ...(extra.name ? { name: extra.name } : {}) };
  return [...layers, layer];
}

export const DEFAULT_SHAPE_COLOR = '#1f6b6b';

/** A shape centred on the page, about a third of the short side; lines and arrows are long and thin and have a stroke. */
export function addShape(layers: readonly PhotoLayer[], kind: ShapeKind, page: Size, extra: { id?: string } = {}): PhotoLayer[] {
  const side = Math.round(Math.min(page.w, page.h) / 3);
  const linear = kind === 'line' || kind === 'arrow';
  const w = linear ? Math.round(Math.min(page.w, page.h) / 2) : side;
  // A line has no height of its own; a little is kept so it can be picked and boxed.
  const h = linear ? 12 : side;
  const layer: ShapeLayer = {
    ...base,
    id: extra.id ?? newId('s'),
    kind: 'shape',
    shape: kind,
    x: (page.w - w) / 2,
    y: (page.h - h) / 2,
    w,
    h,
    ...(linear ? { stroke: { color: DEFAULT_SHAPE_COLOR, width: 6 } } : { fill: DEFAULT_SHAPE_COLOR }),
  };
  return [...layers, layer];
}

/** An emoji (or any short text) as a text layer centred on the page, on top. */
export function addSticker(layers: readonly PhotoLayer[], char: string, page: Size, extra: { id?: string } = {}): PhotoLayer[] {
  const size = Math.round(Math.min(page.w, page.h) / 5);
  const t = newLayer({
    ...(extra.id ? { id: extra.id } : {}),
    text: char,
    x: (page.w - size) / 2,
    y: (page.h - size * DEFAULT_STYLE.lineHeight) / 2,
    style: { ...DEFAULT_STYLE, size, bold: false, shadow: null, outline: null, glow: null, box: null },
  });
  return [...layers, t];
}

// ---------- copies, removal, copy and paste ----------

const strip = (l: PhotoLayer): PhotoLayer => {
  if (!isText(l)) return l;
  const { erase: _e, original: _o, ...rest } = l;
  return rest;
};

/** Copies of the chosen layers, offset, with new ids, on top in their old relative order. */
export function duplicate(layers: readonly PhotoLayer[], ids: Selection, offset = 24): PhotoLayer[] {
  const set = new Set(ids);
  const copies = layers.filter((l) => set.has(l.id)).map((l) => ({ ...move(strip(l), offset, offset), id: newId(isText(l) ? 'l' : isImage(l) ? 'i' : 's') }) as PhotoLayer);
  return copies.length ? [...layers, ...copies] : layers.slice();
}

export function remove(layers: readonly PhotoLayer[], ids: Selection): PhotoLayer[] {
  const set = new Set(ids);
  return layers.filter((l) => !set.has(l.id));
}

export const PAYLOAD_TYPE = 'interslavic-photo-layers';

/** The chosen layers as text for the clipboard or an in-app buffer. Pictures keep their `src` id (the file store is shared). */
export function copyPayload(layers: readonly PhotoLayer[], ids: Selection): string {
  const set = new Set(ids);
  return JSON.stringify({ type: PAYLOAD_TYPE, v: 1, layers: layers.filter((l) => set.has(l.id)) });
}

const looksLikeLayer = (v: unknown): v is PhotoLayer => {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.x !== 'number' || typeof o.y !== 'number') return false;
  if (o.kind === 'image') return typeof o.src === 'string' && typeof o.w === 'number' && typeof o.h === 'number';
  if (o.kind === 'shape') return typeof o.shape === 'string' && typeof o.w === 'number' && typeof o.h === 'number';
  return typeof o.text === 'string' && typeof o.style === 'object' && o.style !== null;
};

/** The layers in a payload, or null when the text is not one of ours (so a normal text paste is left alone). */
export function parsePayload(text: string): PhotoLayer[] | null {
  try {
    const v = JSON.parse(text) as { type?: unknown; layers?: unknown };
    if (v?.type !== PAYLOAD_TYPE || !Array.isArray(v.layers) || !v.layers.every(looksLikeLayer)) return null;
    return v.layers;
  } catch {
    return null;
  }
}

/** Puts pasted layers on top with fresh ids, nudged by `offset` so they do not hide the originals. */
export function paste(layers: readonly PhotoLayer[], pasted: readonly PhotoLayer[], offset = 24): PhotoLayer[] {
  if (!pasted.length) return layers.slice();
  return [...layers, ...pasted.map((l) => ({ ...move(strip(l), offset, offset), id: newId(isText(l) ? 'l' : isImage(l) ? 'i' : 's') }) as PhotoLayer)];
}

// ---------- order ----------

/**
 * Moves the chosen layers through the stack, keeping their relative order:
 * to the front or back, or past the nearest layer that is not chosen.
 */
export function reorder(layers: readonly PhotoLayer[], ids: Selection, kind: StepKind): PhotoLayer[] {
  const set = new Set(ids);
  const chosen = layers.filter((l) => set.has(l.id));
  if (!chosen.length || chosen.length === layers.length) return layers.slice();
  let out: PhotoLayer[];
  if (kind === 'front' || kind === 'back') {
    const rest = layers.filter((l) => !set.has(l.id));
    out = kind === 'front' ? [...rest, ...chosen] : [...chosen, ...rest];
  } else {
    out = layers.slice();
    if (kind === 'forward') {
      for (let i = out.length - 2; i >= 0; i--) if (set.has(out[i]!.id) && !set.has(out[i + 1]!.id)) [out[i], out[i + 1]] = [out[i + 1]!, out[i]!];
    } else {
      for (let i = 1; i < out.length; i++) if (set.has(out[i]!.id) && !set.has(out[i - 1]!.id)) [out[i], out[i - 1]] = [out[i - 1]!, out[i]!];
    }
  }
  return out.every((l, i) => l === layers[i]) ? layers.slice() : out;
}

/** Moves one layer to a new place in the list (used by drag in the layers panel). `to` is an index in the list as it is after the layer is taken out. */
export function moveTo(layers: readonly PhotoLayer[], id: string, to: number): PhotoLayer[] {
  const from = layers.findIndex((l) => l.id === id);
  if (from < 0) return layers.slice();
  const out = layers.slice();
  const [l] = out.splice(from, 1);
  out.splice(Math.min(Math.max(0, to), out.length), 0, l!);
  return out;
}

// ---------- per-layer flags ----------

/** Applies `patch` to the chosen layers. Text layers take the fields too (see the note at the top). */
export function patchLayers(layers: readonly PhotoLayer[], ids: Selection, patch: Record<string, unknown>): PhotoLayer[] {
  const set = new Set(ids);
  return layers.map((l) => (set.has(l.id) ? ({ ...l, ...patch } as PhotoLayer) : l));
}

export const setHidden = (layers: readonly PhotoLayer[], ids: Selection, hidden: boolean): PhotoLayer[] => patchLayers(layers, ids, { hidden });
export const setLocked = (layers: readonly PhotoLayer[], ids: Selection, locked: boolean): PhotoLayer[] => patchLayers(layers, ids, { locked });
export const rename = (layers: readonly PhotoLayer[], id: string, name: string): PhotoLayer[] => patchLayers(layers, [id], { name });

export const isHidden = (l: PhotoLayer): boolean => !!(l as { hidden?: boolean }).hidden;
export const isLocked = (l: PhotoLayer): boolean => !!(l as { locked?: boolean }).locked;

const SHAPE_NAMES: Record<ShapeKind, string> = { rect: 'Rectangle', ellipse: 'Ellipse', triangle: 'Triangle', star: 'Star', heart: 'Heart', line: 'Line', arrow: 'Arrow' };

/** The name shown in the layers panel: the one the user gave, else from the content. */
export function layerName(l: PhotoLayer): string {
  const given = (l as { name?: string }).name;
  if (given) return given;
  if (isImage(l)) return 'Picture';
  if (isShape(l)) return SHAPE_NAMES[l.shape];
  const first = l.text.split('\n')[0] ?? '';
  return first.length > 24 ? `${first.slice(0, 24)}…` : first || 'Text';
}

// ---------- geometry ----------

export function nudge(layers: readonly PhotoLayer[], ids: Selection, dx: number, dy: number): PhotoLayer[] {
  const set = new Set(ids);
  return layers.map((l) => (set.has(l.id) ? move(l, dx, dy) : l));
}

/** Flips pictures and shapes; text has no flip and is left as it is. */
export function flip(layers: readonly PhotoLayer[], ids: Selection, axis: 'x' | 'y'): PhotoLayer[] {
  const set = new Set(ids);
  return layers.map((l) => (set.has(l.id) && !isText(l) ? (axis === 'x' ? { ...l, flipX: !l.flipX } : { ...l, flipY: !l.flipY }) : l));
}

export type AlignKind = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Aligns the chosen layers as one block to the page edge or centre, like Canva's Position menu. */
export function alignToPage(layers: readonly PhotoLayer[], ids: Selection, kind: AlignKind, page: Size, measure?: Measure): PhotoLayer[] {
  const b = selectionBounds(layers, ids, measure);
  if (!b) return layers.slice();
  let dx = 0;
  let dy = 0;
  if (kind === 'left') dx = -b.x;
  else if (kind === 'center') dx = (page.w - b.w) / 2 - b.x;
  else if (kind === 'right') dx = page.w - b.w - b.x;
  else if (kind === 'top') dy = -b.y;
  else if (kind === 'middle') dy = (page.h - b.h) / 2 - b.y;
  else dy = page.h - b.h - b.y;
  return nudge(layers, ids, dx, dy);
}

/** Spaces three or more layers so the gaps between them are equal; the two outermost stay where they are. */
export function distribute(layers: readonly PhotoLayer[], ids: Selection, axis: 'horizontal' | 'vertical', measure?: Measure): PhotoLayer[] {
  const set = new Set(ids);
  const items = layers.filter((l) => set.has(l.id)).map((l) => ({ l, b: boundsOfLayer(l, measure) }));
  if (items.length < 3) return layers.slice();
  const h = axis === 'horizontal';
  const pos = (b: Rect) => (h ? b.x : b.y);
  const len = (b: Rect) => (h ? b.w : b.h);
  items.sort((p, q) => pos(p.b) - pos(q.b));
  const first = items[0]!.b;
  const last = items[items.length - 1]!.b;
  const total = items.reduce((s, i) => s + len(i.b), 0);
  const gap = (pos(last) + len(last) - pos(first) - total) / (items.length - 1);
  const delta = new Map<string, number>();
  let cursor = pos(first);
  for (const i of items) {
    delta.set(i.l.id, cursor - pos(i.b));
    cursor += len(i.b) + gap;
  }
  return layers.map((l) => {
    const d = delta.get(l.id);
    return d === undefined || d === 0 ? l : h ? move(l, d, 0) : move(l, 0, d);
  });
}
