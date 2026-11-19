import { describe, expect, it } from 'vitest';
import { animFactors, animOf, IDENTITY, PRESETS } from '../src/video/text-anim.ts';

describe('animFactors', () => {
  it('none is the identity everywhere', () => {
    for (const ph of ['in', 'out', 'loop'] as const) expect(animFactors('none', ph, 0.3)).toEqual(IDENTITY);
  });
  it('every preset in every phase is the identity at the visible end (in p=1, out p=0)', () => {
    for (const p of PRESETS) {
      expect(animFactors(p, 'in', 1)).toEqual(IDENTITY);
      expect(animFactors(p, 'out', 0)).toEqual(IDENTITY);
    }
  });
  it('fade', () => {
    expect(animFactors('fade', 'in', 0).opacity).toBe(0);
    expect(animFactors('fade', 'in', 0.25).opacity).toBe(0.25);
    expect(animFactors('fade', 'out', 1).opacity).toBe(0);
  });
  it('slides enter from and leave towards the named side', () => {
    expect(animFactors('slideLeft', 'in', 0).dx).toBe(-1);
    expect(animFactors('slideRight', 'in', 0).dx).toBe(1);
    expect(animFactors('slideUp', 'in', 0).dy).toBe(-1);
    expect(animFactors('slideDown', 'in', 0).dy).toBe(1);
    expect(animFactors('slideLeft', 'out', 1).dx).toBe(-1);
    expect(animFactors('slideDown', 'out', 1).dy).toBe(1);
    expect(animFactors('slideLeft', 'in', 0.5).dx).toBe(-0.5);
  });
  it('pop scales from 0 and back to 0', () => {
    expect(animFactors('pop', 'in', 0).scale).toBe(0);
    expect(animFactors('pop', 'out', 1).scale).toBe(0);
    expect(animFactors('pop', 'in', 0.5).scale).toBe(0.5);
  });
  it('typewriter reveals characters', () => {
    expect(animFactors('typewriter', 'in', 0.4).chars).toBe(0.4);
    expect(animFactors('typewriter', 'out', 0.25).chars).toBe(0.75);
  });
  it('clamps progress', () => {
    expect(animFactors('fade', 'in', -3).opacity).toBe(0);
    expect(animFactors('fade', 'in', 9).opacity).toBe(1);
  });
  it('loops are periodic and start neutral', () => {
    for (const p of PRESETS) {
      const a = animFactors(p, 'loop', 0);
      const b = animFactors(p, 'loop', 1);
      for (const key of ['dx', 'dy', 'scale', 'opacity', 'chars'] as const) expect(a[key]).toBeCloseTo(b[key], 9);
    }
    expect(animFactors('pop', 'loop', 0.25).scale).toBeGreaterThan(1);
    expect(animFactors('fade', 'loop', 0.5).opacity).toBeLessThan(1);
    expect(animFactors('typewriter', 'loop', 0.5)).toEqual(IDENTITY);
  });
});

describe('animOf', () => {
  it('is the identity without animations', () => {
    expect(animOf({}, 1, 5)).toEqual(IDENTITY);
    expect(animOf({ anims: {} }, 1, 5)).toEqual(IDENTITY);
  });
  it('plays the in animation during its duration only', () => {
    const l = { anims: { in: { preset: 'fade' as const, dur: 1 } } };
    expect(animOf(l, 0, 5).opacity).toBe(0);
    const mid = animOf(l, 0.5, 5).opacity;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(animOf(l, 1, 5).opacity).toBe(1);
    expect(animOf(l, 4, 5).opacity).toBe(1);
  });
  it('plays the out animation at the end', () => {
    const l = { anims: { out: { preset: 'fade' as const, dur: 1 } } };
    expect(animOf(l, 3.9, 5).opacity).toBe(1);
    expect(animOf(l, 5, 5).opacity).toBe(0);
    expect(animOf(l, 4.5, 5).opacity).toBeLessThan(1);
  });
  it('shrinks in+out proportionally when they are longer than the layer', () => {
    const l = { anims: { in: { preset: 'fade' as const, dur: 3 }, out: { preset: 'fade' as const, dur: 3 } } };
    expect(animOf(l, 1, 2).opacity).toBeCloseTo(1, 5); // meeting point, in done, out not started
    expect(animOf(l, 0, 2).opacity).toBe(0);
    expect(animOf(l, 2, 2).opacity).toBe(0);
  });
  it('combines in, loop: offsets add, scale multiplies', () => {
    const l = { anims: { in: { preset: 'pop' as const, dur: 1 }, loop: { preset: 'pop' as const, dur: 2 } } };
    expect(animOf(l, 0, 9).scale).toBe(0);
    expect(animOf(l, 0.5, 9).scale).toBeGreaterThan(0);
  });
  it('loop cycles with its own period and ignores zero durations', () => {
    const l = { anims: { loop: { preset: 'pop' as const, dur: 2 } } };
    expect(animOf(l, 0.5, 9).scale).toBeCloseTo(animOf(l, 2.5, 9).scale, 9);
    expect(animOf({ anims: { in: { preset: 'fade' as const, dur: 0 } } }, 0, 5)).toEqual(IDENTITY);
  });
});
