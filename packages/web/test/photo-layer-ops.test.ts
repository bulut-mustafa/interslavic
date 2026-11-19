import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../src/editor/text-style.ts';
import type { ImageLayer, PhotoLayer, ShapeLayer } from '../src/photo/doc.ts';
import type { TextLayer } from '../src/editor/layers.ts';
import * as ops from '../src/photo/layer-ops.ts';

const page = { w: 1000, h: 600 };
const img = (id: string, x = 0, y = 0, w = 100, h = 50, over: Partial<ImageLayer> = {}): ImageLayer => ({ id, kind: 'image', src: 's', x, y, w, h, rotation: 0, opacity: 1, blend: 'normal', ...over });
const shp = (id: string, x = 0, y = 0, w = 100, h = 100): ShapeLayer => ({ id, kind: 'shape', shape: 'rect', x, y, w, h, rotation: 0, opacity: 1, blend: 'normal', fill: '#000' });
const txt = (id: string, x = 0, y = 0): TextLayer => ({ id, text: 'Hello', x, y, maxWidth: 0, style: { ...DEFAULT_STYLE } });
const ids = (l: PhotoLayer[]) => l.map((x) => x.id);
const measure = () => ({ w: 200, h: 40 });

describe('adding', () => {
  it('fits a picture to half the page, centred, on top', () => {
    const out = ops.addImage([shp('a')], 'f1', { w: 4000, h: 1000 }, page);
    const n = out[1] as ImageLayer;
    expect(n.kind).toBe('image');
    expect(n.w).toBeCloseTo(500);
    expect(n.h).toBeCloseTo(125);
    expect(n.x).toBeCloseTo(250);
    expect(n.y).toBeCloseTo(237.5);
    const tall = ops.addImage([], 'f', { w: 100, h: 1000 }, page)[0] as ImageLayer;
    expect(tall.h).toBeCloseTo(300);
  });
  it('adds shapes with a fill, or a stroke for lines', () => {
    const r = ops.addShape([], 'rect', page)[0] as ShapeLayer;
    expect(r.fill).toBeTruthy();
    expect(r.w).toBe(r.h);
    const l = ops.addShape([], 'arrow', page)[0] as ShapeLayer;
    expect(l.stroke?.width).toBeGreaterThan(0);
    expect(l.fill).toBeUndefined();
  });
  it('adds a sticker as a text layer', () => {
    const [s] = ops.addSticker([], '😀', page) as [TextLayer];
    expect(s.text).toBe('😀');
    expect(s.style.size).toBe(120);
  });
  it('does not change the input', () => {
    const a = [shp('a')];
    ops.addShape(a, 'star', page);
    expect(a).toHaveLength(1);
  });
});

describe('duplicate, remove, copy and paste', () => {
  it('copies with new ids, offset, on top in order', () => {
    const out = ops.duplicate([img('a', 0, 0), shp('b', 10, 10), txt('c')], ['b', 'a']);
    expect(out).toHaveLength(5);
    expect(out[3]!.x).toBe(24);
    expect(out[4]!.x).toBe(34);
    expect(new Set(ids(out)).size).toBe(5);
  });
  it('removes', () => {
    expect(ids(ops.remove([img('a'), img('b'), img('c')], ['a', 'c']))).toEqual(['b']);
  });
  it('round-trips a payload and regenerates ids', () => {
    const src = [img('a', 5, 5), txt('t')];
    const back = ops.parsePayload(ops.copyPayload(src, ['a', 't']));
    expect(back).toHaveLength(2);
    const pasted = ops.paste([shp('z')], back!);
    expect(pasted).toHaveLength(3);
    expect(ids(pasted).slice(1)).not.toContain('a');
    expect(pasted[1]!.x).toBe(29);
  });
  it('refuses text that is not a payload', () => {
    expect(ops.parsePayload('hello')).toBeNull();
    expect(ops.parsePayload('{"type":"other"}')).toBeNull();
    expect(ops.parsePayload(JSON.stringify({ type: ops.PAYLOAD_TYPE, layers: [{ id: 1 }] }))).toBeNull();
  });
});

describe('reorder', () => {
  const l = () => [img('a'), img('b'), img('c'), img('d')];
  it('front and back keep relative order', () => {
    expect(ids(ops.reorder(l(), ['a', 'c'], 'front'))).toEqual(['b', 'd', 'a', 'c']);
    expect(ids(ops.reorder(l(), ['b', 'd'], 'back'))).toEqual(['b', 'd', 'a', 'c']);
  });
  it('forward and backward step past the nearest other layer', () => {
    expect(ids(ops.reorder(l(), ['a'], 'forward'))).toEqual(['b', 'a', 'c', 'd']);
    expect(ids(ops.reorder(l(), ['a', 'b'], 'forward'))).toEqual(['c', 'a', 'b', 'd']);
    expect(ids(ops.reorder(l(), ['d'], 'backward'))).toEqual(['a', 'b', 'd', 'c']);
    expect(ids(ops.reorder(l(), ['c', 'd'], 'backward'))).toEqual(['a', 'c', 'd', 'b']);
  });
  it('does nothing at the ends or when all are chosen', () => {
    expect(ids(ops.reorder(l(), ['d'], 'forward'))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(ops.reorder(l(), ['a', 'b', 'c', 'd'], 'back'))).toEqual(['a', 'b', 'c', 'd']);
  });
  it('moveTo repositions one layer', () => {
    expect(ids(ops.moveTo(l(), 'a', 2))).toEqual(['b', 'c', 'a', 'd']);
    expect(ids(ops.moveTo(l(), 'd', 0))).toEqual(['d', 'a', 'b', 'c']);
  });
});

describe('flags and names', () => {
  it('hides and locks', () => {
    const out = ops.setLocked(ops.setHidden([img('a'), img('b')], ['a'], true), ['b'], true);
    expect(ops.isHidden(out[0]!)).toBe(true);
    expect(ops.isLocked(out[1]!)).toBe(true);
    expect(ops.isHidden(out[1]!)).toBe(false);
  });
  it('names layers from content unless renamed', () => {
    expect(ops.layerName(img('a'))).toBe('Picture');
    expect(ops.layerName(shp('a'))).toBe('Rectangle');
    expect(ops.layerName(txt('a'))).toBe('Hello');
    expect(ops.layerName(ops.rename([img('a')], 'a', 'Logo')[0]!)).toBe('Logo');
  });
});

describe('geometry', () => {
  it('flips pictures and shapes, not text', () => {
    const out = ops.flip([img('a'), shp('b'), txt('c')], ['a', 'b', 'c'], 'x');
    expect((out[0] as ImageLayer).flipX).toBe(true);
    expect((out[1] as ShapeLayer).flipX).toBe(true);
    expect(out[2]).toEqual(txt('c'));
    expect((ops.flip(out, ['a'], 'x')[0] as ImageLayer).flipX).toBe(false);
  });
  it('nudges', () => {
    expect(ops.nudge([img('a', 1, 2)], ['a'], 3, -4)[0]).toMatchObject({ x: 4, y: -2 });
  });
  it('aligns one layer to each page side', () => {
    const a = [img('a', 300, 200, 100, 50)];
    expect(ops.alignToPage(a, ['a'], 'left', page)[0]!.x).toBe(0);
    expect(ops.alignToPage(a, ['a'], 'right', page)[0]!.x).toBe(900);
    expect(ops.alignToPage(a, ['a'], 'center', page)[0]!.x).toBe(450);
    expect(ops.alignToPage(a, ['a'], 'top', page)[0]!.y).toBe(0);
    expect(ops.alignToPage(a, ['a'], 'bottom', page)[0]!.y).toBe(550);
    expect(ops.alignToPage(a, ['a'], 'middle', page)[0]!.y).toBe(275);
  });
  it('aligns several as a block, keeping their spacing', () => {
    const a = [img('a', 100, 0, 100, 50), img('b', 400, 0, 100, 50)];
    const out = ops.alignToPage(a, ['a', 'b'], 'center', page);
    expect(out[0]!.x).toBe(300);
    expect(out[1]!.x).toBe(600);
  });
  it('uses the rotated bounds', () => {
    const a = [img('a', 0, 0, 100, 50, { rotation: 90 })];
    // the 100x50 box turned 90 degrees is 50 wide, 100 tall about the centre (50, 25): its left edge is at 25
    expect(ops.alignToPage(a, ['a'], 'left', page)[0]!.x).toBeCloseTo(-25);
  });
  it('uses the measure callback for text', () => {
    const a = [txt('t', 100, 0)];
    expect(ops.alignToPage(a, ['t'], 'right', page, measure)[0]!.x).toBe(800);
  });
  it('distributes with equal gaps and fixed ends, in any list order', () => {
    const a = [img('c', 600, 0, 100, 50), img('a', 0, 0, 100, 50), img('b', 150, 0, 100, 50)];
    const out = ops.distribute(a, ['a', 'b', 'c'], 'horizontal');
    expect(out.map((l) => l.x)).toEqual([600, 0, 300]);
  });
  it('distributes vertically and ignores fewer than three', () => {
    const a = [img('a', 0, 0, 10, 100), img('b', 0, 100, 10, 100), img('c', 0, 700, 10, 100)];
    expect(ops.distribute(a, ['a', 'b', 'c'], 'vertical').map((l) => l.y)).toEqual([0, 350, 700]);
    expect(ops.distribute(a, ['a', 'b'], 'vertical').map((l) => l.y)).toEqual([0, 100, 700]);
  });
});
