import { newId } from '../editor/layers.ts';
import type { Transition } from './transitions.ts';

/**
 * An edit as a list of clips: each plays a stretch of the source video, one
 * after another. Cutting, trimming and reordering only change this list; the
 * video file is never touched. All times are seconds.
 */

export interface Clip {
  id: string;
  /** Where in the source video the clip starts and ends. */
  start: number;
  end: number;
  /** Which source file it plays. Missing only in edits saved before there could be several; `project.ts` fills it in. */
  srcId?: string;
  /** Playback speed, 1 = normal. Changes how long the clip is on the edit's clock (`length`). */
  speed?: number;
  /** 0 to 1; 1 when missing. */
  volume?: number;
  /** Seconds of fade at the start and end of the clip's sound (sound only: the picture is not faded). */
  fadeIn?: number;
  fadeOut?: number;
  /** How the picture fits the frame: whole picture with bars (contain, the default) or filling it (cover). */
  fit?: 'contain' | 'cover';
  opacity?: number;
  /**
   * A transition from the previous clip into this one, centred on the join (half before the cut, half after). It never
   * changes `length`, `startOf`, `total` or `locate`. Ignored on the first clip. See `transitions.ts`.
   */
  transitionIn?: Transition;
}

/** No clip is made shorter than this. */
export const MIN_CLIP = 0.2;

/** The first clip has no join before it, so it carries no transition. Used by every function that can change which clip is first. */
function tidy(clips: Clip[]): Clip[] {
  const first = clips[0];
  if (!first?.transitionIn) return clips;
  const { transitionIn: _dropped, ...rest } = first;
  return [rest, ...clips.slice(1)];
}

export const wholeVideo = (duration: number): Clip[] => [{ id: newId('c'), start: 0, end: duration }];

/** How fast a clip plays: 1 when `speed` is missing, and never zero or negative. */
export const speedOf = (c: { speed?: number }): number => (c.speed && c.speed > 0 ? c.speed : 1);

/** How long the clip lasts on the edit's clock: the stretch of source it plays, divided by its speed. */
export const length = (c: Clip): number => (c.end - c.start) / speedOf(c);
export const total = (clips: Clip[]): number => clips.reduce((n, c) => n + length(c), 0);

/** Where clip `index` begins on the edit's own clock. */
export const startOf = (clips: Clip[], index: number): number => clips.slice(0, index).reduce((n, c) => n + length(c), 0);

/** The clip playing at edit time `t`, and the matching time in the source. The very end belongs to the last clip. */
export function locate(clips: Clip[], t: number): { index: number; source: number } | null {
  if (clips.length === 0) return null;
  const clamped = Math.min(Math.max(t, 0), total(clips));
  let at = 0;
  for (let i = 0; i < clips.length; i++) {
    const len = length(clips[i]!);
    if (clamped < at + len || i === clips.length - 1) return { index: i, source: clips[i]!.start + Math.min(clamped - at, len) * speedOf(clips[i]!) };
    at += len;
  }
  return null;
}

/** Edit time of a moment in the source, or null when that moment was cut out. */
export function fromSource(clips: Clip[], source: number): number | null {
  let at = 0;
  for (const c of clips) {
    if (source >= c.start && source < c.end) return at + (source - c.start) / speedOf(c);
    at += length(c);
  }
  return null;
}

const withoutTransition = (c: Clip): Clip => {
  const { transitionIn: _t, ...rest } = c;
  return rest;
};

/** Splits the clip playing at edit time `t` in two. Nothing happens within MIN_CLIP of a clip's edge. */
export function splitAt(clips: Clip[], t: number): Clip[] {
  const loc = locate(clips, t);
  if (!loc) return clips;
  const c = clips[loc.index]!;
  if (loc.source - c.start < MIN_CLIP || c.end - loc.source < MIN_CLIP) return clips;
  return [...clips.slice(0, loc.index), { ...c, end: loc.source }, { ...withoutTransition(c), id: newId('c'), start: loc.source }, ...clips.slice(loc.index + 1)];
}

/** Changes where a clip starts and/or ends, within the source and never shorter than MIN_CLIP. */
export function trim(clips: Clip[], index: number, patch: { start?: number; end?: number }, duration: number): Clip[] {
  const c = clips[index];
  if (!c) return clips;
  let start = patch.start ?? c.start;
  let end = patch.end ?? c.end;
  start = Math.min(Math.max(start, 0), duration);
  end = Math.min(Math.max(end, 0), duration);
  if (patch.start !== undefined) start = Math.min(start, end - MIN_CLIP);
  else end = Math.max(end, start + MIN_CLIP);
  start = Math.max(0, start);
  end = Math.min(duration, Math.max(end, start + MIN_CLIP));
  return clips.map((x, i) => (i === index ? { ...x, start, end } : x));
}

export const removeClip = (clips: Clip[], index: number): Clip[] => (clips.length <= 1 ? clips : tidy(clips.filter((_, i) => i !== index)));

/** Puts a clip in at `index` (clamped to the list). */
export function insertClip(clips: Clip[], clip: Clip, index: number): Clip[] {
  const at = Math.min(Math.max(Math.round(index), 0), clips.length);
  return tidy([...clips.slice(0, at), clip, ...clips.slice(at)]);
}

/** Moves the clip with this id so it ends up at `index` of the result (clamped). */
export function moveClipTo(clips: Clip[], id: string, index: number): Clip[] {
  const from = clips.findIndex((c) => c.id === id);
  if (from < 0) return clips;
  return moveClip(clips, from, Math.min(Math.max(Math.round(index), 0), clips.length - 1));
}

/**
 * Trims one edge of a clip by `delta` seconds of EDIT time (a positive delta
 * moves the edge later on the clip's own timeline). The main track has no gaps,
 * so everything after it moves with it: that is the ripple. A clip at speed 2
 * moves twice as far in the source as on the edit clock.
 */
export function rippleTrim(clips: Clip[], index: number, edge: 'start' | 'end', delta: number, duration: number): Clip[] {
  const c = clips[index];
  if (!c) return clips;
  const d = delta * speedOf(c);
  return trim(clips, index, edge === 'start' ? { start: c.start + d } : { end: c.end + d }, duration);
}

export function moveClip(clips: Clip[], from: number, to: number): Clip[] {
  if (from === to || from < 0 || to < 0 || from >= clips.length || to >= clips.length) return clips;
  const next = [...clips];
  const [c] = next.splice(from, 1);
  next.splice(to, 0, c!);
  return tidy(next);
}

/**
 * Playback bookkeeping: given the clip being played and where the source video
 * is, say whether to carry on, jump to the next clip, or stop. Clips that were
 * cut from one video and sit side by side play straight through with no jump.
 */
export function advance(
  clips: Clip[],
  index: number,
  sourceTime: number,
  eps = 0.04,
): { index: number; seek?: number; ended: boolean } {
  const c = clips[index];
  if (!c) return { index, ended: true };
  if (sourceTime < c.end - eps) return { index, ended: false };
  const next = clips[index + 1];
  if (!next) return { index, ended: true };
  return Math.abs(next.start - c.end) < eps ? { index: index + 1, ended: false } : { index: index + 1, seek: next.start, ended: false };
}
