import { describe, expect, it } from 'vitest';
import { SPEED_MAX, SPEED_MIN, SPEED_PRESETS, clampFades, clampSpeed, dBToGain, dbLabel, extractAudioLayer, fadeLimits, gainToDb, lengthAtSpeed, mixHeadroom, sliderToSpeed, speedLabel, speedToSlider } from '../src/video/audio.ts';
import { gainAt } from '../src/video/schedule.ts';

describe('speed', () => {
  it('presets sit inside the limits and include 1x', () => {
    expect(SPEED_PRESETS).toEqual([0.25, 0.5, 1, 1.5, 2, 3, 4]);
    expect(SPEED_MIN).toBe(0.25);
    expect(SPEED_MAX).toBe(4);
  });
  it('clamps to 0.25..4, rounds to 2 places, and repairs junk to 1', () => {
    expect(clampSpeed(0.1)).toBe(0.25);
    expect(clampSpeed(100)).toBe(4);
    expect(clampSpeed(1.234)).toBe(1.23);
    expect(clampSpeed(NaN)).toBe(1);
    expect(clampSpeed(-2)).toBe(0.25);
    expect(clampSpeed(undefined)).toBe(1);
  });
  it('labels', () => {
    expect(speedLabel(1)).toBe('1x');
    expect(speedLabel(1.5)).toBe('1.5x');
    expect(speedLabel(0.25)).toBe('0.25x');
    expect(speedLabel(1.2345)).toBe('1.23x');
  });
  it('length on the edit clock', () => {
    expect(lengthAtSpeed(10, 2)).toBe(5);
    expect(lengthAtSpeed(10, 0.5)).toBe(20);
    expect(lengthAtSpeed(10, 99)).toBe(2.5);
  });
  it('log slider round-trips', () => {
    expect(speedToSlider(1)).toBe(0);
    expect(speedToSlider(4)).toBeCloseTo(2);
    expect(speedToSlider(0.25)).toBeCloseTo(-2);
    expect(sliderToSpeed(1)).toBeCloseTo(2);
    expect(sliderToSpeed(speedToSlider(1.5))).toBeCloseTo(1.5, 1);
  });
});

describe('fades', () => {
  it('limits', () => {
    expect(fadeLimits(10)).toEqual({ min: 0, max: 10, step: 0.1 });
    expect(fadeLimits(10, 4).max).toBe(6);
    expect(fadeLimits(10, 12).max).toBe(0);
    expect(fadeLimits(0).max).toBe(0);
  });
  it('the changed fade wins, the other shrinks', () => {
    expect(clampFades(3, 3, 10, 'in')).toEqual({ fadeIn: 3, fadeOut: 3 });
    expect(clampFades(8, 5, 10, 'in')).toEqual({ fadeIn: 8, fadeOut: 2 });
    expect(clampFades(5, 8, 10, 'out')).toEqual({ fadeIn: 2, fadeOut: 8 });
    expect(clampFades(20, 0, 10, 'in')).toEqual({ fadeIn: 10, fadeOut: 0 });
    expect(clampFades(-1, 2, 10, 'in')).toEqual({ fadeIn: 0, fadeOut: 2 });
  });
  it('result never exceeds the duration and the gain curve stays within 0..volume', () => {
    const f = clampFades(9, 9, 10, 'out');
    expect(f.fadeIn + f.fadeOut).toBeLessThanOrEqual(10);
    for (let t = 0; t <= 10; t += 0.5) {
      const g = gainAt({ volume: 0.8, ...f }, t, 10);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(0.8);
    }
  });
});

describe('dB', () => {
  it('converts', () => {
    expect(dBToGain(0)).toBe(1);
    expect(dBToGain(-20)).toBeCloseTo(0.1);
    expect(gainToDb(1)).toBe(0);
    expect(gainToDb(0.5)).toBeCloseTo(-6.02, 2);
    expect(gainToDb(0)).toBe(-Infinity);
    expect(gainToDb(dBToGain(-12))).toBeCloseTo(-12);
  });
  it('labels', () => {
    expect(dbLabel(1)).toBe('0 dB');
    expect(dbLabel(0.5)).toBe('-6.0 dB');
    expect(dbLabel(0)).toBe('-∞ dB');
  });
});

describe('mixHeadroom', () => {
  it('is 1 for one or none, and 1/n so n full-scale sources cannot exceed 1', () => {
    expect(mixHeadroom(0)).toBe(1);
    expect(mixHeadroom(1)).toBe(1);
    expect(mixHeadroom(4)).toBe(0.25);
    expect(4 * mixHeadroom(4)).toBeLessThanOrEqual(1);
  });
});

describe('extractAudioLayer', () => {
  it('makes a sound layer over the same file and mutes the picture', () => {
    const r = extractAudioLayer({ srcId: 'v', in: 5, editStart: 2, editLength: 4, speed: 2, volume: 0.7, fadeIn: 1, fadeOut: 0.5, track: 3 });
    expect(r.layer).toMatchObject({ kind: 'audio', srcId: 'v', in: 5, start: 2, end: 6, track: 3, speed: 2, volume: 0.7, fadeIn: 1, fadeOut: 0.5 });
    expect(r.layer.id).toBeTruthy();
    expect(r.mute).toEqual({ volume: 0 });
  });
  it('omits unset optional fields', () => {
    const r = extractAudioLayer({ srcId: 'v', in: 0, editStart: 0, editLength: 1, track: 0 });
    expect(r.layer).not.toHaveProperty('speed');
    expect(r.layer).not.toHaveProperty('fadeIn');
  });
});
