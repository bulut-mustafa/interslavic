import type { Clip } from './timeline.ts';
import { length, startOf, total, locate } from './timeline.ts';
import { transitionAt, windowStart } from './transitions.ts';
import { isAudio, isMedia, sourceOf, type VideoProject } from './project.ts';

/**
 * What should be playing at a moment of the edit. Pure: it reads the project
 * and says which items are active and where each one's file should be, so the
 * transport only has to make the elements agree.
 */

/**
 * How far an element's `currentTime` may stray from where the edit says it
 * should be before the transport seeks it. A seek stalls and re-buffers the
 * element, so correcting every frame would stutter; 0.15 s is the lead's
 * starting value (about four frames at 30 fps) and is not measured yet - see
 * docs/ideas/video-research-transport.md.
 */
export const DRIFT_LIMIT = 0.15;

export interface ScheduledItem {
  /** A main clip's id or a layer's id. One element per item. */
  itemId: string;
  srcId: string;
  kind: 'video' | 'image' | 'audio';
  /** Where in the source file the item should be at this moment, seconds. */
  expectedSourceTime: number;
  speed: number;
  /** 0..1, fades already applied. */
  volume: number;
  role: 'main' | 'layer';
  /**
   * The wanted time lay outside the file (a transition reaching before the in-point of a clip that starts near 0, or past
   * the end of a file) and `expectedSourceTime` is held at 0 or at the file's duration. The transport keeps such an
   * element paused on that frame instead of playing it and re-seeking it.
   */
  pinned?: boolean;
}

/** Volume with fades at `local` seconds into an item that is `duration` seconds long on the edit clock. */
export function gainAt(item: { volume?: number; fadeIn?: number; fadeOut?: number }, local: number, duration: number): number {
  const v = Math.min(Math.max(item.volume ?? 1, 0), 1);
  let f = 1;
  if (item.fadeIn && item.fadeIn > 0) f = Math.min(f, local / item.fadeIn);
  if (item.fadeOut && item.fadeOut > 0) f = Math.min(f, (duration - local) / item.fadeOut);
  return v * Math.min(Math.max(f, 0), 1);
}

export const drift = (current: number, expected: number): number => Math.abs(current - expected);
export const isDrifted = (current: number, expected: number): boolean => drift(current, expected) > DRIFT_LIMIT;

const rateOf = (s: number | undefined): number => (s && s > 0 ? s : 1);

/**
 * `weight` is the crossfade share of the sound (1 outside a transition). `overshoot` lets the time leave the clip's own
 * range - before its in-point or past its out-point - which a transition needs; it is still kept inside the file.
 */
function mainItem(p: VideoProject, clip: Clip, index: number, t: number, weight = 1, overshoot = false): ScheduledItem | null {
  const src = sourceOf(p, clip.srcId);
  if (!src || !clip.srcId) return null;
  const speed = rateOf(clip.speed);
  const local = overshoot ? t - startOf(p.clips, index) : Math.max(t - startOf(p.clips, index), 0);
  const dur = length(clip);
  const raw = clip.start + local * speed;
  const fileEnd = src.duration ?? Infinity;
  const pinned = overshoot && src.kind !== 'image' && (raw < 0 || raw > fileEnd);
  return {
    itemId: clip.id,
    srcId: clip.srcId,
    kind: src.kind,
    expectedSourceTime: src.kind === 'image' ? 0 : overshoot ? Math.min(Math.max(raw, 0), fileEnd) : Math.min(raw, clip.end),
    speed,
    volume: gainAt(clip, local, dur) * weight,
    role: 'main',
    ...(pinned ? { pinned: true } : {}),
  };
}

function layerItem(p: VideoProject, l: VideoProject['layers'][number], t: number): ScheduledItem | null {
  if (!isMedia(l) && !isAudio(l)) return null;
  const src = sourceOf(p, l.srcId);
  if (!src) return null;
  const speed = rateOf(l.speed);
  const local = Math.max(t - l.start, 0);
  return {
    itemId: l.id,
    srcId: l.srcId,
    kind: src.kind,
    expectedSourceTime: src.kind === 'image' ? 0 : l.in + local * speed,
    speed,
    volume: gainAt(l, local, l.end - l.start),
    role: 'layer',
  };
}

/** Everything that must be playing at edit time `t`: one main clip (two across a transition) and every media/audio layer whose [start, end) holds `t`. */
export function activeItems(p: VideoProject, t: number): ScheduledItem[] {
  const out: ScheduledItem[] = [];
  const tr = transitionAt(p.clips, t);
  const loc = locate(p.clips, t);
  if (tr) {
    // Across a join both clips play and the sound crossfades with equal power (cos/sin of the progress; my choice, so the loudness stays level).
    const turn = (tr.progress * Math.PI) / 2;
    const from = mainItem(p, p.clips[tr.fromIndex]!, tr.fromIndex, t, Math.cos(turn), true);
    const to = mainItem(p, p.clips[tr.toIndex]!, tr.toIndex, t, Math.sin(turn), true);
    if (from) out.push(from);
    if (to) out.push(to);
  } else if (loc) {
    const item = mainItem(p, p.clips[loc.index]!, loc.index, Math.min(Math.max(t, 0), total(p.clips)));
    if (item) out.push(item);
  }
  for (const l of p.layers) {
    if (!(t >= l.start! && t < l.end!)) continue;
    const item = layerItem(p, l, t);
    if (item) out.push(item);
  }
  return out;
}

/** Items that begin within the next `lookahead` seconds (not yet active), at their first moment, for preloading. */
export function upcomingItems(p: VideoProject, t: number, lookahead: number): ScheduledItem[] {
  const out: ScheduledItem[] = [];
  const horizon = t + lookahead;
  p.clips.forEach((c, i) => {
    // A clip with a transition has to be playing from the start of the transition's window.
    const at = windowStart(p.clips, i);
    if (at > t && at <= horizon) {
      const item = mainItem(p, c, i, at, 1, at < startOf(p.clips, i));
      if (item) out.push(item);
    }
  });
  for (const l of p.layers) {
    if (l.start! > t && l.start! <= horizon) {
      const item = layerItem(p, l, l.start!);
      if (item) out.push(item);
    }
  }
  return out;
}
