import { boundsOf } from '../editor/layers.ts';
import { corners, extents } from '../editor/transform-math.ts';
import type { LayerBox } from '../video/contracts.ts';
import { isImage, isShape, type ImageLayer, type PhotoLayer, type ShapeLayer } from './doc.ts';
import { shapeOutline, type Pt, type Rect } from './geometry.ts';

/**
 * Picking layers on the page: the box of any layer, the front-most layer under a point, the layers a marquee touches, and the
 * rectangle a selection covers. Hidden layers are never picked; locked layers cannot be picked or marquee-selected on the canvas
 * (the layers panel selects them by id). Positions are in output pixels, like the layers themselves.
 */

type Measure = Parameters<typeof boundsOf>[0];

/** Used only when no canvas is at hand to measure text: a rough width so a layer can still be picked. */
const roughMeasure = (size: number): Measure => ({ font: '', measureText: (s: string) => ({ width: s.length * size * 0.55 }) as TextMetrics }) as unknown as Measure;

/** TextLayer (editor/layers.ts) has no `hidden`/`locked` fields yet; they are read from any layer so text honours them as soon as it has them. */
export const isHidden = (l: PhotoLayer): boolean => !!(l as { hidden?: boolean }).hidden;
export const isLocked = (l: PhotoLayer): boolean => !!(l as { locked?: boolean }).locked;

/** The (rotated) box of a layer: centre, size and rotation. Text is measured with `measure` (a canvas context). Flips do not change the box. */
export function boxOfLayer(layer: PhotoLayer, measure?: unknown): LayerBox {
  if (isImage(layer) || isShape(layer)) return { id: layer.id, cx: layer.x + layer.w / 2, cy: layer.y + layer.h / 2, w: layer.w, h: layer.h, rotation: layer.rotation };
  const r = boundsOf((measure as Measure | undefined) ?? roughMeasure(layer.style.size), layer);
  return { id: layer.id, cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, h: r.h, rotation: layer.rotation ?? 0 };
}

/** A page point as a point of the layer's own box (origin at the box's top-left, flips undone). */
function toLocal(l: ImageLayer | ShapeLayer, x: number, y: number): Pt {
  const a = (-l.rotation * Math.PI) / 180;
  const dx = x - (l.x + l.w / 2);
  const dy = y - (l.y + l.h / 2);
  let lx = dx * Math.cos(a) - dy * Math.sin(a);
  let ly = dx * Math.sin(a) + dy * Math.cos(a);
  if (l.flipX) lx = -lx;
  if (l.flipY) ly = -ly;
  return { x: lx + l.w / 2, y: ly + l.h / 2 };
}

/** Even-odd point in polygon. */
function inPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from a point to the segment a-b. */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The distance from a point to the nearest edge of a closed polygon, or to a polyline when `closed` is false. */
function distToOutline(p: Pt, pts: Pt[], closed: boolean): number {
  let d = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) d = Math.min(d, distToSegment(p, pts[i]!, pts[(i + 1) % pts.length]!));
  return d;
}

/** How near (pixels) a click must be to a line, a stroke or a text box to count as on it. */
export const HIT_SLACK = 6;

function hitsLayer(l: PhotoLayer, x: number, y: number, measure: unknown, slack: number): boolean {
  if (isShape(l)) {
    const p = toLocal(l, x, y);
    if (l.shape === 'line' || l.shape === 'arrow') {
      const width = l.stroke?.width ?? 4;
      // The line runs along the middle of its box; the arrow head sits inside the box's end, so the segment is enough.
      return distToOutline(p, shapeOutline(l.shape, l.w, l.h), false) <= width / 2 + Math.max(slack, 4);
    }
    const outline = shapeOutline(l.shape, l.w, l.h);
    if (l.fill && l.fill !== 'transparent' && inPolygon(p, outline)) return true;
    // An unfilled shape, or a click on a stroke: near the outline.
    if (l.stroke || !l.fill) return distToOutline(p, outline, true) <= (l.stroke?.width ?? 0) / 2 + slack;
    return false;
  }
  if (isImage(l)) {
    const p = toLocal(l, x, y);
    if (p.x < 0 || p.y < 0 || p.x > l.w || p.y > l.h) return false;
    if (l.frame === 'ellipse' || l.frame === 'heart' || l.frame === 'star' || l.frame === 'triangle') return inPolygon(p, shapeOutline(l.frame, l.w, l.h));
    return true;
  }
  // text: its box, with a little slack
  const b = boxOfLayer(l, measure);
  const a = (-b.rotation * Math.PI) / 180;
  const dx = x - b.cx;
  const dy = y - b.cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= b.w / 2 + slack && Math.abs(ly) <= b.h / 2 + slack;
}

/** The id of the front-most layer under a point, or null. Hidden and locked layers are skipped. Later in the list is in front. */
export function hitPage(layers: readonly PhotoLayer[], x: number, y: number, measure?: unknown, slack = HIT_SLACK): string | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]!;
    if (isHidden(l) || isLocked(l)) continue;
    if (hitsLayer(l, x, y, measure, slack)) return l.id;
  }
  return null;
}

/** Whether two convex quadrilaterals overlap (separating axis test on their edge normals). */
function quadsOverlap(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      const proj = (pts: Pt[]) => pts.map((v) => v.x * nx + v.y * ny);
      const pa = proj(a);
      const pb = proj(b);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  }
  return true;
}

/**
 * The ids of the layers a marquee rectangle selects, in drawing order. `touch` (default): any overlap with the layer's box;
 * `contain`: the whole box inside the marquee. Hidden and locked layers are left out.
 */
export function layersInRect(layers: readonly PhotoLayer[], rect: Rect, measure?: unknown, mode: 'touch' | 'contain' = 'touch'): string[] {
  const quad: Pt[] = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y }, { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h }];
  const out: string[] = [];
  for (const l of layers) {
    if (isHidden(l) || isLocked(l)) continue;
    const box = boxOfLayer(l, measure);
    const cs = corners(box);
    const ok = mode === 'contain' ? cs.every((p) => p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) : quadsOverlap(cs, quad);
    if (ok) out.push(l.id);
  }
  return out;
}

/** The axis-aligned rectangle that holds the (rotated) boxes of the chosen layers, or null when none of them exists. */
export function boundsOfSelection(layers: readonly PhotoLayer[], ids: readonly string[], measure?: unknown): Rect | null {
  const boxes = layers.filter((l) => ids.includes(l.id)).map((l) => extents(boxOfLayer(l, measure)));
  if (boxes.length === 0) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
