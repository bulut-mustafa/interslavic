import { describe, expect, it } from 'vitest';
import type { LayerBox } from '../src/video/contracts.ts';
import { HANDLES, MIN_SIZE, SIGN, boxOfMedia, clampToFrame, containsPoint, corners, extents, handlePositions, isCorner, moveBox, normalizeDeg, patchOfBox, pointOf, resizeBox, rotateBox, rotateHandle, type Handle } from '../src/editor/transform-math.ts';

const box = (over: Partial<LayerBox> = {}): LayerBox => ({ id: 'a', cx: 400, cy: 300, w: 200, h: 100, rotation: 0, ...over });
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

/** The point of the box that stays fixed when `h` is dragged: the opposite corner or edge middle. */
const anchorOf = (b: LayerBox, h: Handle) => pointOf(b, (-SIGN[h][0] * b.w) / 2, (-SIGN[h][1] * b.h) / 2);

describe('handlePositions', () => {
  it('puts the eight handles on the corners and edge middles of an unrotated box', () => {
    const p = handlePositions(box());
    expect(p.nw).toEqual({ x: 300, y: 250 });
    expect(p.se).toEqual({ x: 500, y: 350 });
    expect(p.n).toEqual({ x: 400, y: 250 });
    expect(p.e).toEqual({ x: 500, y: 300 });
  });
  it('turns them with the box', () => {
    const p = handlePositions(box({ rotation: 90 }));
    // 90 degrees clockwise: the top-left corner goes to the top-right.
    near(p.nw.x, 450);
    near(p.nw.y, 200);
    const r = rotateHandle(box({ rotation: 90 }), 20);
    near(r.x, 400 + 50 + 20);
    near(r.y, 300);
  });
});

describe('extents', () => {
  it('swaps width and height when the box is turned 90 degrees', () => {
    const e = extents(box({ rotation: 90 }));
    near(e.w, 100);
    near(e.h, 200);
  });
  it('is unchanged by a full turn', () => {
    const e = extents(box({ rotation: 360 }));
    near(e.w, 200);
    near(e.h, 100);
  });
});

describe('resizeBox keeps the opposite point fixed in frame space', () => {
  const rotations = [0, 30, 90, 137, -45, 200];
  const pointers = [
    { x: 700, y: 420 },
    { x: 150, y: 90 },
    { x: 410, y: 310 },
    { x: 560, y: 120 },
  ];
  for (const rotation of rotations)
    for (const h of HANDLES)
      for (const proportional of [false, true])
        for (const p of pointers)
          it(`${h} at ${rotation} deg, proportional=${proportional}, pointer ${p.x},${p.y}`, () => {
            const b = box({ rotation });
            const out = resizeBox(b, h, p, { proportional });
            const before = anchorOf(b, h);
            const after = anchorOf(out, h);
            near(after.x, before.x);
            near(after.y, before.y);
            expect(out.w).toBeGreaterThanOrEqual(MIN_SIZE - 1e-9);
            expect(out.h).toBeGreaterThanOrEqual(MIN_SIZE - 1e-9);
            expect(out.rotation).toBe(rotation);
          });

  it('puts the dragged corner under the pointer when not clamped', () => {
    const b = box({ rotation: 30 });
    const p = { x: 650, y: 480 };
    const out = resizeBox(b, 'se', p);
    const c = corners(out)[2];
    near(c.x, p.x);
    near(c.y, p.y);
  });

  it('an edge handle changes one dimension only', () => {
    const out = resizeBox(box(), 'e', { x: 600, y: 999 });
    near(out.w, 300);
    near(out.h, 100);
    near(out.cx, 450);
    near(out.cy, 300);
    const t = resizeBox(box({ rotation: 90 }), 'n', { x: 400, y: 100 });
    // Rotated 90 deg clockwise: the box's own "north" faces +x in the frame... its width axis is vertical.
    near(t.w, 200);
  });

  it('proportional keeps the ratio, corner or edge', () => {
    for (const h of HANDLES) {
      const out = resizeBox(box({ rotation: 20 }), h, { x: 650, y: 500 }, { proportional: true });
      near(out.w / out.h, 2);
    }
  });

  it('an edge handle with proportional grows the other side about the unmoved axis', () => {
    const out = resizeBox(box(), 'e', { x: 600, y: 300 }, { proportional: true });
    near(out.w, 300);
    near(out.h, 150);
    near(out.cy, 300);
    near(out.cx, 450);
  });

  it('from the centre keeps the centre and mirrors the change', () => {
    for (const rotation of [0, 33, 90]) {
      const b = box({ rotation });
      const q = pointOf(b, 150, 80);
      const out = resizeBox(b, 'se', q, { fromCentre: true });
      near(out.cx, b.cx);
      near(out.cy, b.cy);
      near(out.w, 300);
      near(out.h, 160);
    }
    const prop = resizeBox(box(), 'e', { x: 700, y: 300 }, { fromCentre: true, proportional: true });
    near(prop.w, 600);
    near(prop.h, 300);
    near(prop.cx, 400);
  });

  it('never goes below the minimum size, proportional or not, and keeps the anchor', () => {
    for (const proportional of [false, true]) {
      const b = box({ rotation: 15 });
      const out = resizeBox(b, 'se', { x: -500, y: -500 }, { proportional });
      expect(Math.min(out.w, out.h)).toBeGreaterThanOrEqual(MIN_SIZE - 1e-9);
      const a = anchorOf(b, 'se');
      const a2 = anchorOf(out, 'se');
      near(a2.x, a.x);
      near(a2.y, a.y);
    }
    const tiny = resizeBox(box(), 'e', { x: 0, y: 300 });
    near(tiny.w, MIN_SIZE);
  });
});

describe('rotateBox', () => {
  it('reads the angle straight from the pointer when the handle is above the box', () => {
    near(rotateBox(box(), { x: 400, y: 100 }).rotation, 0);
    near(rotateBox(box(), { x: 600, y: 300 }).rotation, 90);
    near(rotateBox(box(), { x: 400, y: 500 }).rotation, 180);
    near(rotateBox(box(), { x: 200, y: 300 }).rotation, -90);
  });
  it('snaps to 15 degrees when asked', () => {
    const r = rotateBox(box(), { x: 400 + 100 * Math.sin((38 * Math.PI) / 180), y: 300 - 100 * Math.cos((38 * Math.PI) / 180) }, { snapDeg: 15 });
    near(r.rotation, 45);
    const r2 = rotateBox(box(), { x: 400 + 100 * Math.sin((36 * Math.PI) / 180), y: 300 - 100 * Math.cos((36 * Math.PI) / 180) }, { snapDeg: 15 });
    near(r2.rotation, 30);
  });
  it('turns by the swept angle when a grab point is given, with no jump', () => {
    const b = box({ rotation: 20 });
    const grab = { x: 400, y: 100 };
    near(rotateBox(b, grab, { grab }).rotation, 20);
    near(rotateBox(b, { x: 600, y: 300 }, { grab }).rotation, 110);
  });
  it('a 90 degree box has swapped extents', () => {
    const r = rotateBox(box(), { x: 600, y: 300 });
    near(extents(r).w, 100);
    near(extents(r).h, 200);
  });
  it('keeps the centre', () => {
    const r = rotateBox(box(), { x: 123, y: 456 });
    expect([r.cx, r.cy]).toEqual([400, 300]);
  });
});

describe('normalizeDeg', () => {
  it('wraps into (-180, 180]', () => {
    expect(normalizeDeg(190)).toBe(-170);
    expect(normalizeDeg(-190)).toBe(170);
    expect(normalizeDeg(180)).toBe(180);
    expect(normalizeDeg(-180)).toBe(180);
    expect(normalizeDeg(720)).toBe(0);
  });
});

describe('moveBox and clampToFrame', () => {
  const frame = { w: 1000, h: 600 };
  it('moves freely inside the frame', () => {
    const m = moveBox(box(), 10, -20, frame);
    expect([m.cx, m.cy]).toEqual([410, 280]);
  });
  it('does not change the original', () => {
    const b = box();
    moveBox(b, 5, 5);
    expect(b.cx).toBe(400);
  });
  it('leaves at least 24px of the box in the frame', () => {
    const m = moveBox(box(), -5000, 5000, frame);
    const e = extents(m);
    near(e.x + e.w, 24);
    near(e.y, 600 - 24);
  });
  it('uses the rotated extents', () => {
    const b = box({ rotation: 90, cx: 0, cy: 300 });
    const m = clampToFrame({ ...b, cx: -1000 }, frame);
    near(extents(m).x + extents(m).w, 24);
  });
  it('a box smaller than the margin may still be fully inside', () => {
    const b = box({ w: 10, h: 10, cx: 500, cy: 300 });
    expect(clampToFrame(b, frame)).toBe(b);
  });
});

describe('helpers', () => {
  it('containsPoint follows the rotation', () => {
    const b = box({ rotation: 90 });
    expect(containsPoint(b, { x: 400, y: 390 })).toBe(true);
    expect(containsPoint(b, { x: 480, y: 300 })).toBe(false);
  });
  it('isCorner', () => {
    expect(isCorner('se')).toBe(true);
    expect(isCorner('n')).toBe(false);
  });
  it('converts between a media layer and a box', () => {
    const l = { id: 'm', x: 10, y: 20, w: 100, h: 50, rotation: 30 };
    const b = boxOfMedia(l);
    expect([b.cx, b.cy]).toEqual([60, 45]);
    expect(patchOfBox(b)).toEqual({ x: 10, y: 20, w: 100, h: 50, rotation: 30 });
  });
});
