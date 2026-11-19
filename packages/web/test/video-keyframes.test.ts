import { describe, expect, it } from 'vitest';
import { bezier, ease, hasKeyAt, moveKey, removeKey, resolve, setKey, valueAt, autoKey, neighbours, setEase, type Keyframe, type Track } from '../src/video/keyframes.ts';

const k = (t: number, value: number, e: Keyframe<number>['ease'] = 'linear'): Keyframe<number> => ({ t, value, ease: e });

describe('cubic-bezier (CSS Easing Level 1)', () => {
  it('has fixed ends and is the identity for (1/3,1/3,2/3,2/3)', () => {
    expect(bezier(0.42, 0, 0.58, 1)(0)).toBe(0);
    expect(bezier(0.42, 0, 0.58, 1)(1)).toBe(1);
    const lin = bezier(1 / 3, 1 / 3, 2 / 3, 2 / 3);
    for (const x of [0.1, 0.37, 0.5, 0.9]) expect(lin(x)).toBeCloseTo(x, 5);
  });
  it('ease-in-out is symmetric around 0.5 and ease-in is slow at the start', () => {
    const io = bezier(0.42, 0, 0.58, 1);
    expect(io(0.5)).toBeCloseTo(0.5, 5);
    expect(io(0.25) + io(0.75)).toBeCloseTo(1, 5);
    expect(bezier(0.42, 0, 1, 1)(0.5)).toBeLessThan(0.5);
    expect(bezier(0, 0, 0.58, 1)(0.5)).toBeGreaterThan(0.5);
  });
  it('matches a known value of the CSS "ease" curve', () => {
    // cubic-bezier(0.25, 0.1, 0.25, 1) at x = 0.5 is about 0.8024 (browser reference value)
    expect(bezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
  });
  it('clamps x outside 0..1 and x control points into 0..1', () => {
    const f = bezier(0.42, 0, 0.58, 1);
    expect(f(-1)).toBe(0);
    expect(f(2)).toBe(1);
    expect(Number.isFinite(bezier(5, 0, -3, 1)(0.5))).toBe(true);
  });
  it('steep curves (bisection fallback) still land on x', () => {
    const f = bezier(0, 1, 1, 0); // flat-steep-flat
    expect(f(0.5)).toBeCloseTo(0.5, 4);
    expect(f(0.1)).toBeGreaterThan(0.2);
  });
  it('overshoot curves may leave 0..1', () => {
    expect(bezier(0.3, 1.8, 0.7, 1)(0.4)).toBeGreaterThan(1);
  });
  it('named eases', () => {
    expect(ease('linear')(0.3)).toBe(0.3);
    expect(ease('easeIn')(0.5)).toBeLessThan(0.5);
    expect(ease('easeOut')(0.5)).toBeGreaterThan(0.5);
    expect(ease('easeInOut')(0.5)).toBeCloseTo(0.5, 5);
    expect(ease({ bezier: [0.25, 0.1, 0.25, 1] })(0.5)).toBeCloseTo(0.8024, 3);
  });
});

describe('valueAt', () => {
  it('uses the base when there are no keys', () => expect(valueAt([], 3, 7)).toBe(7));
  it('holds before the first and after the last', () => {
    const keys = [k(1, 10), k(3, 30)];
    expect(valueAt(keys, 0, 0)).toBe(10);
    expect(valueAt(keys, 9, 0)).toBe(30);
  });
  it('interpolates linearly', () => expect(valueAt([k(0, 0), k(2, 100)], 0.5, 0)).toBeCloseTo(25));
  it('eases per segment using the earlier key', () => {
    expect(valueAt([k(0, 0, 'easeIn'), k(2, 100)], 1, 0)).toBeLessThan(50);
    expect(valueAt([k(0, 0, 'easeOut'), k(2, 100)], 1, 0)).toBeGreaterThan(50);
  });
  it('is safe with unsorted and duplicate keys (later duplicate wins)', () => {
    const keys = [k(2, 100), k(0, 0), k(2, 200)];
    expect(valueAt(keys, 1, 0)).toBeCloseTo(100);
    expect(valueAt(keys, 5, 0)).toBe(200);
  });
  it('does not mutate its input', () => {
    const keys = [k(2, 1), k(0, 0)];
    valueAt(keys, 1, 0);
    expect(keys[0]!.t).toBe(2);
  });
});

describe('track edits', () => {
  it('setKey adds, keeps order, and replaces within the epsilon', () => {
    let t: Track[] = [];
    t = setKey(t, 'x', 2, 20);
    t = setKey(t, 'x', 1, 10);
    expect(t[0]!.keys.map((q) => q.t)).toEqual([1, 2]);
    t = setKey(t, 'x', 2.004, 25);
    expect(t[0]!.keys).toHaveLength(2);
    expect(t[0]!.keys[1]!.value).toBe(25);
  });
  it('setKey keeps the easing of a replaced key unless one is given', () => {
    let t = setKey([], 'x', 1, 1, 'easeIn');
    t = setKey(t, 'x', 1, 2);
    expect(t[0]!.keys[0]!.ease).toBe('easeIn');
    t = setKey(t, 'x', 1, 2, 'easeOut');
    expect(t[0]!.keys[0]!.ease).toBe('easeOut');
  });
  it('is immutable', () => {
    const a: Track[] = [];
    setKey(a, 'x', 0, 1);
    expect(a).toEqual([]);
  });
  it('removeKey drops the key and an emptied track', () => {
    let t = setKey(setKey([], 'x', 0, 1), 'y', 0, 1);
    t = removeKey(t, 'x', 0.003);
    expect(t.map((q) => q.prop)).toEqual(['y']);
    expect(removeKey(t, 'y', 5)).toEqual(t);
  });
  it('moveKey moves a key and replaces one it lands on', () => {
    let t = setKey(setKey(setKey([], 'x', 0, 0), 'x', 1, 1), 'x', 2, 2);
    t = moveKey(t, 'x', 0, 2);
    expect(t[0]!.keys.map((q) => [q.t, q.value])).toEqual([[1, 1], [2, 0]]);
    expect(moveKey(t, 'x', 9, 3)).toEqual(t);
    expect(moveKey(t, 'x', 1, -4)[0]!.keys[0]!.t).toBe(0);
  });
  it('hasKeyAt and neighbours', () => {
    const t = setKey(setKey([], 'x', 1, 1), 'x', 3, 3);
    expect(hasKeyAt(t, 'x', 1.005)).toBe(true);
    expect(hasKeyAt(t, 'x', 2)).toBe(false);
    expect(hasKeyAt(t, 'y', 1)).toBe(false);
    expect(neighbours(t, 'x', 2)).toEqual({ prev: 1, next: 3 });
    expect(neighbours(t, 'x', 1)).toEqual({ prev: undefined, next: 3 });
    expect(neighbours(t, 'x', 3)).toEqual({ prev: 1, next: undefined });
    expect(neighbours([], 'x', 1)).toEqual({ prev: undefined, next: undefined });
  });
  it('setEase changes the key at t only', () => {
    const t = setEase(setKey([], 'x', 1, 1), 'x', 1, 'easeOut');
    expect(t[0]!.keys[0]!.ease).toBe('easeOut');
  });
});

describe('resolve', () => {
  const layer = { x: 0, y: 5, opacity: 1, tracks: [{ prop: 'x' as const, keys: [k(0, 0), k(2, 100)] }, { prop: 'opacity' as const, keys: [k(0, 1), k(1, 0)] }] };
  it('replaces animated props only', () => {
    const r = resolve(layer, 1);
    expect(r.x).toBeCloseTo(50);
    expect(r.opacity).toBe(0);
    expect(r.y).toBe(5);
    expect(layer.x).toBe(0);
  });
  it('returns the same object when there are no tracks', () => {
    const l = { x: 1 };
    expect(resolve(l as any, 3)).toBe(l);
  });
  it('uses 1 as the base of opacity and volume when the layer has none', () => {
    const l = { tracks: [{ prop: 'volume' as const, keys: [] }] };
    expect((resolve(l, 0) as any).volume).toBe(1);
  });
});

describe('autoKey', () => {
  it('keys the props that already have a track and passes the rest through', () => {
    const tracks = setKey([], 'x', 0, 0);
    const r = autoKey(tracks, { x: 40, y: 9 }, 2);
    expect(r.tracks[0]!.keys.map((q) => [q.t, q.value])).toEqual([[0, 0], [2, 40]]);
    expect(r.rest).toEqual({ y: 9 });
  });
  it('ignores non-animatable fields', () => {
    expect(autoKey([], { text: 'a' } as never, 1)).toEqual({ tracks: [], rest: { text: 'a' } });
  });
});

describe('valueAt ordering', () => {
  it('gives the same answer for sorted keys as for the same keys shuffled, and leaves the input alone', () => {
    const sorted = [k(0, 0), k(1, 10, 'easeIn'), k(2, 4)];
    const shuffled = [sorted[2]!, sorted[0]!, sorted[1]!];
    const copy = [...shuffled];
    for (const t of [-1, 0, 0.3, 1, 1.7, 2, 5]) expect(valueAt(shuffled, t, 0)).toBe(valueAt(sorted, t, 0));
    expect(shuffled).toEqual(copy);
  });
  it('of two keys at the same time the later one wins, sorted or not', () => {
    expect(valueAt([k(1, 5), k(1, 9)], 1, 0)).toBe(9);
    expect(valueAt([k(2, 1), k(1, 5), k(1, 9)], 1.5, 0)).toBeCloseTo(5);
  });
});
