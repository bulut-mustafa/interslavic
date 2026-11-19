import { describe, expect, it } from 'vitest';
import { autoEnhance, downscaleLuma } from '../src/photo/auto-enhance.ts';

/** A w*h image whose luma runs lo..hi left to right, with `chroma` between red and blue. */
function ramp(lo: number, hi: number, chroma = 60, w = 100, h = 10): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const L = lo + ((hi - lo) * x) / (w - 1);
      const i = (y * w + x) * 4;
      data[i] = L + chroma / 2;
      data[i + 1] = L;
      data[i + 2] = L - chroma / 2;
      data[i + 3] = 255;
    }
  return { data, width: w, height: h } as unknown as ImageData;
}

describe('autoEnhance', () => {
  it('lifts a dark picture', () => {
    const a = autoEnhance(ramp(10, 90));
    expect(a.brightness!).toBeGreaterThan(5);
    expect(a.contrast!).toBeGreaterThan(5);
  });
  it('darkens a bright picture', () => {
    const a = autoEnhance(ramp(170, 250));
    expect(a.brightness!).toBeLessThan(-5);
  });
  it('adds contrast to a flat picture', () => {
    const a = autoEnhance(ramp(100, 150));
    expect(a.contrast!).toBeGreaterThan(10);
  });
  it('leaves an already good picture about neutral', () => {
    const a = autoEnhance(ramp(5, 250));
    expect(Math.abs(a.brightness ?? 0)).toBeLessThanOrEqual(3);
    expect(Math.abs(a.contrast ?? 0)).toBeLessThanOrEqual(3);
    expect(Math.abs(a.saturation ?? 0)).toBeLessThanOrEqual(3);
  });
  it('boosts a washed-out colour a little, never a grey one', () => {
    expect(autoEnhance(ramp(5, 250, 12)).saturation!).toBeGreaterThan(5);
    expect(autoEnhance(ramp(5, 250, 0)).saturation ?? 0).toBe(0);
  });
  it('stays within +-40 on extremes', () => {
    for (const img of [ramp(0, 5), ramp(250, 255), ramp(128, 128, 2)]) {
      const a = autoEnhance(img);
      for (const v of Object.values(a)) expect(Math.abs(v)).toBeLessThanOrEqual(40);
    }
  });
  it('works on a downscaled copy: a huge picture is sampled to at most 256 per side', () => {
    const { w, h } = downscaleLuma(ramp(0, 255, 0, 2000, 4)).size;
    expect(Math.max(w, h)).toBeLessThanOrEqual(256);
  });
});
