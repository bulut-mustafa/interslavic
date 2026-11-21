import type { ProjectChange } from '../../video/contracts.ts';
import { isAudio, isMedia, isText, sourceOf, trackOf, type Layer, type VideoProject } from '../../video/project.ts';
import { layerSpan, projectEnd, mainEdges, layerEdges, moveLayer, trimLayerEnd, trimLayerStart, snap, snapSpan, snapPoints, dropGap, gapTime, indexAfterDrop } from '../../video/timeline-math.ts';
import { length as clipLength, moveClipTo, rippleTrim, startOf, total } from '../../video/timeline.ts';

/**
 * What is where on the phone timeline, which thing a finger lands on, and the
 * edit a drag makes. Pure: every position is in edit seconds or timeline
 * pixels, so it is tested without a screen. Moving and trimming reuse the
 * desktop timeline's own functions (`video/timeline-math.ts`), so a phone drag
 * and a desktop drag change a project the same way.
 */

export const RULER_H = 24;
/** Height of one lane row of overlays, text and sounds. */
export const ROW_H = 34;
/** Height of the main track. */
export const MAIN_H = 60;
/** At most this many lane rows show at once; more scroll with a vertical drag. */
export const MAX_ROWS = 3;
/** A press this close (px) to a clip join counts as the join's "+". */
export const JOINT_PX = 22;
/** The snapping distance on screen, px. */
export const SNAP_PX = 8;

export type Hit =
  | { kind: 'clip'; id: string; index: number }
  | { kind: 'layer'; id: string }
  | { kind: 'joint'; id: string }
  | { kind: 'add' }
  | { kind: 'empty' };

/** The lanes in use, highest first: one row each. */
export const lanesOf = (p: VideoProject): number[] => [...new Set(p.layers.map(trackOf))].sort((a, b) => b - a);

export interface Geometry {
  lanes: number[];
  /** Rows shown at once. */
  shown: number;
  /** Height of the rows area. */
  rowsH: number;
  mainTop: number;
  height: number;
  /** Most the rows can be scrolled vertically, px. */
  maxRowScroll: number;
}

export function geometryOf(p: VideoProject): Geometry {
  const lanes = lanesOf(p);
  const shown = Math.min(lanes.length, MAX_ROWS);
  const rowsH = shown * ROW_H;
  return { lanes, shown, rowsH, mainTop: RULER_H + rowsH, height: RULER_H + rowsH + MAIN_H, maxRowScroll: Math.max(0, (lanes.length - shown) * ROW_H) };
}

export const clampRowScroll = (px: number, g: Geometry): number => Math.min(g.maxRowScroll, Math.max(0, px));

/** The layers on a lane, back to front. */
export const layersOnLane = (p: VideoProject, lane: number): Layer[] => p.layers.filter((l) => trackOf(l) === lane);

/**
 * What is under a finger at timeline `y` (px from the top) and edit time `t`.
 * Joints win over clips (the "+" sits on the edge), a layer over empty space;
 * `zoom` turns pixel slack into seconds.
 */
export function hitAt(p: VideoProject, y: number, t: number, zoom: number, rowScroll = 0): Hit {
  const g = geometryOf(p);
  const end = projectEnd(p);
  if (y >= g.mainTop) {
    const mainEnd = total(p.clips);
    for (let i = 1; i < p.clips.length; i++) if (Math.abs(t - startOf(p.clips, i)) * zoom <= JOINT_PX) return { kind: 'joint', id: p.clips[i]!.id };
    if (t > mainEnd && (t - mainEnd) * zoom <= 64) return { kind: 'add' };
    let at = 0;
    for (let i = 0; i < p.clips.length; i++) {
      const next = at + clipLength(p.clips[i]!);
      if (t >= at && (t < next || (i === p.clips.length - 1 && t <= next))) return { kind: 'clip', id: p.clips[i]!.id, index: i };
      at = next;
    }
    return { kind: 'empty' };
  }
  if (y < RULER_H || y >= g.mainTop) return { kind: 'empty' };
  const row = Math.floor((y - RULER_H + clampRowScroll(rowScroll, g)) / ROW_H);
  const lane = g.lanes[row];
  if (lane === undefined) return { kind: 'empty' };
  const slack = 6 / (zoom || 1);
  const on = layersOnLane(p, lane).filter((l) => {
    const s = layerSpan(l, end);
    return t >= s.start - slack && t <= s.end + slack;
  });
  const top = on[on.length - 1];
  return top ? { kind: 'layer', id: top.id } : { kind: 'empty' };
}

export type Target = { kind: 'clip' | 'layer'; id: string };

/** The part of a drag the model needs: where it began and what it started from. */
export interface DragBase {
  target: Target;
  /** Timeline px (from time 0) where the finger went down. */
  x0: number;
  origin: VideoProject;
}

/**
 * The change made by dragging an edge of the picked bar to timeline px `x`
 * (px from time 0). A clip trim ripples what follows; a layer trim is limited
 * by its source. Snaps to the playhead and to other edges.
 */
export function trimDrag(d: DragBase, edge: 'start' | 'end', x: number, env: { zoom: number; time: number; snapping?: boolean }): { change: ProjectChange; guide: number | null } {
  const o = d.origin;
  const { zoom, time } = env;
  const snapping = env.snapping ?? true;
  const dt = (x - d.x0) / (zoom || 1);
  if (d.target.kind === 'layer') {
    const l = o.layers.find((v) => v.id === d.target.id);
    if (!l) return { change: { layers: o.layers }, guide: null };
    const span = layerSpan(l, projectEnd(o));
    const pts = snapPoints(o, l.id, time);
    const want = (edge === 'start' ? span.start : span.end) + dt;
    const s = snapping ? snap(want, pts, SNAP_PX, zoom) : { time: want, hit: null as number | null };
    const base = { ...l, start: span.start, end: span.end } as Layer;
    const next = edge === 'start' ? trimLayerStart(o, base, s.time) : trimLayerEnd(o, base, s.time);
    return { change: { layers: o.layers.map((v) => (v.id === l.id ? next : v)) }, guide: s.hit };
  }
  const i = o.clips.findIndex((c) => c.id === d.target.id);
  const c = o.clips[i];
  if (!c) return { change: { clips: o.clips }, guide: null };
  const at = startOf(o.clips, i);
  const len = clipLength(c);
  const newLen = edge === 'end' ? len + dt : len - dt;
  const pts = [time, ...layerEdges(o)];
  const s = snapping ? snap(at + newLen, pts, SNAP_PX, zoom) : { time: at + newLen, hit: null as number | null };
  const delta = edge === 'end' ? s.time - (at + len) : at + len - s.time;
  const duration = sourceOf(o, c.srcId)?.duration ?? Infinity;
  return { change: { clips: rippleTrim(o.clips, i, edge, delta, duration) }, guide: s.hit };
}

/**
 * Long-press then drag. A main clip moves to the gap the finger is over (the
 * list reorders; `marker` is where the insertion mark goes); a layer slides in
 * time (never to another lane: lanes are rows of the phone's layout, and
 * "Overlay" and "Text" already open a lane of their own).
 */
export function moveDrag(d: DragBase, x: number, env: { zoom: number; time: number; snapping?: boolean }): { change: ProjectChange; marker: number | null; guide: number | null } {
  const o = d.origin;
  const { zoom, time } = env;
  const snapping = env.snapping ?? true;
  if (d.target.kind === 'clip') {
    const i = o.clips.findIndex((c) => c.id === d.target.id);
    if (i < 0) return { change: { clips: o.clips }, marker: null, guide: null };
    const gap = dropGap(o.clips, x / (zoom || 1));
    return { change: { clips: moveClipTo(o.clips, d.target.id, indexAfterDrop(i, gap)) }, marker: gapTime(o.clips, gap), guide: null };
  }
  const l = o.layers.find((v) => v.id === d.target.id);
  if (!l) return { change: { layers: o.layers }, marker: null, guide: null };
  const end = projectEnd(o);
  const span = layerSpan(l, end);
  let start = span.start + (x - d.x0) / (zoom || 1);
  let guide: number | null = null;
  if (snapping) {
    const r = snapSpan(start, start + (span.end - span.start), snapPoints(o, l.id, time), SNAP_PX, zoom);
    start += r.shift;
    guide = r.hit;
  }
  const moved = moveLayer({ ...l, start: span.start, end: span.end } as Layer, start, undefined, end);
  return { change: { layers: o.layers.map((v) => (v.id === l.id ? moved : v)) }, marker: null, guide };
}

/** Where scrubbing sticks: the main track's joins, the ends, and the edges of layers. */
export const scrubPoints = (p: VideoProject): number[] => [...new Set([0, projectEnd(p), ...mainEdges(p.clips), ...layerEdges(p)])].sort((a, b) => a - b);

/** What kind of bar a layer is drawn as. */
export type BarKind = 'text' | 'picture' | 'video' | 'sound';
export function barKind(p: VideoProject, l: Layer): BarKind {
  if (isText(l)) return 'text';
  if (isAudio(l)) return 'sound';
  return sourceOf(p, l.srcId)?.kind === 'image' ? 'picture' : isMedia(l) ? 'video' : 'sound';
}
