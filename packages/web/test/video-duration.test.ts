import { describe, expect, it } from 'vitest';
import { resolveDuration } from '../src/video/duration.ts';

/** A video whose real length is only learned after it has been seeked past the end. */
function fakeVideo(initial: number, real: number) {
  const listeners = new Set<() => void>();
  const v = {
    duration: initial,
    currentTime: 0,
    addEventListener: (_: string, f: () => void) => void listeners.add(f),
    removeEventListener: (_: string, f: () => void) => void listeners.delete(f),
    seeks: [] as number[],
  };
  let time = 0;
  Object.defineProperty(v, 'currentTime', {
    get: () => time,
    set: (t: number) => {
      time = t;
      v.seeks.push(t);
      if (t > 1e100 && !Number.isFinite(v.duration)) {
        v.duration = real;
        [...listeners].forEach((f) => f());
      }
    },
  });
  return v;
}

describe('resolveDuration', () => {
  it('returns a known duration as it is, without seeking', async () => {
    const v = fakeVideo(12.5, 12.5);
    expect(await resolveDuration(v as never)).toBe(12.5);
    expect(v.seeks).toEqual([]);
  });
  it('finds the length of a video that reports Infinity, then returns to the start', async () => {
    const v = fakeVideo(Infinity, 6.02);
    expect(await resolveDuration(v as never)).toBe(6.02);
    expect(v.seeks.at(-1)).toBe(0);
    expect(v.seeks[0]).toBeGreaterThan(1e100);
  });
});
