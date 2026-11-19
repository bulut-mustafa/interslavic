import { describe, expect, it } from 'vitest';
import { HANDLES } from '../src/editor/transform-math.ts';
import { ASPECTS, MIN_BOX, boxForAspect, boxFromGeometry, geometryWithBox, resizeBox, type Box } from '../src/photo/crop-math.ts';

/** A small deterministic generator so a failure can be reproduced. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const EPS = 1e-6;
const inside = (b: Box, bounds: { w: number; h: number }) => b.x >= -EPS && b.y >= -EPS && b.x + b.w <= bounds.w + EPS && b.y + b.h <= bounds.h + EPS;

describe('resizeBox invariants over random drags (every handle, free and locked ratio)', () => {
  const bounds = { w: 400, h: 300 };
  const rand = rng(12345);

  it('free resize: stays inside the bounds, never under MIN_BOX, and the untouched sides do not move', () => {
    for (let i = 0; i < 400; i++) {
      const w = MIN_BOX + rand() * 200;
      const h = MIN_BOX + rand() * 150;
      const b: Box = { x: rand() * (bounds.w - w), y: rand() * (bounds.h - h), w, h };
      const handle = HANDLES[Math.floor(rand() * HANDLES.length)]!;
      const dx = (rand() - 0.5) * 1200;
      const dy = (rand() - 0.5) * 1200;
      const r = resizeBox(b, handle, dx, dy, bounds);
      expect(inside(r, bounds), `${handle} ${JSON.stringify(b)} ${dx},${dy} -> ${JSON.stringify(r)}`).toBe(true);
      expect(r.w).toBeGreaterThanOrEqual(MIN_BOX - EPS);
      expect(r.h).toBeGreaterThanOrEqual(MIN_BOX - EPS);
      if (!handle.includes('w')) expect(r.x).toBeCloseTo(b.x, 6);
      if (!handle.includes('e')) expect(r.x + r.w).toBeCloseTo(b.x + b.w, 6) ;
      if (!handle.includes('n')) expect(r.y).toBeCloseTo(b.y, 6);
      if (!handle.includes('s')) expect(r.y + r.h).toBeCloseTo(b.y + b.h, 6);
    }
  });

  it('locked ratio: the ratio is kept exactly, the box stays inside the bounds, and is not under MIN_BOX', () => {
    for (let i = 0; i < 600; i++) {
      const ratio = [1, 4 / 5, 16 / 9, 9 / 16, 3 / 2][i % 5]!;
      // start from a box that already has the ratio and fits
      const h0 = MIN_BOX + rand() * 120;
      const w0 = h0 * ratio;
      if (w0 > bounds.w || h0 > bounds.h) continue;
      const b: Box = { x: rand() * (bounds.w - w0), y: rand() * (bounds.h - h0), w: w0, h: h0 };
      const handle = HANDLES[Math.floor(rand() * HANDLES.length)]!;
      const dx = (rand() - 0.5) * 900;
      const dy = (rand() - 0.5) * 900;
      const r = resizeBox(b, handle, dx, dy, bounds, ratio);
      const tag = `${handle} ratio ${ratio} ${JSON.stringify(b)} ${dx.toFixed(1)},${dy.toFixed(1)} -> ${JSON.stringify(r)}`;
      expect(r.w / r.h, tag).toBeCloseTo(ratio, 6);
      expect(inside(r, bounds), tag).toBe(true);
      expect(Math.min(r.w, r.h), tag).toBeGreaterThanOrEqual(MIN_BOX - EPS);
    }
  });

  it('locked ratio, corner: the opposite corner is the anchor', () => {
    const b: Box = { x: 100, y: 100, w: 80, h: 60 };
    const ratio = 80 / 60;
    for (const [handle, ax, ay] of [['se', 100, 100], ['nw', 180, 160], ['ne', 100, 160], ['sw', 180, 100]] as const) {
      const r = resizeBox(b, handle, handle.includes('e') ? 30 : -30, handle.includes('s') ? 30 : -30, bounds, ratio);
      const cornerX = handle.includes('e') ? r.x : r.x + r.w;
      const cornerY = handle.includes('s') ? r.y : r.y + r.h;
      expect([cornerX, cornerY]).toEqual([ax, ay]);
      expect(r.w).toBeGreaterThan(b.w);
    }
  });
});

describe('boxForAspect', () => {
  it('gives the largest box of every listed ratio, inside the bounds, centred when there is room', () => {
    const bounds = { w: 400, h: 300 };
    for (const a of ASPECTS) {
      if (!a.ratio) continue;
      const r = boxForAspect({ x: 150, y: 100, w: 100, h: 100 }, bounds, a.ratio);
      expect(r.w / r.h).toBeCloseTo(a.ratio, 9);
      expect(inside(r, bounds)).toBe(true);
      // largest: it touches the bounds on at least one axis
      expect(Math.abs(r.w - bounds.w) < EPS || Math.abs(r.h - bounds.h) < EPS).toBe(true);
    }
  });
});

describe('geometryWithBox / boxFromGeometry at the edges', () => {
  const src = { w: 100, h: 60 };
  it('a box dragged past the picture is clamped into it as a whole-pixel crop that stays inside', () => {
    const g = geometryWithBox(src, { turns: 1 }, { x: -20, y: -5, w: 500, h: 200 });
    // the display is 60 x 100; the box covers all of it, so no crop is stored
    expect(g.crop).toBeUndefined();
    const part = geometryWithBox(src, { turns: 1 }, { x: 10.4, y: 20.6, w: 30.2, h: 40.7 });
    const c = part.crop!;
    expect(Number.isInteger(c.x) && Number.isInteger(c.y) && Number.isInteger(c.w) && Number.isInteger(c.h)).toBe(true);
    expect(c.x + c.w).toBeLessThanOrEqual(src.w);
    expect(c.y + c.h).toBeLessThanOrEqual(src.h);
    expect(c.w).toBeGreaterThanOrEqual(1);
  });
  it('a tiny box still stores a crop of at least one pixel, even in the last pixel row/column', () => {
    const g = geometryWithBox(src, {}, { x: 99.9, y: 59.9, w: 0.1, h: 0.1 });
    expect(g.crop!.w).toBeGreaterThanOrEqual(1);
    expect(g.crop!.h).toBeGreaterThanOrEqual(1);
    expect(g.crop!.x + g.crop!.w).toBeLessThanOrEqual(100);
    expect(g.crop!.y + g.crop!.h).toBeLessThanOrEqual(60);
  });
  it('a crop stored then shown again is the same box (whole pixels) for every turn and flip', () => {
    for (const turns of [0, 1, 2, 3] as const)
      for (const flipX of [false, true])
        for (const flipY of [false, true]) {
          const g0 = { turns, flipX, flipY };
          const box = { x: 7, y: 11, w: 23, h: 17 };
          const stored = geometryWithBox(src, g0, box);
          expect(boxFromGeometry(src, stored)).toEqual(box);
        }
  });
});
