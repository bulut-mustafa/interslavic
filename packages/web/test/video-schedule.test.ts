import { describe, expect, it } from 'vitest';
import { emptyProject, type MediaLayer, type AudioLayer, type VideoProject } from '../src/video/project.ts';
import { DRIFT_LIMIT, activeItems, drift, gainAt, isDrifted, upcomingItems } from '../src/video/schedule.ts';

const media = (id: string, srcId: string, start: number, end: number, extra: Partial<MediaLayer> = {}): MediaLayer => ({
  id, kind: 'media', srcId, in: 0, start, end, track: 1, x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, blend: 'normal', ...extra,
});
const audio = (id: string, srcId: string, start: number, end: number, extra: Partial<AudioLayer> = {}): AudioLayer => ({
  id, kind: 'audio', srcId, in: 0, start, end, track: 2, ...extra,
});

const project = (over: Partial<VideoProject> = {}): VideoProject => ({
  ...emptyProject(),
  sources: [
    { id: 'v1', kind: 'video', name: 'one', duration: 60 },
    { id: 'v2', kind: 'video', name: 'two', duration: 60 },
    { id: 'im', kind: 'image', name: 'pic' },
    { id: 'au', kind: 'audio', name: 'song', duration: 100 },
  ],
  clips: [{ id: 'a', srcId: 'v1', start: 0, end: 10 }, { id: 'b', srcId: 'v2', start: 20, end: 25 }],
  ...over,
});

describe('gainAt', () => {
  it('is the volume in the middle, 1 when volume is missing', () => {
    expect(gainAt({ volume: 0.5 }, 5, 10)).toBe(0.5);
    expect(gainAt({}, 5, 10)).toBe(1);
  });
  it('ramps linearly in and out', () => {
    const f = { fadeIn: 2, fadeOut: 2 };
    expect(gainAt(f, 0, 10)).toBe(0);
    expect(gainAt(f, 1, 10)).toBeCloseTo(0.5);
    expect(gainAt(f, 5, 10)).toBe(1);
    expect(gainAt(f, 9, 10)).toBeCloseTo(0.5);
    expect(gainAt(f, 10, 10)).toBe(0);
  });
  it('takes the lower of overlapping fades and clamps to 0..1', () => {
    expect(gainAt({ fadeIn: 8, fadeOut: 8 }, 5, 10)).toBeCloseTo(0.625);
    expect(gainAt({ volume: 3 }, 1, 10)).toBe(1);
    expect(gainAt({ volume: -1 }, 1, 10)).toBe(0);
  });
});

describe('activeItems', () => {
  it('plays exactly one main clip at a boundary, the next one', () => {
    const items = activeItems(project(), 10);
    expect(items.map((i) => i.itemId)).toEqual(['b']);
    expect(items[0]).toMatchObject({ srcId: 'v2', role: 'main', kind: 'video', expectedSourceTime: 20, speed: 1 });
  });
  it('reports the source time inside a clip', () => {
    expect(activeItems(project(), 4)[0]).toMatchObject({ itemId: 'a', expectedSourceTime: 4 });
    expect(activeItems(project(), 12)[0]).toMatchObject({ itemId: 'b', expectedSourceTime: 22 });
  });
  it('keeps the last clip at the very end', () => {
    expect(activeItems(project(), 15).map((i) => i.itemId)).toEqual(['b']);
  });
  it('a speed 2 main clip is two source seconds per edit second', () => {
    const p = project({ clips: [{ id: 'a', srcId: 'v1', start: 0, end: 10, speed: 2 }] });
    const [it] = activeItems(p, 2);
    expect(it).toMatchObject({ speed: 2, expectedSourceTime: 4 });
  });
  it('a speed 0.5 layer starting at 3 with in=10 is at 10.5 one second later', () => {
    const p = project({ layers: [media('m', 'v2', 3, 9, { in: 10, speed: 0.5 })] });
    const m = activeItems(p, 4).find((i) => i.itemId === 'm')!;
    expect(m).toMatchObject({ role: 'layer', kind: 'video', speed: 0.5, expectedSourceTime: 10.5 });
  });
  it('includes layers on [start, end) only', () => {
    const p = project({ layers: [media('m', 'v2', 3, 6), audio('s', 'au', 5, 8)] });
    expect(activeItems(p, 2.9).map((i) => i.itemId)).toEqual(['a']);
    expect(activeItems(p, 3).map((i) => i.itemId)).toEqual(['a', 'm']);
    expect(activeItems(p, 5.5).map((i) => i.itemId)).toEqual(['a', 'm', 's']);
    expect(activeItems(p, 6).map((i) => i.itemId)).toEqual(['a', 's']);
    expect(activeItems(p, 8).map((i) => i.itemId)).toEqual(['a']);
  });
  it('uses the source kind: an image layer is an image, audio layers are audio', () => {
    const p = project({ layers: [media('m', 'im', 0, 5), audio('s', 'au', 0, 5, { in: 7 })] });
    const items = activeItems(p, 1);
    expect(items.find((i) => i.itemId === 'm')).toMatchObject({ kind: 'image', expectedSourceTime: 0 });
    expect(items.find((i) => i.itemId === 's')).toMatchObject({ kind: 'audio', expectedSourceTime: 8 });
  });
  it('skips text layers and items whose source is missing', () => {
    const text = { id: 't', text: 'x', x: 0, y: 0, maxWidth: 0, style: {}, start: 0, end: 9 } as unknown as VideoProject['layers'][number];
    const p = project({ layers: [text, media('gone', 'nope', 0, 9)] });
    expect(activeItems(p, 1).map((i) => i.itemId)).toEqual(['a']);
  });
  it('applies fades to the item volume at t', () => {
    const p = project({ layers: [audio('s', 'au', 2, 12, { volume: 0.8, fadeIn: 2 })] });
    expect(activeItems(p, 3).find((i) => i.itemId === 's')!.volume).toBeCloseTo(0.4);
    expect(activeItems(p, 6).find((i) => i.itemId === 's')!.volume).toBeCloseTo(0.8);
  });
  it('main clip fade out runs over the clip on the edit clock', () => {
    const p = project({ clips: [{ id: 'a', srcId: 'v1', start: 0, end: 10, fadeOut: 2 }] });
    expect(activeItems(p, 9)[0]!.volume).toBeCloseTo(0.5);
  });
  it('is empty for an empty project', () => {
    expect(activeItems(emptyProject(), 0)).toEqual([]);
  });
});

describe('upcomingItems', () => {
  it('lists the next main clip and layers that start within the lookahead, at their first frame', () => {
    const p = project({ layers: [media('m', 'v2', 8, 9, { in: 5 }), audio('s', 'au', 30, 31)] });
    const up = upcomingItems(p, 7, 5);
    expect(up.map((i) => i.itemId).sort()).toEqual(['b', 'm']);
    expect(up.find((i) => i.itemId === 'b')).toMatchObject({ expectedSourceTime: 20, role: 'main' });
    expect(up.find((i) => i.itemId === 'm')).toMatchObject({ expectedSourceTime: 5 });
  });
  it('does not list what is already active or beyond the window', () => {
    const p = project();
    expect(upcomingItems(p, 1, 2)).toEqual([]);
  });
});

describe('drift', () => {
  it('is the distance either way', () => {
    expect(drift(5, 5.1)).toBeCloseTo(0.1);
    expect(drift(5.3, 5)).toBeCloseTo(0.3);
  });
  it('only counts past the limit', () => {
    expect(isDrifted(5, 5 + DRIFT_LIMIT - 0.01)).toBe(false);
    expect(isDrifted(5, 5 + DRIFT_LIMIT + 0.01)).toBe(true);
  });
});

describe('transitions: both main clips are active across the cut', () => {
  const fade = { kind: 'fade' as const, duration: 2 };
  // a: edit 0..10 plays v1 0..10; b: edit 10..15 plays v2 20..25; the window is 9..11
  const withFade = () => project({ clips: [{ id: 'a', srcId: 'v1', start: 0, end: 10 }, { id: 'b', srcId: 'v2', start: 20, end: 25, transitionIn: fade }] });
  const main = (t: number) => activeItems(withFade(), t).filter((i) => i.role === 'main');

  it('is a single clip outside the window', () => {
    expect(main(8.9).map((i) => i.itemId)).toEqual(['a']);
    expect(main(11).map((i) => i.itemId)).toEqual(['b']);
  });
  it('before the cut: the outgoing clip plays normally, the incoming one plays ahead of its in-point', () => {
    const [a, b] = main(9.5);
    expect(a).toMatchObject({ itemId: 'a', expectedSourceTime: 9.5 });
    expect(b).toMatchObject({ itemId: 'b' });
    expect(b!.expectedSourceTime).toBeCloseTo(19.5, 9);
  });
  it('after the cut: the outgoing clip plays past its out-point, the incoming one is in its own range', () => {
    const [a, b] = main(10.5);
    expect(a!.expectedSourceTime).toBeCloseTo(10.5, 9);
    expect(b!.expectedSourceTime).toBeCloseTo(20.5, 9);
  });
  it('never asks for a time before 0 or after the file ends', () => {
    const p = withFade();
    p.clips[1] = { ...p.clips[1]!, start: 0.2 };
    expect(activeItems(p, 9.0).find((i) => i.itemId === 'b')!.expectedSourceTime).toBe(0);
    p.clips[0] = { ...p.clips[0]!, start: 55, end: 60 };
    p.clips[1] = { ...p.clips[1]!, start: 20, end: 25 };
    // a is 5 s long so the cut is at 5; the window is 4..6, source duration 60
    expect(activeItems(p, 5.9).find((i) => i.itemId === 'a')!.expectedSourceTime).toBe(60);
  });
  it('marks a time held at a file edge as pinned, and only then', () => {
    const p = withFade();
    p.clips[1] = { ...p.clips[1]!, start: 0.2 };
    const b = (t: number) => activeItems(p, t).find((i) => i.itemId === 'b')!;
    expect(b(9.0).pinned).toBe(true); // wants -0.8, held at 0
    expect(b(9.9).pinned).toBeFalsy(); // wants 0.1, inside the file
    p.clips[0] = { ...p.clips[0]!, start: 55, end: 60 };
    const a = (t: number) => activeItems(p, t).find((i) => i.itemId === 'a')!;
    expect(a(5.9).pinned).toBe(true); // wants past 60
    expect(a(4.5).pinned).toBeFalsy();
  });
  it('crossfades the sound with equal power: outgoing falls, incoming rises, starting from silence/full', () => {
    const at = (t: number) => ({ a: main(t)[0]!.volume, b: main(t)[1]!.volume });
    expect(at(9).a).toBeCloseTo(1, 9);
    expect(at(9).b).toBeCloseTo(0, 9);
    expect(at(10).a).toBeCloseTo(Math.SQRT1_2, 9);
    expect(at(10).b).toBeCloseTo(Math.SQRT1_2, 9);
    expect(at(10.99).a).toBeLessThan(0.05);
    expect(at(10.99).b).toBeGreaterThan(0.99);
  });
  it('the clips own volume still counts', () => {
    const p = withFade();
    p.clips[0] = { ...p.clips[0]!, volume: 0.5 };
    expect(activeItems(p, 9)[0]!.volume).toBeCloseTo(0.5, 9);
  });
  it('upcomingItems preloads the incoming clip when its window begins, not at the cut', () => {
    expect(upcomingItems(withFade(), 7, 3).map((i) => i.itemId)).toEqual(['b']);
    expect(upcomingItems(withFade(), 7, 1.5)).toEqual([]);
  });
});
