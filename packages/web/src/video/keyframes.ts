/**
 * Keyframes: a value that changes over a layer's life. A track holds the keys
 * of one property; between two keys the value is interpolated with the easing
 * of the earlier key (as in CSS keyframes), before the first and after the
 * last it holds. Times are seconds from the layer's own start.
 *
 * Easing follows the CSS Easing spec (https://www.w3.org/TR/css-easing-1/):
 * cubic-bezier(x1, y1, x2, y2) with P0=(0,0), P3=(1,1) and x1, x2 in [0,1].
 */

export type EaseName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
export type Ease = EaseName | { bezier: [number, number, number, number] };

export interface Keyframe<T> {
  /** Seconds from the layer's start. */
  t: number;
  value: T;
  /** Shapes the segment from this key to the next. */
  ease: Ease;
}

// 'volume' is not read by anything that renders or schedules audio today (schedule.ts uses the unresolved layer),
// but KeyframePanel still lists it in its AnimProp-keyed tables, so it stays in the type until that panel drops it.
export type AnimProp = 'x' | 'y' | 'w' | 'h' | 'rotation' | 'opacity' | 'volume';

export interface Track {
  prop: AnimProp;
  keys: Keyframe<number>[];
}

export const ANIM_PROPS: readonly AnimProp[] = ['x', 'y', 'w', 'h', 'rotation', 'opacity', 'volume'];

/** Two keys closer than this (about half a frame at 60 fps) are the same key. */
export const EPS = 0.01;

const NAMED: Record<Exclude<EaseName, 'linear'>, [number, number, number, number]> = {
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** The CSS cubic-bezier easing function: input progress is x, output is y. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  x1 = clamp01(x1);
  x2 = clamp01(x2);
  const cx = (s: number) => 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s;
  const cy = (s: number) => 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s;
  const dx = (s: number) => 3 * (1 - s) * (1 - s) * x1 + 6 * (1 - s) * s * (x2 - x1) + 3 * s * s * (1 - x2);
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton's method from s = x, a few steps.
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = cx(s) - x;
      if (Math.abs(err) < 1e-7) return cy(s);
      const d = dx(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
      if (s < 0 || s > 1) break;
    }
    // Bisection: x(s) is monotonic for x1, x2 in [0,1].
    let lo = 0;
    let hi = 1;
    s = x;
    for (let i = 0; i < 60; i++) {
      const v = cx(s);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return cy(s);
  };
}

const cache = new Map<string, (x: number) => number>();

/** The easing function for a key's `ease`. */
export function ease(e: Ease): (x: number) => number {
  if (e === 'linear') return clamp01;
  const b = typeof e === 'string' ? NAMED[e] : e.bezier;
  const id = b.join(',');
  let f = cache.get(id);
  if (!f) {
    f = bezier(b[0], b[1], b[2], b[3]);
    cache.set(id, f);
  }
  return f;
}

/** Keys in time order; of two at the same time the later one wins. A copy, except that keys already strictly increasing (what setKey/moveKey keep) are returned as they are, read-only. */
function ordered(keys: readonly Keyframe<number>[]): readonly Keyframe<number>[] {
  let strict = true;
  for (let i = 1; i < keys.length; i++) {
    if (!(keys[i - 1]!.t < keys[i]!.t)) {
      strict = false; // also true for NaN
      break;
    }
  }
  if (strict) return keys;
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  const out: Keyframe<number>[] = [];
  for (const k of sorted) {
    if (out.length && out[out.length - 1]!.t === k.t) out[out.length - 1] = k;
    else out.push(k);
  }
  return out;
}

/** The property's value at `t`; `base` when there are no keys. */
export function valueAt(keys: readonly Keyframe<number>[], t: number, base: number): number {
  if (!keys.length) return base;
  const ks = ordered(keys);
  const first = ks[0]!;
  if (t <= first.t) return first.value;
  const last = ks[ks.length - 1]!;
  if (t >= last.t) return last.value;
  let i = 0;
  while (ks[i + 1]!.t <= t) i++;
  const a = ks[i]!;
  const b = ks[i + 1]!;
  const p = ease(a.ease)((t - a.t) / (b.t - a.t));
  return a.value + (b.value - a.value) * p;
}

/** Layers that can carry keyframe tracks. */
export interface Keyed {
  tracks?: Track[];
}

const defaultOf = (prop: AnimProp): number => (prop === 'opacity' || prop === 'volume' ? 1 : 0);

/** The layer with every animated property replaced by its value at `tLocal`. Same object when nothing is animated. */
export function resolve<L extends Keyed>(layer: L, tLocal: number): L {
  const tracks = layer.tracks;
  if (!tracks || !tracks.length) return layer;
  const out = { ...layer } as unknown as Record<string, unknown>;
  for (const tr of tracks) {
    const base = (layer as unknown as Record<string, unknown>)[tr.prop];
    out[tr.prop] = valueAt(tr.keys, tLocal, typeof base === 'number' ? base : defaultOf(tr.prop));
  }
  return out as L;
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < EPS;

/** Add a key, or replace the one within EPS of `t` (its easing is kept unless one is given). */
export function setKey(tracks: readonly Track[], prop: AnimProp, t: number, value: number, e?: Ease): Track[] {
  const cur = tracks.find((x) => x.prop === prop);
  const keys = cur ? cur.keys : [];
  const old = keys.find((k) => near(k.t, t));
  const key: Keyframe<number> = { t: old ? old.t : t, value, ease: e ?? old?.ease ?? 'linear' };
  const next = [...keys.filter((k) => k !== old), key].sort((a, b) => a.t - b.t);
  return cur ? tracks.map((x) => (x === cur ? { prop, keys: next } : x)) : [...tracks, { prop, keys: next }];
}

/** Remove the key within EPS of `t`; a track left empty goes too. */
export function removeKey(tracks: readonly Track[], prop: AnimProp, t: number): Track[] {
  const cur = tracks.find((x) => x.prop === prop);
  const hit = cur?.keys.find((k) => near(k.t, t));
  if (!cur || !hit) return [...tracks];
  const keys = cur.keys.filter((k) => k !== hit);
  return keys.length ? tracks.map((x) => (x === cur ? { prop, keys } : x)) : tracks.filter((x) => x !== cur);
}

/** Move the key at `from` to `to` (not before 0); a key already there is replaced. */
export function moveKey(tracks: readonly Track[], prop: AnimProp, from: number, to: number): Track[] {
  const cur = tracks.find((x) => x.prop === prop);
  const hit = cur?.keys.find((k) => near(k.t, from));
  if (!cur || !hit) return [...tracks];
  const t = Math.max(0, to);
  const keys = [...cur.keys.filter((k) => k !== hit && !near(k.t, t)), { ...hit, t }].sort((a, b) => a.t - b.t);
  return tracks.map((x) => (x === cur ? { prop, keys } : x));
}

export const hasKeyAt = (tracks: readonly Track[], prop: AnimProp, t: number): boolean =>
  !!tracks.find((x) => x.prop === prop)?.keys.some((k) => near(k.t, t));

/** Change the easing of the key at `t`. */
export function setEase(tracks: readonly Track[], prop: AnimProp, t: number, e: Ease): Track[] {
  return tracks.map((x) => (x.prop === prop ? { prop, keys: x.keys.map((k) => (near(k.t, t) ? { ...k, ease: e } : k)) } : x));
}

/** The key times just before and just after `t` (not counting a key at `t` itself). */
export function neighbours(tracks: readonly Track[], prop: AnimProp, t: number): { prev?: number; next?: number } {
  const keys = tracks.find((x) => x.prop === prop)?.keys ?? [];
  let prev: number | undefined;
  let next: number | undefined;
  for (const k of keys) {
    if (k.t < t - EPS && (prev === undefined || k.t > prev)) prev = k.t;
    if (k.t > t + EPS && (next === undefined || k.t < next)) next = k.t;
  }
  return { prev, next };
}

/**
 * Auto-keyframing: an edit to a layer field that already has a track becomes a
 * key at the playhead (so the animation is not lost); other fields pass
 * through as `rest` to be applied to the layer as usual.
 */
export function autoKey<P extends object>(tracks: readonly Track[], patch: P, tLocal: number): { tracks: Track[]; rest: Partial<P> } {
  let out = [...tracks];
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'number' && out.some((x) => x.prop === k)) out = setKey(out, k as AnimProp, tLocal, v);
    else rest[k] = v;
  }
  return { tracks: out, rest: rest as Partial<P> };
}
