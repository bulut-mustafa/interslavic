import { describe, expect, it } from 'vitest';
import { newLayer } from '../src/editor/layers.ts';
import type { Geometry, ImageLayer, ShapeLayer } from '../src/photo/doc.ts';
import { apply, clampCrop, cropForAspect, fillScale, geometryMatrix, invert, largestInscribedCrop, mapPoint, outputBounds, retargetLayers, shapeOutline, starPoints, unmapPoint, type Pt } from '../src/photo/geometry.ts';

const src = { w: 100, h: 50 };
const near = (p: Pt, q: Pt, d = 6) => {
  expect(p.x).toBeCloseTo(q.x, d);
  expect(p.y).toBeCloseTo(q.y, d);
};

describe('geometryMatrix', () => {
  it('is the identity when nothing is done', () => {
    near(mapPoint(src, {}, { x: 30, y: 20 }), { x: 30, y: 20 });
    expect(outputBounds(src, {})).toEqual({ w: 100, h: 50 });
  });

  it('a quarter turn swaps the size and sends the top-left corner to the top-right', () => {
    expect(outputBounds(src, { turns: 1 })).toEqual({ w: 50, h: 100 });
    near(mapPoint(src, { turns: 1 }, { x: 0, y: 0 }), { x: 50, y: 0 });
    near(mapPoint(src, { turns: 1 }, { x: 100, y: 0 }), { x: 50, y: 100 });
    near(mapPoint(src, { turns: 2 }, { x: 0, y: 0 }), { x: 100, y: 50 });
    near(mapPoint(src, { turns: 3 }, { x: 0, y: 0 }), { x: 0, y: 100 });
  });

  it('a turn is exact (no rounding noise)', () => {
    const m = geometryMatrix(src, { turns: 1 });
    expect([m.a, m.b, m.c, m.d]).toEqual([0, 1, -1, 0]);
  });

  it('crop offsets the origin; flips mirror inside the crop', () => {
    const g: Geometry = { crop: { x: 20, y: 10, w: 60, h: 30 } };
    near(mapPoint(src, g, { x: 20, y: 10 }), { x: 0, y: 0 });
    near(mapPoint(src, g, { x: 80, y: 40 }), { x: 60, y: 30 });
    near(mapPoint(src, { ...g, flipX: true }, { x: 20, y: 10 }), { x: 60, y: 0 });
    near(mapPoint(src, { ...g, flipY: true }, { x: 20, y: 10 }), { x: 0, y: 30 });
    expect(outputBounds(src, { ...g, turns: 3 })).toEqual({ w: 30, h: 60 });
  });

  it('straighten turns about the crop centre, clockwise, and keeps the output size', () => {
    const g: Geometry = { straighten: 90 };
    expect(outputBounds(src, g)).toEqual({ w: 100, h: 50 });
    near(mapPoint(src, g, { x: 50, y: 25 }), { x: 50, y: 25 });
    // a point to the right of the centre goes below it (clockwise on screen)
    near(mapPoint(src, g, { x: 60, y: 25 }), { x: 50, y: 35 });
    const c: Geometry = { crop: { x: 10, y: 5, w: 40, h: 20 }, straighten: 30 };
    near(mapPoint(src, c, { x: 30, y: 15 }), { x: 20, y: 10 });
  });

  it('round trips for every combination', () => {
    for (const turns of [0, 1, 2, 3] as const)
      for (const flipX of [false, true])
        for (const flipY of [false, true])
          for (const straighten of [0, 7.5, -33]) {
            const g: Geometry = { turns, flipX, flipY, straighten, crop: { x: 11, y: 7, w: 63, h: 29 } };
            for (const fill of [false, true]) {
              const p = { x: 37.25, y: 12.5 };
              near(unmapPoint(src, g, mapPoint(src, g, p, { fill }), { fill }), p, 9);
              const m = geometryMatrix(src, g, { fill });
              const id = apply(invert(m), apply(m, { x: 1, y: 2 }));
              near(id, { x: 1, y: 2 }, 9);
            }
          }
  });
});

describe('fill', () => {
  it('is 1 when not straightened and when the window already fits', () => {
    expect(fillScale(src, {})).toBe(1);
    expect(fillScale({ w: 1000, h: 1000 }, { straighten: 5, crop: { x: 400, y: 400, w: 100, h: 100 } })).toBe(1);
  });
  it('zooms exactly enough that the turned window corners land on the picture edge', () => {
    const g: Geometry = { straighten: 10 };
    const k = fillScale(src, g);
    expect(k).toBeGreaterThan(1);
    const m = geometryMatrix(src, g, { fill: true });
    const inv = invert(m);
    const corners = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }].map((p) => apply(inv, p));
    for (const p of corners) {
      expect(p.x).toBeGreaterThan(-1e-6);
      expect(p.x).toBeLessThan(100 + 1e-6);
      expect(p.y).toBeGreaterThan(-1e-6);
      expect(p.y).toBeLessThan(50 + 1e-6);
    }
    // and at least one corner touches the edge
    const touching = corners.some((p) => Math.abs(p.x) < 1e-6 || Math.abs(p.x - 100) < 1e-6 || Math.abs(p.y) < 1e-6 || Math.abs(p.y - 50) < 1e-6);
    expect(touching).toBe(true);
  });
});

describe('crops', () => {
  it('largestInscribedCrop of 0 degrees is the whole picture; turned, all four corners stay inside', () => {
    expect(largestInscribedCrop(src, 0)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    const c = largestInscribedCrop(src, 12);
    expect(c.w / c.h).toBeCloseTo(2, 9);
    const g: Geometry = { crop: c, straighten: 12 };
    const inv = invert(geometryMatrix(src, g));
    const o = outputBounds(src, g);
    for (const p of [{ x: 0, y: 0 }, { x: o.w, y: 0 }, { x: o.w, y: o.h }, { x: 0, y: o.h }]) {
      const q = apply(inv, p);
      expect(q.x).toBeGreaterThan(-1e-6);
      expect(q.x).toBeLessThan(100 + 1e-6);
      expect(q.y).toBeGreaterThan(-1e-6);
      expect(q.y).toBeLessThan(50 + 1e-6);
    }
    // it is the largest: a hair bigger sticks out
    const big = { ...c, w: c.w * 1.001, h: c.h * 1.001, x: c.x - c.w * 0.0005, y: c.y - c.h * 0.0005 };
    const inv2 = invert(geometryMatrix(src, { crop: big, straighten: 12 }));
    const o2 = outputBounds(src, { crop: big });
    const out = [{ x: 0, y: 0 }, { x: o2.w, y: 0 }, { x: o2.w, y: o2.h }, { x: 0, y: o2.h }].map((p) => apply(inv2, p)).some((q) => q.x < -1e-6 || q.x > 100 + 1e-6 || q.y < -1e-6 || q.y > 50 + 1e-6);
    expect(out).toBe(true);
  });

  it('largestInscribedCrop takes another ratio', () => {
    const c = largestInscribedCrop({ w: 100, h: 100 }, 0, 2);
    expect(c).toEqual({ x: 0, y: 25, w: 100, h: 50 });
  });

  it('cropForAspect fits the ratio in the picture or in the existing crop, keeping the centre', () => {
    expect(cropForAspect(src, 1)).toEqual({ x: 25, y: 0, w: 50, h: 50 });
    expect(cropForAspect(src, 4)).toEqual({ x: 0, y: 12.5, w: 100, h: 25 });
    expect(cropForAspect(src, 1, { x: 10, y: 10, w: 40, h: 20 })).toEqual({ x: 20, y: 10, w: 20, h: 20 });
    expect(cropForAspect(src, 0)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });

  it('clampCrop keeps a crop inside the picture and not smaller than the minimum', () => {
    expect(clampCrop(src, { x: -5, y: 40, w: 30, h: 30 })).toEqual({ x: 0, y: 20, w: 30, h: 30 });
    expect(clampCrop(src, { x: 0, y: 0, w: 500, h: 0 })).toEqual({ x: 0, y: 0, w: 100, h: 1 });
  });
});

describe('shape outlines', () => {
  it('fit their box', () => {
    for (const k of ['rect', 'ellipse', 'triangle', 'star', 'heart'] as const) {
      const pts = shapeOutline(k, 80, 40);
      for (const p of pts) {
        expect(p.x).toBeGreaterThan(-1e-9);
        expect(p.x).toBeLessThan(80 + 1e-9);
        expect(p.y).toBeGreaterThan(-1e-9);
        expect(p.y).toBeLessThan(40 + 1e-9);
      }
    }
    expect(starPoints(10, 10)).toHaveLength(10);
    expect(shapeOutline('line', 50, 0)).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }]);
  });
});

describe('retargetLayers', () => {
  const rad = (d: number) => (d * Math.PI) / 180;
  /** A point of a layer given in its own box (from the centre, before rotation and flip) as a point on the page. */
  const place = (l: ImageLayer | ShapeLayer, lx: number, ly: number): Pt => {
    const x = l.flipX ? -lx : lx;
    const y = l.flipY ? -ly : ly;
    const r = rad(l.rotation);
    return { x: l.x + l.w / 2 + x * Math.cos(r) - y * Math.sin(r), y: l.y + l.h / 2 + x * Math.sin(r) + y * Math.cos(r) };
  };
  const shape = (over: Partial<ShapeLayer> = {}): ShapeLayer => ({ id: 's', kind: 'shape', shape: 'star', x: 30, y: 12, w: 20, h: 10, rotation: 25, opacity: 1, blend: 'normal', flipX: true, ...over });
  const geos: Geometry[] = [
    {},
    { turns: 1 },
    { turns: 2, flipX: true },
    { turns: 3, flipY: true },
    { crop: { x: 10, y: 5, w: 70, h: 35 } },
    { crop: { x: 10, y: 5, w: 70, h: 35 }, turns: 1, flipX: true },
    { flipX: true, flipY: true, crop: { x: 0, y: 0, w: 60, h: 40 } },
    { straighten: 12, crop: { x: 20, y: 10, w: 50, h: 30 } },
    { straighten: -20, turns: 1, flipY: true },
  ];

  it('keeps a shape over the same picture pixels for every pair of geometries (to 1e-6)', () => {
    for (const from of geos)
      for (const to of geos) {
        const l = shape();
        const [[moved], lost] = retargetLayers([l], src, from, to) as [ShapeLayer[], string[]];
        expect(lost).toEqual([]);
        const t = (p: Pt) => apply(geometryMatrix(src, to), apply(invert(geometryMatrix(src, from)), p));
        for (const [lx, ly] of [[-10, -5], [10, -5], [10, 5], [0, 0], [3, 4]] as const) near(place(moved!, lx, ly), t(place(l, lx, ly)), 6);
        expect(moved!.w).toBe(20);
        expect(moved!.h).toBe(10);
      }
  });

  it('works for pictures too and updates rotation and flips', () => {
    const img: ImageLayer = { id: 'i', kind: 'image', src: 'a', x: 10, y: 10, w: 30, h: 20, rotation: 0, opacity: 1, blend: 'normal' };
    const [[a]] = retargetLayers([img], src, {}, { turns: 1 }) as [ImageLayer[], string[]];
    expect(a!.rotation).toBe(90);
    expect(a!.flipX).toBeUndefined();
    const [[b]] = retargetLayers([img], src, {}, { flipX: true }) as [ImageLayer[], string[]];
    expect(b!.flipX).toBe(true);
    expect(b!.x).toBeCloseTo(100 - 40, 9);
    expect(b!.rotation).toBe(0);
    const [[c]] = retargetLayers([b!], src, { flipX: true }, {}) as [ImageLayer[], string[]];
    expect(c!.flipX).toBe(false);
    expect(c!.x).toBeCloseTo(10, 9);
  });

  const measure = { font: '', measureText: (s: string) => ({ width: s.length * 10 }) } as unknown as CanvasRenderingContext2D;

  it('moves text through its box centre and turns it with the picture', () => {
    const t = newLayer({ id: 't', x: 10, y: 5, text: 'abcd' });
    const w = 40 + 2 * 0; // measured by the layout: use the box it reports
    void w;
    const [[a], lost] = retargetLayers([t], src, {}, { turns: 1 }, measure);
    expect(lost).toEqual([]);
    expect(a!.rotation).toBe(90);
    const [[back]] = retargetLayers([a!], src, { turns: 1 }, {}, measure);
    const orig = back as typeof t;
    expect(orig.x).toBeCloseTo(10, 6);
    expect(orig.y).toBeCloseTo(5, 6);
    expect(orig.rotation ?? 0).toBe(0);
  });

  it('carries erase rectangles exactly through crops, turns and flips, and drops them for straighten', () => {
    const t = newLayer({ id: 't', x: 10, y: 5, text: 'ab', erase: { x: 10, y: 5, w: 20, h: 8, color: '#fff' } });
    const [[a], lost] = retargetLayers([t], src, {}, { turns: 1, crop: { x: 5, y: 0, w: 90, h: 50 } }, measure);
    expect(lost).toEqual([]);
    // turn clockwise by 90 about the crop: (x,y) -> (50 - y, x - 5)
    expect((a as any).erase).toEqual({ x: 50 - 13, y: 5, w: 8, h: 20, color: '#fff' });
    const [[s], gone] = retargetLayers([t], src, {}, { straighten: 5 }, measure);
    expect(gone).toEqual(['t']);
    expect((s as any).erase).toBeUndefined();
    expect((s as any).text).toBe('ab');
  });

  it('returns the same list when the geometry did not change', () => {
    const layers = [shape()];
    expect(retargetLayers(layers, src, { turns: 1 }, { turns: 1 })[0]).toBe(layers);
  });
});
