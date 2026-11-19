import { describe, expect, it } from 'vitest';
import {
  ASPECTS, boxFromGeometry, boxForAspect, displaySize, flipDisplay, geometryWithBox, moveBox, nudgeBox, resizeBox, toDisplayPoint, turn, MIN_BOX,
} from '../src/photo/crop-math.ts';

const src = { w: 400, h: 200 };

describe('displaySize', () => {
  it('swaps for odd turns', () => {
    expect(displaySize(src, 0)).toEqual({ w: 400, h: 200 });
    expect(displaySize(src, 1)).toEqual({ w: 200, h: 400 });
    expect(displaySize(src, 2)).toEqual({ w: 400, h: 200 });
    expect(displaySize(src, 3)).toEqual({ w: 200, h: 400 });
  });
});

describe('toDisplayPoint (flip, then turn clockwise)', () => {
  it('turns a point clockwise', () => {
    // top-left corner of a 400x200 picture goes to the top-right of the 200x400 result
    expect(toDisplayPoint({ x: 0, y: 0 }, src, { turns: 1 })).toEqual({ x: 200, y: 0 });
    expect(toDisplayPoint({ x: 0, y: 0 }, src, { turns: 2 })).toEqual({ x: 400, y: 200 });
    expect(toDisplayPoint({ x: 0, y: 0 }, src, { turns: 3 })).toEqual({ x: 0, y: 400 });
  });
  it('flips first', () => {
    expect(toDisplayPoint({ x: 0, y: 0 }, src, { flipX: true })).toEqual({ x: 400, y: 0 });
    expect(toDisplayPoint({ x: 0, y: 0 }, src, { flipY: true, turns: 1 })).toEqual({ x: 0, y: 0 });
  });
});

describe('box <-> geometry', () => {
  it('whole picture when there is no crop', () => {
    expect(boxFromGeometry(src, {})).toEqual({ x: 0, y: 0, w: 400, h: 200 });
    expect(boxFromGeometry(src, { turns: 1 })).toEqual({ x: 0, y: 0, w: 200, h: 400 });
  });
  it('round-trips a box through every turn and flip', () => {
    const box = { x: 20, y: 30, w: 50, h: 60 };
    for (const turns of [0, 1, 2, 3] as const)
      for (const flipX of [false, true])
        for (const flipY of [false, true]) {
          const g = geometryWithBox(src, { turns, flipX, flipY }, box);
          const back = boxFromGeometry(src, g);
          expect(back).toEqual(box);
          // the crop is a rectangle inside the original picture
          const c = g.crop!;
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.y).toBeGreaterThanOrEqual(0);
          expect(c.x + c.w).toBeLessThanOrEqual(400);
          expect(c.y + c.h).toBeLessThanOrEqual(200);
          expect(Math.min(c.w, c.h)).toBeGreaterThan(0);
        }
  });
  it('a box that is the whole display stores no crop', () => {
    expect(geometryWithBox(src, { turns: 1 }, { x: 0, y: 0, w: 200, h: 400 }).crop).toBeUndefined();
  });
  it('keeps the other geometry fields and rounds the crop to whole pixels', () => {
    const g = geometryWithBox(src, { straighten: 5, turns: 0 }, { x: 10.4, y: 10.6, w: 99.5, h: 50 });
    expect(g.straighten).toBe(5);
    expect(Number.isInteger(g.crop!.x) && Number.isInteger(g.crop!.w)).toBe(true);
  });
});

describe('turn and flipDisplay keep the content in place', () => {
  it('turning changes turns by one, wrapping', () => {
    expect(turn({ turns: 3 }, 1).turns).toBe(0);
    expect(turn({}, -1).turns).toBe(3);
  });
  it('a display mirror really mirrors every point, for all turns and flips', () => {
    const pts = [{ x: 10, y: 20 }, { x: 390, y: 5 }, { x: 200, y: 100 }];
    for (const turns of [0, 1, 2, 3] as const)
      for (const flipX of [false, true])
        for (const flipY of [false, true])
          for (const axis of ['h', 'v'] as const) {
            const g = { turns, flipX, flipY };
            const m = flipDisplay(g, axis);
            const d = displaySize(src, turns);
            for (const p of pts) {
              const a = toDisplayPoint(p, src, g);
              const b = toDisplayPoint(p, src, m);
              expect(b.x).toBeCloseTo(axis === 'h' ? d.w - a.x : a.x, 9);
              expect(b.y).toBeCloseTo(axis === 'v' ? d.h - a.y : a.y, 9);
            }
          }
  });
  it('a mirror negates the straighten angle', () => {
    expect(flipDisplay({ straighten: 7 }, 'h').straighten).toBe(-7);
  });
});

const B = { w: 400, h: 200 };
describe('moveBox', () => {
  it('moves and stays inside', () => {
    expect(moveBox({ x: 10, y: 10, w: 100, h: 50 }, 30, 20, B)).toEqual({ x: 40, y: 30, w: 100, h: 50 });
    expect(moveBox({ x: 10, y: 10, w: 100, h: 50 }, -99, 999, B)).toEqual({ x: 0, y: 150, w: 100, h: 50 });
  });
});

describe('resizeBox', () => {
  const box = { x: 100, y: 50, w: 100, h: 50 };
  it('free: an edge moves one side', () => {
    expect(resizeBox(box, 'e', 20, 5, B)).toEqual({ x: 100, y: 50, w: 120, h: 50 });
    expect(resizeBox(box, 'n', 5, -20, B)).toEqual({ x: 100, y: 30, w: 100, h: 70 });
  });
  it('free: a corner moves two sides, and stops at the picture', () => {
    expect(resizeBox(box, 'nw', -500, -500, B)).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    expect(resizeBox(box, 'se', 999, 999, B)).toEqual({ x: 100, y: 50, w: 300, h: 150 });
  });
  it('never smaller than MIN_BOX', () => {
    const r = resizeBox(box, 'e', -999, 0, B);
    expect(r.w).toBe(MIN_BOX);
    expect(r.x).toBe(100);
  });
  it('locked ratio: a corner keeps the ratio and the opposite corner', () => {
    const r = resizeBox(box, 'se', 40, 0, B, 2);
    expect(r.w / r.h).toBeCloseTo(2, 9);
    expect(r.x).toBe(100);
    expect(r.y).toBe(50);
    expect(r.w).toBeCloseTo(140, 9);
  });
  it('locked ratio: stays inside the picture', () => {
    const r = resizeBox(box, 'se', 999, 999, B, 2);
    expect(r.w / r.h).toBeCloseTo(2, 9);
    expect(r.x + r.w).toBeLessThanOrEqual(400 + 1e-9);
    expect(r.y + r.h).toBeLessThanOrEqual(200 + 1e-9);
  });
  it('locked ratio: an edge changes the other side about the centre', () => {
    const r = resizeBox(box, 'e', 40, 0, B, 2);
    expect(r.w).toBeCloseTo(140, 9);
    expect(r.h).toBeCloseTo(70, 9);
    expect(r.y + r.h / 2).toBeCloseTo(75, 9);
  });
});

describe('aspects and boxForAspect', () => {
  it('lists the presets of the brief', () => {
    expect(ASPECTS.map((a) => a.id)).toEqual(['free', 'original', '1:1', '4:5', '5:4', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3']);
  });
  it('fits the largest box of the ratio inside the bounds around the current centre', () => {
    const r = boxForAspect({ x: 100, y: 50, w: 100, h: 100 }, B, 1);
    expect(r.w).toBeCloseTo(r.h, 9);
    expect(r.h).toBeLessThanOrEqual(200);
    const w = boxForAspect({ x: 0, y: 0, w: 400, h: 200 }, B, 16 / 9);
    expect(w.w / w.h).toBeCloseTo(16 / 9, 9);
    expect(w.w).toBeCloseTo(355.55, 1);
  });
  it('stays inside the bounds even when the centre is near an edge', () => {
    const r = boxForAspect({ x: 0, y: 0, w: 20, h: 20 }, B, 2);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
  });
});

describe('nudgeBox', () => {
  it('moves the whole box by arrow keys', () => {
    expect(nudgeBox({ x: 10, y: 10, w: 20, h: 20 }, 'ArrowRight', 1, B)).toEqual({ x: 11, y: 10, w: 20, h: 20 });
  });
});
