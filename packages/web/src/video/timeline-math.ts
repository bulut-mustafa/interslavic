import { isAudio, isMedia, sourceOf, trackOf, editLength, type Layer, type VideoProject } from './project.ts';
import { EPS, moveKey, type Track } from './keyframes.ts';
import { MIN_CLIP, length, startOf, total, type Clip } from './timeline.ts';

/**
 * The arithmetic of the timeline, with no screen in it: pixels and seconds,
 * where things snap, how far an item may be moved or trimmed. All times are
 * edit seconds unless a name says otherwise.
 */

export const MIN_ZOOM = 2; // px per second
export const MAX_ZOOM = 600;
export const MIN_LAYER = MIN_CLIP;

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(z) ? z : MIN_ZOOM));
export const timeToPx = (t: number, zoom: number): number => t * zoom;
export const pxToTime = (px: number, zoom: number): number => px / (zoom || 1);

/** The zoom (px per second) that fits `duration` into `viewportPx`, leaving `padPx` free at the end. */
export function zoomToFit(duration: number, viewportPx: number, padPx = 24): number {
  if (!(duration > 0) || !(viewportPx > padPx)) return clampZoom(MIN_ZOOM * 10);
  return clampZoom((viewportPx - padPx) / duration);
}

/** The scroll position that keeps `time` at the same `offsetPx` from the viewport's left edge after the zoom changes. */
export const scrollForAnchor = (time: number, offsetPx: number, zoom: number): number => Math.max(0, time * zoom - offsetPx);

// ---------- layers: the numbers every layer kind shares ----------

/** Start and end of a layer on the edit clock; text layers may leave them open, which means "the whole edit". */
export const layerSpan = (l: Layer, editEnd: number): { start: number; end: number } => ({ start: l.start ?? 0, end: l.end ?? editEnd });

const speedOf = (l: Layer): number => {
  const s = isMedia(l) || isAudio(l) ? l.speed : undefined;
  return s && s > 0 ? s : 1;
};

/** The edit's end, for open-ended texts. */
export const projectEnd = (p: VideoProject): number => editLength(p, total(p.clips));

// ---------- snapping ----------

/** Where the main track's clips begin and end (every boundary once). */
export function mainEdges(clips: Clip[], exclude?: string): number[] {
  const out: number[] = [];
  let at = 0;
  for (const c of clips) {
    const next = at + length(c);
    if (c.id !== exclude) out.push(at, next);
    at = next;
  }
  return out;
}

/** Where layers begin and end. */
export function layerEdges(p: VideoProject, exclude?: string): number[] {
  const end = projectEnd(p);
  const out: number[] = [];
  for (const l of p.layers) {
    if (l.id === exclude) continue;
    const s = layerSpan(l, end);
    out.push(s.start, s.end);
  }
  return out;
}

/** Every moment worth snapping to: the playhead, 0, the end, and the edges of all items but `exclude` (a clip's or a layer's id). Sorted, without repeats. */
export function snapPoints(p: VideoProject, exclude: string | undefined, time: number): number[] {
  const all = [time, 0, projectEnd(p), ...mainEdges(p.clips, exclude), ...layerEdges(p, exclude)].filter((n) => Number.isFinite(n));
  return [...new Set(all)].sort((a, b) => a - b);
}

/** Snaps `t` to the nearest point within `thresholdPx` on screen. `hit` is the point snapped to, or null. */
export function snap(t: number, points: readonly number[], thresholdPx: number, zoom: number): { time: number; hit: number | null } {
  let best: number | null = null;
  let bestD = Infinity;
  for (const p of points) {
    const d = Math.abs(p - t) * zoom;
    if (d <= thresholdPx + 1e-9 && d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best === null ? { time: t, hit: null } : { time: best, hit: best };
}

/** Snaps a stretch by whichever of its two ends is closer to a point. Returns the shift to apply and the point hit. */
export function snapSpan(start: number, end: number, points: readonly number[], thresholdPx: number, zoom: number): { shift: number; hit: number | null } {
  const a = snap(start, points, thresholdPx, zoom);
  const b = snap(end, points, thresholdPx, zoom);
  if (a.hit === null && b.hit === null) return { shift: 0, hit: null };
  const da = a.hit === null ? Infinity : Math.abs(a.time - start);
  const db = b.hit === null ? Infinity : Math.abs(b.time - end);
  return da <= db ? { shift: a.time - start, hit: a.hit } : { shift: b.time - end, hit: b.hit };
}

// ---------- moving and trimming layers ----------

/** The layer moved so it starts at `start` (never before 0), keeping its length, optionally on another lane. */
export function moveLayer<L extends Layer>(l: L, start: number, track?: number, editEnd = 0): L {
  const s = layerSpan(l, editEnd);
  const len = s.end - s.start;
  const at = Math.max(0, start);
  return { ...l, start: at, end: at + len, ...(track === undefined ? {} : { track: Math.max(0, Math.round(track)) }) };
}

/** How many seconds of the source a layer can still show beyond its `in` point on the edit clock, or Infinity (text, pictures). */
function room(p: VideoProject, l: Layer): number {
  if (!isMedia(l) && !isAudio(l)) return Infinity;
  const src = sourceOf(p, l.srcId);
  if (!src || src.kind === 'image' || !(src.duration && src.duration > 0)) return Infinity;
  return Math.max(0, src.duration - l.in) / speedOf(l);
}

/**
 * Drags a layer's left edge to `newStart`. It stays put at the other end, is
 * never shorter than MIN_LAYER or before 0. A video or sound also moves its `in`
 * point (so the picture does not slide) and cannot be pulled out before the
 * start of its source.
 */
export function trimLayerStart<L extends Layer>(p: VideoProject, l: L, newStart: number): L {
  const end = l.end ?? projectEnd(p);
  const sp = speedOf(l);
  let start = Math.min(newStart, end - MIN_LAYER);
  start = Math.max(0, start);
  if ((isMedia(l) || isAudio(l)) && !isStill(p, l)) {
    // `in` may not go below 0: the start cannot move earlier than in/speed before the current start.
    start = Math.max(start, (l.start ?? 0) - l.in / sp);
    const moved = start - (l.start ?? 0);
    return { ...l, start, end, in: Math.max(0, l.in + moved * sp) };
  }
  return { ...l, start, end };
}

/** Drags a layer's right edge to `newEnd`: at least MIN_LAYER long, and a video or sound no longer than its source. */
export function trimLayerEnd<L extends Layer>(p: VideoProject, l: L, newEnd: number): L {
  const start = l.start ?? 0;
  const cap = isStill(p, l) ? Infinity : room(p, l);
  const end = Math.min(Math.max(newEnd, start + MIN_LAYER), start + Math.max(cap, MIN_LAYER));
  return { ...l, start, end };
}

/** A media layer showing a picture has no source time to move. */
function isStill(p: VideoProject, l: Layer): boolean {
  return (isMedia(l) || isAudio(l)) && sourceOf(p, l.srcId)?.kind === 'image';
}

// ---------- lanes ----------

/** The highest lane in use, or -1 with no layers. */
export const topTrack = (p: VideoProject): number => p.layers.reduce((n, l) => Math.max(n, trackOf(l)), -1);

/**
 * Which lane a pointer is over. Lanes are stacked with the highest first;
 * `y` is measured from the top of the first lane row, `topLane` is the number of
 * the first row. Above the first row gives the top lane, below the last gives
 * lane 0 (the main track counts as below lane 0).
 */
export function laneAtY(y: number, rowHeight: number, topLane: number): number {
  const row = Math.floor(y / (rowHeight || 1));
  return Math.min(topLane, Math.max(0, topLane - row));
}

// ---------- the main track: reordering ----------

/** The gap (0..n) a clip dropped with its pointer at edit time `t` goes to: after every clip whose middle is before `t`. */
export function dropGap(clips: Clip[], t: number): number {
  let gap = 0;
  let at = 0;
  for (const c of clips) {
    const len = length(c);
    if (at + len / 2 < t) gap++;
    at += len;
  }
  return gap;
}

/** Where the dragged clip ends up in the list when it is dropped into `gap` (a gap counted on the list before the move). */
export const indexAfterDrop = (from: number, gap: number): number => (gap > from ? gap - 1 : gap);

/** Edit time of a gap, for drawing the insertion marker. */
export const gapTime = (clips: Clip[], gap: number): number => startOf(clips, Math.min(Math.max(gap, 0), clips.length));

// ---------- the ruler ----------

const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];

/** The spacing, in seconds, between labelled ticks: the smallest nice step that leaves at least `minPx` between labels. */
export function tickStep(zoom: number, minPx = 64): number {
  return STEPS.find((s) => s * zoom >= minPx) ?? STEPS[STEPS.length - 1]!;
}

export const clockLabel = (s: number, step = 1): string => {
  const sign = s < 0 ? '-' : '';
  const a = Math.abs(s);
  const m = Math.floor(a / 60);
  const sec = a - m * 60;
  const secText = step < 1 ? sec.toFixed(1).padStart(4, '0') : String(Math.floor(sec)).padStart(2, '0');
  return `${sign}${m}:${secText}`;
};

export interface Tick {
  t: number;
  major: boolean;
  label?: string;
}

/**
 * The ticks to draw over `width` pixels starting at `from` seconds: a labelled
 * tick every `tickStep`, and four unlabelled ones between.
 */
export function rulerTicks(zoom: number, width: number, from = 0): Tick[] {
  if (!(zoom > 0) || !(width > 0)) return [];
  const step = tickStep(zoom);
  const minor = step / 5;
  const last = from + width / zoom;
  const out: Tick[] = [];
  const first = Math.floor(from / minor);
  for (let i = first; i * minor <= last + 1e-9; i++) {
    const t = Math.round(i * minor * 1e6) / 1e6;
    if (t < 0) continue;
    const major = i % 5 === 0;
    out.push(major ? { t, major, label: clockLabel(t, step) } : { t, major });
  }
  return out;
}

/** The part of a source's peaks that an item plays, `from` to `to` source seconds of a source `duration` long. Whole when the duration is unknown; empty when nothing is in range. */
export function slicePeaks(peaks: Float32Array, from: number, to: number, duration: number): Float32Array {
  if (peaks.length === 0) return peaks;
  if (!(duration > 0)) return peaks;
  const n = peaks.length;
  const a = Math.max(0, Math.floor((from / duration) * n));
  if (a >= n || to <= from) return new Float32Array(0);
  const b = Math.min(n, Math.max(a + 1, Math.ceil((to / duration) * n)));
  return peaks.subarray(a, b);
}

/** The times, from the layer's start, to draw keyframe diamonds at: every property's keys, one per moment, kept inside the bar (0 to `len`). */
export function keyMarks(tracks: readonly Track[] | undefined, len: number): number[] {
  const out: number[] = [];
  for (const tr of tracks ?? []) {
    for (const k of tr.keys) {
      const t = Math.min(Math.max(k.t, 0), Math.max(len, 0));
      if (!out.some((x) => Math.abs(x - t) < EPS)) out.push(t);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Moves the keys at `from` (every property that has one there) to `to`, kept within 0 to `len`. */
export function moveKeysAt(tracks: readonly Track[], from: number, to: number, len: number): Track[] {
  const t = Math.min(Math.max(to, 0), Math.max(len, 0));
  return tracks.reduce<Track[]>((acc, tr) => moveKey(acc, tr.prop, from, t), [...tracks]);
}

/** m:ss.s, rounded to tenths first so 59.96 reads 1:00.0 and never 0:60.0. */
export function clockTenths(s: number): string {
  const tenths = Math.max(0, Math.round(s * 10));
  const m = Math.floor(tenths / 600);
  const sec = (tenths % 600) / 10;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

/** The value that occurs most; the first of a tie. */
export function mostCommon<T>(items: readonly T[]): T | undefined {
  const count = new Map<T, number>();
  let best: T | undefined;
  for (const x of items) {
    const n = (count.get(x) ?? 0) + 1;
    count.set(x, n);
    if (best === undefined || n > (count.get(best) ?? 0)) best = x;
  }
  return best;
}
