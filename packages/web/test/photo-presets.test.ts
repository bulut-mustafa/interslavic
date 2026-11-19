import { describe, expect, it } from 'vitest';
import { applyPreset, applyPresetPixels, PRESETS, presetAdjust } from '../src/photo/presets.ts';
import { isNeutralAdjust } from '../src/video/effects.ts';

const px = (r: number, g: number, b: number) => ({ data: new Uint8ClampedArray([r, g, b, 255]), width: 1, height: 1 }) as unknown as ImageData;
const FIELDS = ['brightness', 'contrast', 'saturation', 'hue', 'blur', 'temperature', 'tint', 'fade', 'sharpen', 'vignette'];

describe('presets', () => {
  it('has at least 12 distinct looks, each with only supported fields and non-neutral', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const p of PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(isNeutralAdjust(p.adjust)).toBe(false);
      for (const k of Object.keys(p.adjust)) expect(FIELDS).toContain(k);
    }
  });
  it('presetAdjust scales from neutral by the amount', () => {
    const full = presetAdjust('vivid', 1);
    expect(presetAdjust('vivid', 0)).toEqual({});
    const half = presetAdjust('vivid', 0.5);
    for (const [k, v] of Object.entries(full)) expect(half[k as 'contrast']).toBeCloseTo(v / 2, 5);
    expect(presetAdjust('nope', 1)).toEqual({});
  });
  it('clamps the amount to 0..1', () => {
    expect(presetAdjust('vivid', 3)).toEqual(presetAdjust('vivid', 1));
    expect(presetAdjust('vivid', -1)).toEqual({});
  });
  it('applyPreset adds the preset to the adjustment', () => {
    const a = applyPreset({ brightness: 10 }, 'vivid', 1);
    expect(a.brightness).toBe(10);
    expect(a.saturation).toBe(presetAdjust('vivid', 1).saturation);
  });
  it('Mono is exactly saturation -100: equal channels on a colour', () => {
    const img = px(200, 80, 40);
    applyPresetPixels(img, 'mono', 1);
    expect(Math.abs(img.data[0]! - img.data[1]!)).toBeLessThanOrEqual(1);
    expect(Math.abs(img.data[1]! - img.data[2]!)).toBeLessThanOrEqual(1);
  });
  it('Warm raises red over blue; Cool does the opposite', () => {
    const w = px(128, 128, 128);
    applyPresetPixels(w, 'warm', 1);
    expect(w.data[0]!).toBeGreaterThan(w.data[2]!);
    const c = px(128, 128, 128);
    applyPresetPixels(c, 'cool', 1);
    expect(c.data[2]!).toBeGreaterThan(c.data[0]!);
  });
  it('amount 0 leaves pixels alone', () => {
    const img = px(10, 20, 30);
    applyPresetPixels(img, 'noir', 0);
    expect([...img.data]).toEqual([10, 20, 30, 255]);
  });
});
