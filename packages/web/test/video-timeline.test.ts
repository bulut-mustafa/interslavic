import { describe, expect, it } from 'vitest';
import { MIN_CLIP, advance, fromSource, length, locate, moveClip, removeClip, splitAt, startOf, total, trim, wholeVideo, type Clip } from '../src/video/timeline.ts';

const c = (id: string, start: number, end: number): Clip => ({ id, start, end });
const abc = [c('a', 0, 10), c('b', 20, 25), c('c', 40, 50)]; // 10 s + 5 s + 10 s = 25 s

describe('lengths', () => {
  it('adds the clips up and finds where each begins', () => {
    expect(total(abc)).toBe(25);
    expect([0, 1, 2].map((i) => startOf(abc, i))).toEqual([0, 10, 15]);
    expect(length(abc[1]!)).toBe(5);
  });
  it('starts as the whole video', () => {
    const [w] = wholeVideo(42);
    expect(w).toMatchObject({ start: 0, end: 42 });
  });
});

describe('locate', () => {
  it('finds the clip and the matching time in the source', () => {
    expect(locate(abc, 3)).toEqual({ index: 0, source: 3 });
    expect(locate(abc, 12)).toEqual({ index: 1, source: 22 });
    expect(locate(abc, 15)).toEqual({ index: 2, source: 40 });
  });
  it('gives the start of the next clip at a boundary, and the end of the last clip at the end', () => {
    expect(locate(abc, 10)).toEqual({ index: 1, source: 20 });
    expect(locate(abc, 25)).toEqual({ index: 2, source: 50 });
  });
  it('keeps a time outside the edit within it', () => {
    expect(locate(abc, -5)).toEqual({ index: 0, source: 0 });
    expect(locate(abc, 99)).toEqual({ index: 2, source: 50 });
  });
  it('has nothing to find in an empty edit', () => {
    expect(locate([], 1)).toBeNull();
  });
});

describe('fromSource', () => {
  it('maps a moment of the source onto the edit', () => {
    expect(fromSource(abc, 5)).toBe(5);
    expect(fromSource(abc, 22)).toBe(12);
    expect(fromSource(abc, 45)).toBe(20);
  });
  it('is null for a moment that was cut out', () => {
    expect(fromSource(abc, 15)).toBeNull();
    expect(fromSource(abc, 60)).toBeNull();
  });
  it('follows a reordered edit', () => {
    expect(fromSource([c('b', 20, 25), c('a', 0, 10)], 3)).toBe(8);
  });
});

describe('splitAt', () => {
  it('splits the clip at the playhead into two that play the same stretch', () => {
    const out = splitAt([c('a', 0, 10)], 4);
    expect(out.map((x) => [x.start, x.end])).toEqual([[0, 4], [4, 10]]);
    expect(total(out)).toBe(10);
    expect(out[0]!.id).not.toBe(out[1]!.id);
  });
  it('splits inside a later clip using source times', () => {
    const out = splitAt(abc, 12);
    expect(out.map((x) => [x.start, x.end])).toEqual([[0, 10], [20, 22], [22, 25], [40, 50]]);
  });
  it('does nothing too close to an edge', () => {
    expect(splitAt([c('a', 0, 10)], 0.1)).toEqual([c('a', 0, 10)]);
    expect(splitAt([c('a', 0, 10)], 9.9)).toEqual([c('a', 0, 10)]);
    expect(splitAt([c('a', 0, 10)], MIN_CLIP / 2)).toHaveLength(1);
  });
});

describe('trim', () => {
  it('moves a clip\'s start or end within the source', () => {
    expect(trim(abc, 0, { start: 2 }, 60)[0]).toMatchObject({ start: 2, end: 10 });
    expect(trim(abc, 0, { end: 7 }, 60)[0]).toMatchObject({ start: 0, end: 7 });
  });
  it('can reach back into material an earlier trim removed', () => {
    expect(trim([c('a', 5, 10)], 0, { start: 1 }, 60)[0]).toMatchObject({ start: 1, end: 10 });
  });
  it('stays within the video', () => {
    expect(trim(abc, 2, { end: 999 }, 60)[2]).toMatchObject({ end: 60 });
    expect(trim(abc, 0, { start: -4 }, 60)[0]).toMatchObject({ start: 0 });
  });
  it('never makes a clip shorter than the minimum', () => {
    const a = trim([c('a', 0, 10)], 0, { start: 9.99 }, 60)[0]!;
    expect(length(a)).toBeGreaterThanOrEqual(MIN_CLIP - 1e-9);
    const b = trim([c('a', 0, 10)], 0, { end: 0.01 }, 60)[0]!;
    expect(length(b)).toBeGreaterThanOrEqual(MIN_CLIP - 1e-9);
  });
  it('leaves other clips alone, and a missing clip as it is', () => {
    expect(trim(abc, 0, { end: 5 }, 60)[1]).toBe(abc[1]);
    expect(trim(abc, 9, { end: 5 }, 60)).toBe(abc);
  });
});

describe('removeClip and moveClip', () => {
  it('removes a clip but never the last one', () => {
    expect(removeClip(abc, 1).map((x) => x.id)).toEqual(['a', 'c']);
    expect(removeClip([c('a', 0, 1)], 0)).toHaveLength(1);
  });
  it('moves a clip to another place', () => {
    expect(moveClip(abc, 0, 2).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(moveClip(abc, 2, 0).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
  it('ignores a move to nowhere', () => {
    expect(moveClip(abc, 0, 0)).toBe(abc);
    expect(moveClip(abc, 0, 7)).toBe(abc);
    expect(moveClip(abc, -1, 1)).toBe(abc);
  });
  it('does not change the list it was given', () => {
    const before = abc.map((x) => x.id);
    moveClip(abc, 0, 2);
    removeClip(abc, 0);
    expect(abc.map((x) => x.id)).toEqual(before);
  });
});

describe('advance', () => {
  it('carries on while the clip has time left', () => {
    expect(advance(abc, 0, 5)).toEqual({ index: 0, ended: false });
  });
  it('jumps to the next clip when the current one ends, if it is not next in the source', () => {
    expect(advance(abc, 0, 9.99)).toEqual({ index: 1, seek: 20, ended: false });
  });
  it('carries straight on into a clip that follows in the source', () => {
    const split = splitAt([c('a', 0, 10)], 4);
    expect(advance(split, 0, 3.99)).toEqual({ index: 1, ended: false });
  });
  it('stops at the end of the last clip', () => {
    expect(advance(abc, 2, 49.99)).toEqual({ index: 2, ended: true });
  });
  it('stops when there is no clip', () => {
    expect(advance([], 0, 0).ended).toBe(true);
  });
});

import { insertClip, moveClipTo, rippleTrim } from '../src/video/timeline.ts';

describe('speed', () => {
  const fast = { id: 'f', start: 0, end: 10, speed: 2 }; // 5 s on the edit clock
  const slow = { id: 's', start: 20, end: 25, speed: 0.5 }; // 10 s
  it('lengths follow the speed', () => {
    expect(length(fast)).toBe(5);
    expect(length(slow)).toBe(10);
    expect(total([fast, slow])).toBe(15);
    expect(startOf([fast, slow], 1)).toBe(5);
  });
  it('a bad speed counts as 1', () => {
    expect(length({ id: 'x', start: 0, end: 4, speed: 0 })).toBe(4);
    expect(length({ id: 'x', start: 0, end: 4, speed: -2 })).toBe(4);
  });
  it('locate maps edit time to source time through the speed', () => {
    expect(locate([fast, slow], 2)).toEqual({ index: 0, source: 4 });
    expect(locate([fast, slow], 10)).toEqual({ index: 1, source: 20 + 5 * 0.5 });
    expect(locate([fast, slow], 15)).toEqual({ index: 1, source: 25 });
  });
  it('fromSource is the inverse', () => {
    expect(fromSource([fast, slow], 4)).toBe(2);
    expect(fromSource([fast, slow], 22)).toBe(5 + 4);
  });
  it('splitAt keeps the speed on both halves', () => {
    const out = splitAt([fast], 2); // source 4
    expect(out.map((x) => [x.start, x.end, x.speed])).toEqual([[0, 4, 2], [4, 10, 2]]);
    expect(total(out)).toBe(5);
  });
  it('rippleTrim moves the source twice as far at speed 2', () => {
    const out = rippleTrim([fast, slow], 0, 'end', -1, 100); // 1 edit second = 2 source seconds
    expect(out[0]).toMatchObject({ start: 0, end: 8 });
    expect(total(out)).toBe(4 + 10);
    const head = rippleTrim([fast], 0, 'start', 1, 100);
    expect(head[0]).toMatchObject({ start: 2, end: 10 });
  });
  it('rippleTrim stays inside the source and above MIN_CLIP', () => {
    expect(rippleTrim([fast], 0, 'end', 99, 12)[0]!.end).toBe(12);
    expect(rippleTrim([fast], 0, 'start', -99, 12)[0]!.start).toBe(0);
    const tiny = rippleTrim([c('a', 0, 10)], 0, 'end', -99, 10)[0]!;
    expect(tiny.end - tiny.start).toBeCloseTo(MIN_CLIP);
  });
});

describe('insertClip and moveClipTo', () => {
  it('inserts at an index, clamped', () => {
    const x = c('x', 0, 1);
    expect(insertClip(abc, x, 1).map((k) => k.id)).toEqual(['a', 'x', 'b', 'c']);
    expect(insertClip(abc, x, 99).map((k) => k.id)).toEqual(['a', 'b', 'c', 'x']);
    expect(insertClip(abc, x, -4).map((k) => k.id)).toEqual(['x', 'a', 'b', 'c']);
  });
  it('moves by id to the final position', () => {
    expect(moveClipTo(abc, 'a', 2).map((k) => k.id)).toEqual(['b', 'c', 'a']);
    expect(moveClipTo(abc, 'c', 0).map((k) => k.id)).toEqual(['c', 'a', 'b']);
    expect(moveClipTo(abc, 'c', 99).map((k) => k.id)).toEqual(['a', 'b', 'c']);
    expect(moveClipTo(abc, 'nope', 0)).toBe(abc);
  });
});

describe('transitions on the main track (centred on the cut, clips never move)', () => {
  const fade = { kind: 'fade' as const, duration: 1 };
  const three = (): Clip[] => [
    { id: 'a', start: 0, end: 10 },
    { id: 'b', start: 0, end: 6, transitionIn: fade },
    { id: 'c', start: 0, end: 4, transitionIn: fade },
  ];
  it('does not change lengths, starts, total or locate', () => {
    const c = three();
    const plain = c.map(({ transitionIn: _t, ...rest }) => rest);
    expect(total(c)).toBe(total(plain));
    expect([0, 1, 2].map((i) => startOf(c, i))).toEqual([0, 10, 16]);
    for (const t of [0, 9.7, 10, 10.3, 16, 20]) expect(locate(c, t)).toEqual(locate(plain, t));
  });
  it('a split keeps the transition on the first half only', () => {
    const out = splitAt(three(), 13);
    expect(out.map((k) => !!k.transitionIn)).toEqual([false, true, false, true]);
  });
  it('removing or moving a clip to the front drops the transition it would have before the first clip', () => {
    expect(removeClip(three(), 0)[0]!.transitionIn).toBeUndefined();
    expect(moveClip(three(), 1, 0)[0]!.transitionIn).toBeUndefined();
    expect(moveClipTo(three(), 'c', 0)[0]!.transitionIn).toBeUndefined();
    expect(insertClip(three(), { id: 'n', start: 0, end: 3, transitionIn: fade }, 0)[0]!.transitionIn).toBeUndefined();
  });
  it('removing a middle clip keeps the later clip transition (it now follows the earlier one)', () => {
    expect(removeClip(three(), 1)[1]!.transitionIn).toEqual(fade);
  });
  it('trim and advance ignore transitions', () => {
    const c = three();
    expect(trim(c, 1, { end: 3 }, 60)[1]!.transitionIn).toEqual(fade);
    expect(advance(c, 0, 10).index).toBe(1);
  });
});
