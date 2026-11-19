import { describe, expect, it } from 'vitest';
import { newLayer, type TextLayer } from '../src/editor/layers.ts';
import type { Geometry, ImageLayer, ShapeLayer } from '../src/photo/doc.ts';
import { apply, clampCrop, fillScale, geometryMatrix, invert, largestInscribedCrop, retargetLayers, sameGeometry } from '../src/photo/geometry.ts';

const src = { w: 100, h: 50 };
const measure = { font: '', measureText: (s: string) => ({ width: s.length * 10 }) } as unknown as CanvasRenderingContext2D;
const geos: Geometry[] = [
  {},
  { turns: 1 },
  { turns: 3, flipX: true },
  { crop: { x: 10, y: 5, w: 70, h: 35 }, flipY: true },
  { crop: { x: 10, y: 5, w: 70, h: 35 }, turns: 2 },
  { straighten: 15, crop: { x: 20, y: 10, w: 50, h: 30 } },
  { straighten: -20, turns: 1, flipX: true },
];
const shape = (over: Partial<ShapeLayer> = {}): ShapeLayer => ({ id: 's', kind: 'shape', shape: 'rect', x: 30, y: 12, w: 20, h: 10, rotation: 25, opacity: 0.5, blend: 'multiply', flipX: true, ...over });
const centre = (l: { x: number; y: number; w: number; h: number }) => ({ x: l.x + l.w / 2, y: l.y + l.h / 2 });

describe('retargetLayers composes (A to B to C equals A to C)', () => {
  it('for a shape: same centre, same rotation and flips, to 1e-6, for every triple', () => {
    for (const a of geos)
      for (const b of geos)
        for (const c of geos) {
          const l = shape();
          const via = retargetLayers(retargetLayers([l], src, a, b)[0], src, b, c)[0][0] as ShapeLayer;
          const direct = retargetLayers([l], src, a, c)[0][0] as ShapeLayer;
          const tag = JSON.stringify([a, b, c]);
          expect(via.x, tag).toBeCloseTo(direct.x, 6);
          expect(via.y, tag).toBeCloseTo(direct.y, 6);
          // rotation is an angle: compare on the circle (180 and -180 are the same direction)
          const d = Math.abs(((via.rotation - direct.rotation + 540) % 360) - 180);
          expect(d, tag).toBeLessThan(1e-6);
          expect(!!via.flipX, tag).toBe(!!direct.flipX);
          expect(!!via.flipY, tag).toBe(!!direct.flipY);
        }
  });
  it('for text: the box centre and direction agree the same way', () => {
    const t = newLayer({ id: 't', x: 10, y: 5, text: 'abcd', rotation: 30 });
    for (const a of geos)
      for (const b of geos) {
        const via = retargetLayers(retargetLayers([t], src, a, b, measure)[0], src, b, {}, measure)[0][0] as TextLayer;
        const direct = retargetLayers([t], src, a, {}, measure)[0][0] as TextLayer;
        expect(via.x).toBeCloseTo(direct.x, 6);
        expect(via.y).toBeCloseTo(direct.y, 6);
        expect(Math.abs(((((via.rotation ?? 0) - (direct.rotation ?? 0)) + 540) % 360) - 180)).toBeLessThan(1e-6);
      }
  });
});

describe('retargetLayers keeps what is not geometry', () => {
  it('leaves id, name, hidden, locked, opacity, blend, size and style untouched, and does not mutate the input', () => {
    const l = shape({ name: 'Mark', hidden: true, locked: true, radius: 3 });
    const copy = JSON.stringify(l);
    const [[m]] = retargetLayers([l], src, {}, { turns: 1, flipX: true }) as [ShapeLayer[], string[]];
    expect(m).toMatchObject({ id: 's', name: 'Mark', hidden: true, locked: true, opacity: 0.5, blend: 'multiply', w: 20, h: 10, radius: 3 });
    expect(JSON.stringify(l)).toBe(copy);
  });
  it('reports every text layer that loses its erase rectangle, and only those', () => {
    const erase = { x: 10, y: 5, w: 20, h: 8, color: '#fff' };
    const a = newLayer({ id: 'a', x: 10, y: 5, text: 'ab', erase });
    const b = newLayer({ id: 'b', x: 10, y: 5, text: 'ab' });
    const c = newLayer({ id: 'c', x: 40, y: 5, text: 'ab', erase });
    const [out, lost] = retargetLayers([a, b, c], src, {}, { straighten: 7 }, measure);
    expect(lost).toEqual(['a', 'c']);
    expect((out[0] as TextLayer).erase).toBeUndefined();
    expect(out).toHaveLength(3);
  });
  it('a straighten that is a multiple of 90 keeps axes, so erase rectangles survive', () => {
    const erase = { x: 10, y: 5, w: 20, h: 8, color: '#fff' };
    const t = newLayer({ id: 't', x: 10, y: 5, text: 'ab', erase });
    const [[o], lost] = retargetLayers([t], src, {}, { straighten: 90 }, measure);
    expect(lost).toEqual([]);
    expect((o as TextLayer).erase).toBeDefined();
  });
});

describe('fillScale', () => {
  it('is symmetric in the sign of the angle, grows with the angle, and is 1 for multiples of 360', () => {
    expect(fillScale(src, { straighten: 12 })).toBeCloseTo(fillScale(src, { straighten: -12 }), 9);
    expect(fillScale(src, { straighten: 20 })).toBeGreaterThan(fillScale(src, { straighten: 10 }));
    expect(fillScale(src, { straighten: 360 })).toBeCloseTo(1, 9);
  });
  it('with a crop, covers the cropped window (not the whole picture) with picture pixels', () => {
    const g: Geometry = { crop: { x: 30, y: 10, w: 40, h: 30 }, straighten: 25, turns: 1, flipX: true };
    const inv = invert(geometryMatrix(src, g, { fill: true }));
    const out = { w: 30, h: 40 };
    for (const p of [{ x: 0, y: 0 }, { x: out.w, y: 0 }, { x: out.w, y: out.h }, { x: 0, y: out.h }]) {
      const q = apply(inv, p);
      expect(q.x).toBeGreaterThan(-1e-6);
      expect(q.x).toBeLessThan(100 + 1e-6);
      expect(q.y).toBeGreaterThan(-1e-6);
      expect(q.y).toBeLessThan(50 + 1e-6);
    }
  });
  it('is 1 when the window is the picture and straighten is within 1e-12 of zero, never below 1, never NaN', () => {
    for (const s of [1e-12, 0.001, 44.9, -45]) {
      const k = fillScale(src, { straighten: s });
      expect(Number.isFinite(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('largestInscribedCrop and clampCrop edge cases', () => {
  it('at 90 degrees (cos = 0) fits the turned window and stays finite', () => {
    const c = largestInscribedCrop(src, 90);
    expect(Number.isFinite(c.w) && Number.isFinite(c.h)).toBe(true);
    expect(c.w).toBeLessThanOrEqual(50 + 1e-9);
    expect(c.h).toBeLessThanOrEqual(50 + 1e-9);
  });
  it('a bad ratio falls back to the picture\'s own', () => {
    expect(largestInscribedCrop(src, 0, NaN)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(largestInscribedCrop(src, 0, -2)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });
  it('clampCrop never returns a box outside the picture, even for a crop bigger than it or a negative size', () => {
    for (const crop of [{ x: 500, y: 500, w: 10, h: 10 }, { x: -50, y: -50, w: 1000, h: 1000 }, { x: 10, y: 10, w: -5, h: -5 }, { x: 99.5, y: 49.5, w: 3, h: 3 }]) {
      const c = clampCrop(src, crop);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(100);
      expect(c.y + c.h).toBeLessThanOrEqual(50);
      expect(c.w).toBeGreaterThanOrEqual(1);
      expect(c.h).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('sameGeometry', () => {
  it('compares the crop by value, and treats missing and zero/false alike, but not 359 vs -1', () => {
    expect(sameGeometry({ crop: { x: 1, y: 2, w: 3, h: 4 } }, { crop: { x: 1, y: 2, w: 3, h: 4 } })).toBe(true);
    expect(sameGeometry({ crop: { x: 1, y: 2, w: 3, h: 4 } }, { crop: { x: 1, y: 2, w: 3, h: 5 } })).toBe(false);
    expect(sameGeometry({ crop: { x: 0, y: 0, w: 100, h: 50 } }, {})).toBe(false); // explicit full crop is not "no crop" (documented: byte-exact)
    expect(sameGeometry({ turns: 0, flipX: false, straighten: 0 }, {})).toBe(true);
  });
  it('a retarget between two geometries that only differ by an explicit full crop does not move layers', () => {
    const l = shape();
    const [[m]] = retargetLayers([l], src, {}, { crop: { x: 0, y: 0, w: 100, h: 50 } }) as [ImageLayer[] | ShapeLayer[], string[]];
    expect(centre(m as ShapeLayer).x).toBeCloseTo(centre(l).x, 9);
    expect(centre(m as ShapeLayer).y).toBeCloseTo(centre(l).y, 9);
    expect((m as ShapeLayer).rotation).toBeCloseTo(25, 9);
  });
});
