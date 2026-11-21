import { MAX_ZOOM, MIN_ZOOM, clampZoom, snap } from '../../video/timeline-math.ts';

/**
 * The arithmetic of the centre-playhead timeline, with no screen in it.
 *
 * The playhead is fixed at the horizontal centre of the timeline; the content
 * slides under it. So there is no scroll position to keep: the one number is
 * the time under the playhead, and the screen x of anything at time `t` is
 *
 *     screenX = centre + (t - time) * zoom
 *
 * "Scroll offset" below means `time * zoom`, the number of pixels the content
 * has moved left from the position where time 0 sits under the playhead.
 */

export { MAX_ZOOM, MIN_ZOOM, clampZoom };

/** Default pixels per second on a phone: about eight seconds across a 390 px screen. */
export const PHONE_ZOOM = 48;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The content's scroll offset (px) when `time` is under the playhead. */
export const offsetOfTime = (time: number, zoom: number): number => time * zoom;

/** The time under the playhead for a scroll offset, kept inside the edit (0..length). */
export const timeAtOffset = (offsetPx: number, zoom: number, length: number): number => clamp(offsetPx / (zoom || 1), 0, Math.max(0, length));

/** Screen x (px from the timeline's left edge) of an item at `t`, with the playhead at `time` and the centre at `centre`. */
export const screenXOf = (t: number, time: number, zoom: number, centre: number): number => centre + (t - time) * zoom;

/** The time at a screen x: the inverse of `screenXOf`. */
export const timeAtScreenX = (x: number, time: number, zoom: number, centre: number): number => time + (x - centre) / (zoom || 1);

/**
 * The time under the playhead while a finger drags the content: the time when the finger went down, minus the drag
 * (content follows the finger, so dragging right moves the playhead EARLIER).
 */
export const scrubTime = (startTime: number, dxPx: number, zoom: number, length: number): number => clamp(startTime - dxPx / (zoom || 1), 0, Math.max(0, length));

/** The zoom after a pinch that began at `startZoom`. The playhead keeps its time (it is the pinch's anchor), so nothing else moves. */
export const pinchZoom = (startZoom: number, scale: number): number => clampZoom(startZoom * (Number.isFinite(scale) && scale > 0 ? scale : 1));

/** Snaps the playhead's time to the nearest point within `thresholdPx` of screen; null `hit` when none is that close. */
export const scrubSnap = (t: number, points: readonly number[], zoom: number, thresholdPx = 6): { time: number; hit: number | null } => snap(t, points, thresholdPx, zoom);

// ---------- momentum ----------

/** Per-millisecond exponential decay of a fling's speed. About 0.4 s until it is slow. */
export const FRICTION = 0.006;
/** Slower than this (px per ms) a fling is over. */
export const STOP_SPEED = 0.03;

export interface Sample {
  x: number;
  t: number;
}

/** Finger speed in px per ms from the last samples within `windowMs` (0 with fewer than two). Positive = rightward. */
export function velocityOf(samples: readonly Sample[], windowMs = 100): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  const first = samples.find((s) => last.t - s.t <= windowMs);
  if (!first || first === last || last.t - first.t <= 0) return 0;
  return (last.x - first.x) / (last.t - first.t);
}

/** A fling `elapsedMs` after release: the distance travelled so far (px, signed) and the speed now. */
export function flingAt(v0: number, elapsedMs: number): { dist: number; speed: number; done: boolean } {
  const e = Math.exp(-FRICTION * Math.max(0, elapsedMs));
  const speed = v0 * e;
  return { dist: (v0 / FRICTION) * (1 - e), speed, done: Math.abs(speed) < STOP_SPEED };
}
