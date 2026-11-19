import type { LayerBox } from '../video/contracts.ts';

/**
 * Snapping while a layer is moved or resized: pure functions, no DOM.
 * Distances are compared in SCREEN pixels: `thresholdPx / zoom` is the reach in
 * page pixels (zoom = screen pixels per page pixel).
 */

export type GuideKind = 'page-edge' | 'page-center' | 'layer';

/** A line to draw: `axis: 'x'` is a vertical line at x = `pos`, running from `from` to `to` in y (and the reverse for 'y'). */
export interface Guide {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
  kind: GuideKind;
}

export interface SnapMove {
  /** The box centre after snapping. */
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  guides: Guide[];
}

interface Edges {
  l: number;
  c: number;
  r: number;
  t: number;
  m: number;
  b: number;
}

/** Upright extent of a box after rotation about its centre. */
function edgesOf(b: LayerBox): Edges {
  const a = ((b.rotation || 0) * Math.PI) / 180;
  const w = b.w * Math.abs(Math.cos(a)) + b.h * Math.abs(Math.sin(a));
  const h = b.w * Math.abs(Math.sin(a)) + b.h * Math.abs(Math.cos(a));
  return { l: b.cx - w / 2, c: b.cx, r: b.cx + w / 2, t: b.cy - h / 2, m: b.cy, b: b.cy + h / 2 };
}

interface Target {
  pos: number;
  kind: GuideKind;
  /** The other axis' extent of the thing the line belongs to. */
  from: number;
  to: number;
}

const EPS = 1e-6;
const RANK: Record<GuideKind, number> = { 'page-edge': 0, 'page-center': 1, layer: 2 };

function targetsFor(axis: 'x' | 'y', others: readonly LayerBox[], page: { w: number; h: number }): Target[] {
  const x = axis === 'x';
  const len = x ? page.h : page.w;
  const size = x ? page.w : page.h;
  const out: Target[] = [
    { pos: 0, kind: 'page-edge', from: 0, to: len },
    { pos: size / 2, kind: 'page-center', from: 0, to: len },
    { pos: size, kind: 'page-edge', from: 0, to: len },
  ];
  for (const o of others) {
    const e = edgesOf(o);
    const [a, c, z, f, t] = x ? [e.l, e.c, e.r, e.t, e.b] : [e.t, e.m, e.b, e.l, e.r];
    for (const pos of [a, c, z]) out.push({ pos, kind: 'layer', from: f, to: t });
  }
  return out;
}

/**
 * The delta that brings the nearest feature to the nearest target, or null if
 * none is within `reach`. On a tie in distance the page wins over the centre
 * and the centre over other layers; on a full tie the first found is used.
 */
function bestDelta(features: readonly number[], targets: readonly Target[], reach: number): number | null {
  let best: { d: number; abs: number; rank: number } | null = null;
  for (const f of features) {
    for (const t of targets) {
      const d = t.pos - f;
      const abs = Math.abs(d);
      if (abs > reach + EPS) continue;
      const rank = RANK[t.kind];
      if (!best || abs < best.abs - EPS || (Math.abs(abs - best.abs) <= EPS && rank < best.rank)) best = { d, abs, rank };
    }
  }
  return best ? best.d : null;
}

/** Guides for every target that a feature lies on (after the snap), with lines long enough to join the two things. */
function guidesFor(axis: 'x' | 'y', features: readonly number[], targets: readonly Target[], moving: [number, number]): Guide[] {
  const out: Guide[] = [];
  for (const t of targets) {
    if (!features.some((f) => Math.abs(f - t.pos) <= EPS)) continue;
    const from = t.kind === 'layer' ? Math.min(t.from, moving[0]) : t.from;
    const to = t.kind === 'layer' ? Math.max(t.to, moving[1]) : t.to;
    if (!out.some((g) => Math.abs(g.pos - t.pos) <= EPS && g.kind === t.kind && g.from === from && g.to === to)) out.push({ axis, pos: t.pos, from, to, kind: t.kind });
  }
  return out;
}

/**
 * Snaps a box being dragged: its left/centre/right edges to the page edges,
 * page centre and other layers' edges and centres, and the same for top/middle/
 * bottom, each axis on its own. Rotated boxes are handled by their upright extent.
 */
export function snapMove(box: LayerBox, others: readonly LayerBox[], page: { w: number; h: number }, thresholdPx: number, zoom: number): SnapMove {
  const reach = thresholdPx / (zoom > 0 ? zoom : 1);
  const e = edgesOf(box);
  const tx = targetsFor('x', others, page);
  const ty = targetsFor('y', others, page);
  const dx = bestDelta([e.l, e.c, e.r], tx, reach) ?? 0;
  const dy = bestDelta([e.t, e.m, e.b], ty, reach) ?? 0;
  const guides = [
    ...guidesFor('x', [e.l + dx, e.c + dx, e.r + dx], tx, [e.t + dy, e.b + dy]),
    ...guidesFor('y', [e.t + dy, e.m + dy, e.b + dy], ty, [e.l + dx, e.r + dx]),
  ];
  return { cx: box.cx + dx, cy: box.cy + dy, dx, dy, guides };
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface SnapResize {
  box: LayerBox;
  guides: Guide[];
}

/**
 * Snaps the edge(s) a resize handle drags; the opposite edges stay put. Only for
 * upright boxes (rotation 0): a turned box is returned as it is, with no guides.
 */
export function snapResize(box: LayerBox, handle: Handle, others: readonly LayerBox[], page: { w: number; h: number }, thresholdPx: number, zoom: number): SnapResize {
  if (box.rotation % 360 !== 0) return { box, guides: [] };
  const reach = thresholdPx / (zoom > 0 ? zoom : 1);
  let l = box.cx - box.w / 2;
  let r = box.cx + box.w / 2;
  let t = box.cy - box.h / 2;
  let b = box.cy + box.h / 2;
  const tx = targetsFor('x', others, page);
  const ty = targetsFor('y', others, page);
  const east = handle.includes('e');
  const west = handle.includes('w');
  const north = handle.includes('n');
  const south = handle.includes('s');
  if (east) r += bestDelta([r], tx, reach) ?? 0;
  if (west) l += bestDelta([l], tx, reach) ?? 0;
  if (north) t += bestDelta([t], ty, reach) ?? 0;
  if (south) b += bestDelta([b], ty, reach) ?? 0;
  const out: LayerBox = { ...box, cx: (l + r) / 2, cy: (t + b) / 2, w: r - l, h: b - t };
  const guides = [
    ...(east || west ? guidesFor('x', [east ? r : l], tx, [t, b]) : []),
    ...(north || south ? guidesFor('y', [north ? t : b], ty, [l, r]) : []),
  ];
  return { box: out, guides };
}
