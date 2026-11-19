import { boundsOf, type TextLayer } from '../editor/layers.ts';
import type { LayerBox } from './contracts.ts';
import { resolve } from './keyframes.ts';
import { isAudio, isMedia, trackOf, type Layer } from './project.ts';

/**
 * Where a layer is on the frame, for picking it with the pointer and for the
 * transform handles. A media layer's x and y are its top-left corner before it
 * is rotated; it turns about its centre. Text is the same: its x and y are the
 * top-left of its unrotated box.
 */

type Measure = Parameters<typeof boundsOf>[0];

/** Used only when no canvas is at hand to measure text: a rough width so a layer can still be picked. */
const roughMeasure = (size: number): Measure => ({ font: '', measureText: (s: string) => ({ width: s.length * size * 0.55 }) as TextMetrics }) as unknown as Measure;

export function boxOf(layer: Layer, measure?: unknown): LayerBox | null {
  if (isAudio(layer)) return null;
  if (isMedia(layer)) return { id: layer.id, cx: layer.x + layer.w / 2, cy: layer.y + layer.h / 2, w: layer.w, h: layer.h, rotation: layer.rotation };
  const t = layer as TextLayer;
  const r = boundsOf((measure as Measure | undefined) ?? roughMeasure(t.style.size), t);
  return { id: t.id, cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, h: r.h, rotation: t.rotation ?? 0 };
}

/** Whether a point is inside a box, turning the point back by the box's rotation. `slack` widens the box on every side. */
export function inBox(b: LayerBox, x: number, y: number, slack = 0): boolean {
  const a = (-b.rotation * Math.PI) / 180;
  const dx = x - b.cx;
  const dy = y - b.cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= b.w / 2 + slack && Math.abs(ly) <= b.h / 2 + slack;
}

/** Layers that show a picture, in drawing order: lowest lane first, and within a lane the list order. */
export function stackOrder(layers: readonly Layer[]): Layer[] {
  const shown = layers.filter((l) => !isAudio(l));
  // Stable sort by lane: skip it (and its bookkeeping) when the list is already in lane order.
  let sorted = true;
  for (let i = 1; i < shown.length && sorted; i++) if (trackOf(shown[i - 1]!) > trackOf(shown[i]!)) sorted = false;
  return sorted ? shown : shown.map((l, i) => ({ l, i })).sort((a, b) => trackOf(a.l) - trackOf(b.l) || a.i - b.i).map(({ l }) => l);
}

const shownAt = (l: Layer, t: number): boolean => (l.start === undefined || t >= l.start) && (l.end === undefined || t < l.end);

/** Picture layers (media and text) on screen at edit time `t`, in drawing order. */
export const visibleLayers = (layers: readonly Layer[], time: number): Layer[] => stackOrder(layers).filter((l) => shownAt(l, time));

/** The id of the front-most layer under a point, or null. With `time`, only layers shown then count. Text gets a few pixels of slack, as in the photo editor. */
export function hitLayers(layers: readonly Layer[], x: number, y: number, measure?: unknown, time?: number): string | null {
  const order = time === undefined ? stackOrder(layers) : visibleLayers(layers, time);
  for (let i = order.length - 1; i >= 0; i--) {
    const l = order[i]!;
    // A layer with keyframes is where its keyframes put it at this moment.
    const b = boxOf(time === undefined ? l : (resolve(l as Parameters<typeof resolve>[0], time - (l.start ?? 0)) as Layer), measure);
    if (b && inBox(b, x, y, isMedia(l) ? 0 : 6)) return l.id;
  }
  return null;
}
