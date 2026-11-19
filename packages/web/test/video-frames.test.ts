import { describe, expect, it } from 'vitest';
import { makeTileCache, usableDuration, clipTiles, frameCount, frameTimes, nearestFrame, type Frame } from '../src/video/frames.ts';

const frames: Frame[] = [0.5, 1.5, 2.5, 3.5].map((t) => ({ t, url: `f${t}` }));

describe('frameTimes', () => {
  it('takes the middle of each equal part', () => {
    expect(frameTimes(4, 4)).toEqual([0.5, 1.5, 2.5, 3.5]);
    expect(frameTimes(10, 2)).toEqual([2.5, 7.5]);
  });
  it('takes nothing from nothing', () => {
    expect(frameTimes(0, 5)).toEqual([]);
    expect(frameTimes(5, 0)).toEqual([]);
  });
});

describe('frameCount', () => {
  it('grows with the video, within limits', () => {
    expect(frameCount(6)).toBe(8);
    expect(frameCount(40)).toBe(20);
    expect(frameCount(3600)).toBe(30);
  });
});

describe('nearestFrame and clipTiles', () => {
  it('finds the picture nearest a moment', () => {
    expect(nearestFrame(frames, 1.9)?.url).toBe('f1.5');
    expect(nearestFrame([], 1)).toBeUndefined();
  });
  it('lays pictures along a clip from the part of the video it plays', () => {
    expect(clipTiles(frames, 2, 4, 2)).toEqual(['f2.5', 'f3.5']);
    expect(clipTiles(frames, 0, 4, 1)).toEqual(['f1.5']); // the middle, 2.0, is nearer 1.5 than 2.5 by the first match
  });
  it('shows nothing until there are pictures, or for a clip with no length', () => {
    expect(clipTiles([], 0, 4, 3)).toEqual([]);
    expect(clipTiles(frames, 2, 2, 3)).toEqual([]);
  });
});

import { grabStrip, stripPicture, stripTiles } from '../src/video/frames.ts';

describe('strips', () => {
  const strip = { srcId: 's', frames: [0.5, 1.5, 2.5, 3.5].map((time) => ({ time, url: `f${time}` })) };
  it('lays tiles from a strip like clipTiles does', () => {
    expect(stripTiles(strip, 2, 4, 2)).toEqual(['f2.5', 'f3.5']);
    expect(stripTiles(undefined, 0, 4, 2)).toEqual([]);
    expect(stripTiles({ srcId: 's', frames: [] }, 0, 4, 2)).toEqual([]);
  });
  it('picks the picture nearest a moment', () => {
    expect(stripPicture(strip, 3.4)).toBe('f3.5');
    expect(stripPicture(undefined, 1)).toBeUndefined();
  });
  it('takes no pictures of a sound', async () => {
    expect(await grabStrip('a', 'blob:x', 30, undefined, 'audio')).toEqual({ srcId: 'a', frames: [] });
  });
  it('gives an empty strip when a picture will not load', async () => {
    // jsdom never loads images, so the image path ends by error or timeout; make it fail at once.
    const real = globalThis.Image;
    globalThis.Image = class { onload?: () => void; onerror?: () => void; set src(_: string) { queueMicrotask(() => this.onerror?.()); } } as never;
    try {
      expect(await grabStrip('i', 'blob:x', 0, undefined, 'image')).toEqual({ srcId: 'i', frames: [] });
    } finally {
      globalThis.Image = real;
    }
  });
});

describe('usableDuration', () => {
  it('uses the one given, else the one the video reports, else 0', () => {
    expect(usableDuration(12, 99)).toBe(12);
    expect(usableDuration(0, 8)).toBe(8);
    expect(usableDuration(undefined, Infinity)).toBe(0);
    expect(usableDuration(NaN, NaN)).toBe(0);
  });
});

describe('makeTileCache', () => {
  const strip = { srcId: 's', frames: [{ time: 0.5, url: 'a' }, { time: 1.5, url: 'b' }] };
  it('gives the same array again for the same clip, strip, range and count', () => {
    const tiles = makeTileCache();
    const one = tiles('c', strip, 0, 2, 2);
    expect(one).toEqual(['a', 'b']);
    expect(tiles('c', strip, 0, 2, 2)).toBe(one);
  });
  it('works anew when the strip, range or count changes (a strip that arrives later)', () => {
    const tiles = makeTileCache();
    expect(tiles('c', undefined, 0, 2, 2)).toEqual([]);
    const one = tiles('c', strip, 0, 2, 2);
    expect(one).toEqual(['a', 'b']);
    expect(tiles('c', strip, 0, 2, 1)).not.toBe(one);
    expect(tiles('c', { ...strip }, 0, 2, 2)).not.toBe(one);
  });
});
