import type { Geometry } from './doc.ts';
import { SIGN, type Handle } from '../editor/transform-math.ts';

/*
 * The crop tool's geometry, pure. The user drags a box in the picture as it is
 * SHOWN (flipped and turned, not straightened); Geometry stores the crop in the
 * ORIGINAL picture's pixels. Order of operations (doc.ts): flip, then turn
 * clockwise. The conversions below are exact for those two; straightening is
 * a separate angle that does not move the box.
 */

export interface Size {
  w: number;
  h: number;
}
export interface Box extends Size {
  x: number;
  y: number;
}
export interface Pt {
  x: number;
  y: number;
}
type Turns = 0 | 1 | 2 | 3;
type Orient = Pick<Geometry, 'turns' | 'flipX' | 'flipY'>;

/** Smallest side of a box, in picture pixels. */
export const MIN_BOX = 8;

export const displaySize = (src: Size, turns: Turns = 0): Size => (turns % 2 ? { w: src.h, h: src.w } : { w: src.w, h: src.h });

/** An original-picture point as shown: flip about the picture, then turn clockwise. */
export function toDisplayPoint(p: Pt, src: Size, g: Orient): Pt {
  const x = g.flipX ? src.w - p.x : p.x;
  const y = g.flipY ? src.h - p.y : p.y;
  switch (g.turns ?? 0) {
    case 1:
      return { x: src.h - y, y: x };
    case 2:
      return { x: src.w - x, y: src.h - y };
    case 3:
      return { x: y, y: src.w - x };
    default:
      return { x, y };
  }
}

/** The inverse of toDisplayPoint. */
export function fromDisplayPoint(p: Pt, src: Size, g: Orient): Pt {
  let x: number;
  let y: number;
  switch (g.turns ?? 0) {
    case 1:
      (x = p.y), (y = src.h - p.x);
      break;
    case 2:
      (x = src.w - p.x), (y = src.h - p.y);
      break;
    case 3:
      (x = src.w - p.y), (y = p.x);
      break;
    default:
      (x = p.x), (y = p.y);
  }
  return { x: g.flipX ? src.w - x : x, y: g.flipY ? src.h - y : y };
}

function mapRect(r: Box, f: (p: Pt) => Pt): Box {
  const a = f({ x: r.x, y: r.y });
  const b = f({ x: r.x + r.w, y: r.y + r.h });
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/** The crop box as shown: the whole display when there is no crop. */
export function boxFromGeometry(src: Size, g: Geometry): Box {
  const d = displaySize(src, g.turns ?? 0);
  if (!g.crop) return { x: 0, y: 0, w: d.w, h: d.h };
  return mapRect(g.crop, (p) => toDisplayPoint(p, src, g));
}

/** The geometry with the box (as shown) stored as an original-pixel crop in whole pixels; the whole display stores no crop. */
export function geometryWithBox(src: Size, g: Geometry, box: Box): Geometry {
  const d = displaySize(src, g.turns ?? 0);
  const { crop: _drop, ...rest } = g;
  if (box.x <= 0 && box.y <= 0 && box.w >= d.w && box.h >= d.h) return rest;
  const o = mapRect(box, (p) => fromDisplayPoint(p, src, g));
  const x = Math.max(0, Math.min(src.w - 1, Math.round(o.x)));
  const y = Math.max(0, Math.min(src.h - 1, Math.round(o.y)));
  const w = Math.max(1, Math.min(src.w - x, Math.round(o.w)));
  const h = Math.max(1, Math.min(src.h - y, Math.round(o.h)));
  return { ...rest, crop: { x, y, w, h } };
}

/** A quarter turn (+1 clockwise, -1 anticlockwise). The crop stays on the same part of the picture. */
export function turn(g: Geometry, dir: 1 | -1): Geometry {
  return { ...g, turns: ((((g.turns ?? 0) + dir) % 4) + 4) % 4 as Turns };
}

/**
 * Mirrors what is shown, horizontally ('h') or vertically ('v'). Since the
 * stored flip happens before the turn, an odd number of turns swaps the axis;
 * a mirror also reverses the sense of the straighten angle. Mirroring twice is
 * the identity. Checked point by point in the tests.
 */
export function flipDisplay(g: Geometry, axis: 'h' | 'v'): Geometry {
  const odd = (g.turns ?? 0) % 2 === 1;
  const key: 'flipX' | 'flipY' = (axis === 'h') !== odd ? 'flipX' : 'flipY';
  const out: Geometry = { ...g, [key]: !g[key] };
  if (g.straighten) out.straighten = -g.straighten;
  return out;
}

// ------------------------------------------------------------------ the box

const clampN = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Moves the box, keeping it inside the bounds. */
export function moveBox(b: Box, dx: number, dy: number, bounds: Size): Box {
  return { ...b, x: clampN(b.x + dx, 0, bounds.w - b.w), y: clampN(b.y + dy, 0, bounds.h - b.h) };
}

export function nudgeBox(b: Box, key: string, step: number, bounds: Size): Box {
  const d = key === 'ArrowLeft' ? [-step, 0] : key === 'ArrowRight' ? [step, 0] : key === 'ArrowUp' ? [0, -step] : key === 'ArrowDown' ? [0, step] : [0, 0];
  return moveBox(b, d[0]!, d[1]!, bounds);
}

/**
 * Drags a handle by (dx, dy) picture pixels from the box as it was when the
 * drag began. Free: the sides the handle touches move, kept inside the bounds
 * and at least MIN_BOX wide. With `ratio` (w/h): a corner keeps the opposite
 * corner fixed and follows the larger pull; an edge changes the other side
 * about the box's centre; the result is scaled down to fit inside the bounds.
 */
export function resizeBox(b: Box, h: Handle, dx: number, dy: number, bounds: Size, ratio?: number): Box {
  const [sx, sy] = SIGN[h];
  let left = b.x;
  let right = b.x + b.w;
  let top = b.y;
  let bottom = b.y + b.h;
  if (sx < 0) left = clampN(left + dx, 0, right - MIN_BOX);
  if (sx > 0) right = clampN(right + dx, left + MIN_BOX, bounds.w);
  if (sy < 0) top = clampN(top + dy, 0, bottom - MIN_BOX);
  if (sy > 0) bottom = clampN(bottom + dy, top + MIN_BOX, bounds.h);
  if (!ratio) return { x: left, y: top, w: right - left, h: bottom - top };

  const r = ratio;
  if (sx !== 0 && sy !== 0) {
    // anchor = the opposite corner
    const ax = sx < 0 ? b.x + b.w : b.x;
    const ay = sy < 0 ? b.y + b.h : b.y;
    const roomW = sx < 0 ? ax : bounds.w - ax;
    const roomH = sy < 0 ? ay : bounds.h - ay;
    const wantW = b.w + sx * dx;
    const wantH = b.h + sy * dy;
    let w = Math.max(wantW, wantH * r);
    w = clampN(w, Math.max(MIN_BOX, MIN_BOX * r), Math.min(roomW, roomH * r));
    const hh = w / r;
    return { x: sx < 0 ? ax - w : ax, y: sy < 0 ? ay - hh : ay, w, h: hh };
  }
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  if (sx !== 0) {
    const edgeX = sx > 0 ? right : left;
    const anchor = sx > 0 ? b.x : b.x + b.w;
    let w = Math.abs(edgeX - anchor);
    w = Math.min(w, bounds.h * r, 2 * Math.min(cy, bounds.h - cy) * r);
    w = Math.max(w, Math.max(MIN_BOX, MIN_BOX * r));
    const hh = w / r;
    return { x: sx > 0 ? anchor : anchor - w, y: cy - hh / 2, w, h: hh };
  }
  const edgeY = sy > 0 ? bottom : top;
  const anchor = sy > 0 ? b.y : b.y + b.h;
  let hh = Math.abs(edgeY - anchor);
  hh = Math.min(hh, bounds.w / r, (2 * Math.min(cx, bounds.w - cx)) / r);
  hh = Math.max(hh, Math.max(MIN_BOX, MIN_BOX / r));
  const w = hh * r;
  return { x: cx - w / 2, y: sy > 0 ? anchor : anchor - hh, w, h: hh };
}

/** The largest box of the ratio that fits the bounds, centred on the current box's centre as far as the bounds allow. */
export function boxForAspect(b: Box, bounds: Size, ratio: number): Box {
  let w = bounds.w;
  let h = w / ratio;
  if (h > bounds.h) (h = bounds.h), (w = h * ratio);
  // not larger than the current box needs? keep it the biggest: matches what photo apps do
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return { x: clampN(cx - w / 2, 0, bounds.w - w), y: clampN(cy - h / 2, 0, bounds.h - h), w, h };
}

export interface Aspect {
  id: string;
  label: string;
  /** w/h; undefined for Free; 'original' is resolved from the picture. */
  ratio?: number;
}

export const ASPECTS: readonly Aspect[] = [
  { id: 'free', label: 'Free' },
  { id: 'original', label: 'Original' },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '5:4', label: '5:4', ratio: 5 / 4 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '2:3', label: '2:3', ratio: 2 / 3 },
];
