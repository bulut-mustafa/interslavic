import type { LayerBox } from '../video/contracts.ts';
import type { MediaLayer } from '../video/project.ts';

/**
 * The geometry behind the on-canvas handles. Pure: no DOM, no React.
 *
 * Conventions: frame pixels, y down, `rotation` in degrees clockwise about the
 * centre (as in `LayerBox`). A box's own axes are u = (cos r, sin r) along its
 * width and v = (-sin r, cos r) along its height, so a handle name such as
 * `ne` always means the corner that is top-right before the rotation.
 */

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export interface Pt {
  x: number;
  y: number;
}

export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Which way each handle pulls along the box's own x and y: -1, 0 or 1. */
export const SIGN: Record<Handle, readonly [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

export const isCorner = (h: Handle): boolean => SIGN[h][0] !== 0 && SIGN[h][1] !== 0;

/** Smallest width or height, in frame pixels, a box can be dragged down to. */
export const MIN_SIZE = 8;
/** How much of a moved box (its bounding rectangle) must stay inside the frame, in pixels. */
export const KEEP_IN_FRAME = 24;

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** A box-local offset (along width, along height) as a frame-space offset. */
function toFrame(rotation: number, lx: number, ly: number): Pt {
  const c = Math.cos(rad(rotation));
  const s = Math.sin(rad(rotation));
  return { x: lx * c - ly * s, y: lx * s + ly * c };
}

/** A frame-space offset as a box-local one. */
function toLocal(rotation: number, dx: number, dy: number): Pt {
  const c = Math.cos(rad(rotation));
  const s = Math.sin(rad(rotation));
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/** A point of the box given in box-local units from the centre. */
export function pointOf(box: LayerBox, lx: number, ly: number): Pt {
  const o = toFrame(box.rotation, lx, ly);
  return { x: box.cx + o.x, y: box.cy + o.y };
}

/** The four corners, clockwise from the top-left one. */
export function corners(box: LayerBox): [Pt, Pt, Pt, Pt] {
  const a = box.w / 2;
  const b = box.h / 2;
  return [pointOf(box, -a, -b), pointOf(box, a, -b), pointOf(box, a, b), pointOf(box, -a, b)];
}

/** The axis-aligned rectangle that just holds the rotated box. */
export function extents(box: LayerBox): { x: number; y: number; w: number; h: number } {
  const cs = corners(box);
  const x0 = Math.min(...cs.map((p) => p.x));
  const x1 = Math.max(...cs.map((p) => p.x));
  const y0 = Math.min(...cs.map((p) => p.y));
  const y1 = Math.max(...cs.map((p) => p.y));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Where the eight resize handles sit, in frame pixels. */
export function handlePositions(box: LayerBox): Record<Handle, Pt> {
  const out = {} as Record<Handle, Pt>;
  for (const h of HANDLES) out[h] = pointOf(box, (SIGN[h][0] * box.w) / 2, (SIGN[h][1] * box.h) / 2);
  return out;
}

/** Where the rotate handle sits: centred above the top edge, `offset` frame pixels away from it. */
export function rotateHandle(box: LayerBox, offset: number): Pt {
  return pointOf(box, 0, -box.h / 2 - offset);
}

/** The point is inside the (rotated) box. */
export function containsPoint(box: LayerBox, p: Pt): boolean {
  const l = toLocal(box.rotation, p.x - box.cx, p.y - box.cy);
  return Math.abs(l.x) <= box.w / 2 && Math.abs(l.y) <= box.h / 2;
}

/** Keeps at least `keep` pixels of the box's bounding rectangle inside the frame, by moving its centre. */
export function clampToFrame(box: LayerBox, frame: { w: number; h: number }, keep = KEEP_IN_FRAME): LayerBox {
  const e = extents(box);
  const k = Math.min(keep, e.w, e.h);
  let dx = 0;
  let dy = 0;
  if (e.x + e.w < k) dx = k - (e.x + e.w);
  else if (e.x > frame.w - k) dx = frame.w - k - e.x;
  if (e.y + e.h < k) dy = k - (e.y + e.h);
  else if (e.y > frame.h - k) dy = frame.h - k - e.y;
  return dx || dy ? { ...box, cx: box.cx + dx, cy: box.cy + dy } : box;
}

/** Moves the box by a frame-space offset, then keeps part of it in the frame when a frame is given. */
export function moveBox(box: LayerBox, dx: number, dy: number, frame?: { w: number; h: number }): LayerBox {
  const moved = { ...box, cx: box.cx + dx, cy: box.cy + dy };
  return frame ? clampToFrame(moved, frame) : moved;
}

export interface ResizeOptions {
  /** Keep the width : height ratio of the box as it was. */
  proportional?: boolean;
  /** The centre stays put and both sides move together. */
  fromCentre?: boolean;
}

/**
 * Drags `handle` to `pointer` (frame pixels). The opposite corner, or for an
 * edge handle the opposite edge, stays exactly where it was in frame space
 * (with `fromCentre`, the centre does). An edge handle changes one dimension
 * only unless `proportional`, when the other dimension follows and stays
 * centred on the unmoved axis.
 */
export function resizeBox(box: LayerBox, handle: Handle, pointer: Pt, opts: ResizeOptions = {}): LayerBox {
  const [sx, sy] = SIGN[handle];
  const q = toLocal(box.rotation, pointer.x - box.cx, pointer.y - box.cy);
  // New size along each moved axis. The fixed side is the opposite one (local -s*half), or the centre.
  const along = (s: number, q1: number, size: number): number => (s === 0 ? size : opts.fromCentre ? 2 * s * q1 : s * q1 + size / 2);
  let w = along(sx, q.x, box.w);
  let h = along(sy, q.y, box.h);
  if (opts.proportional && box.w > 0 && box.h > 0) {
    const f = sx !== 0 && sy !== 0 ? Math.max(w / box.w, h / box.h) : sx !== 0 ? w / box.w : h / box.h;
    w = box.w * f;
    h = box.h * f;
  }
  // Never smaller than MIN_SIZE on either side, whichever side limits it.
  const floor = opts.proportional ? Math.max(MIN_SIZE / box.w, MIN_SIZE / box.h) : 0;
  if (opts.proportional) {
    const f = Math.max(w / box.w, floor);
    w = box.w * f;
    h = box.h * f;
  } else {
    if (sx !== 0) w = Math.max(w, MIN_SIZE);
    if (sy !== 0) h = Math.max(h, MIN_SIZE);
  }
  // The new centre in box-local terms: on the fixed side plus half the new size; an unmoved axis keeps its centre line.
  const lx = opts.fromCentre || sx === 0 ? 0 : (sx * (w - box.w)) / 2;
  const ly = opts.fromCentre || sy === 0 ? 0 : (sy * (h - box.h)) / 2;
  const o = toFrame(box.rotation, lx, ly);
  return { ...box, w, h, cx: box.cx + o.x, cy: box.cy + o.y };
}

/** Any angle as one in (-180, 180]. */
export function normalizeDeg(deg: number): number {
  const r = ((((deg + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
}

export interface RotateOptions {
  /** Round to a multiple of this many degrees (15 with Shift held in Figma and Canva). */
  snapDeg?: number;
  /** Where the pointer went down. With it the box turns by the angle the pointer has swept; without it the angle is absolute with the handle straight above the box. */
  grab?: Pt;
}

/** Angle in degrees of the pointer seen from the centre, 0 when straight above and growing clockwise. */
const aimOf = (box: LayerBox, p: Pt): number => (Math.atan2(p.y - box.cy, p.x - box.cx) * 180) / Math.PI + 90;

export function rotateBox(box: LayerBox, pointer: Pt, opts: RotateOptions = {}): LayerBox {
  let r = opts.grab ? box.rotation + (aimOf(box, pointer) - aimOf(box, opts.grab)) : aimOf(box, pointer);
  if (opts.snapDeg && opts.snapDeg > 0) r = Math.round(r / opts.snapDeg) * opts.snapDeg;
  return { ...box, rotation: normalizeDeg(r) };
}

/** The box of a media layer: its x and y are the top-left corner before rotation, which turns about the centre. */
export const boxOfMedia = (l: Pick<MediaLayer, 'id' | 'x' | 'y' | 'w' | 'h' | 'rotation'>): LayerBox => ({ id: l.id, cx: l.x + l.w / 2, cy: l.y + l.h / 2, w: l.w, h: l.h, rotation: l.rotation });

/** The layer fields a box stands for. */
export const patchOfBox = (b: LayerBox): Pick<MediaLayer, 'x' | 'y' | 'w' | 'h' | 'rotation'> => ({ x: b.cx - b.w / 2, y: b.cy - b.h / 2, w: b.w, h: b.h, rotation: b.rotation });
