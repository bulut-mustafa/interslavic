import { describe, expect, it } from 'vitest';
import * as H from '../src/editor/history.ts';
import { newLayer } from '../src/editor/layers.ts';
import { baseEdited, docEdited, emptyDoc, fromV1, historyFromV1, isImage, isShape, isText, outputSize, type ImageLayer, type ShapeLayer } from '../src/photo/doc.ts';

const image: ImageLayer = { kind: 'image', id: 'i', src: 'f1', x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, blend: 'normal' };
const shape: ShapeLayer = { kind: 'shape', id: 's', shape: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, blend: 'normal' };

describe('photo doc', () => {
  it('tells the layer kinds apart', () => {
    const t = newLayer({ x: 0, y: 0 });
    expect([isText(t), isImage(t), isShape(t)]).toEqual([true, false, false]);
    expect([isText(image), isImage(image), isShape(image)]).toEqual([false, true, false]);
    expect([isText(shape), isImage(shape), isShape(shape)]).toEqual([false, false, true]);
  });

  it('upgrades an old text-only page and every undo step', () => {
    const a = newLayer({ x: 1, y: 1, text: 'a' });
    let h = H.start([a]);
    h = H.push(h, []);
    h = H.undo(h);
    const up = historyFromV1(h);
    expect(up.present).toEqual(fromV1([a]));
    expect(up.future).toHaveLength(1);
    expect(up.future[0]!.layers).toEqual([]);
  });

  it('knows when the picture or the page has been edited', () => {
    expect(baseEdited({})).toBe(false);
    expect(baseEdited({ adjust: { brightness: 0 } })).toBe(false);
    expect(baseEdited({ adjust: { brightness: 10 } })).toBe(true);
    expect(baseEdited({ turns: 1 })).toBe(true);
    expect(docEdited(emptyDoc())).toBe(false);
    expect(docEdited({ ...emptyDoc(), layers: [shape] })).toBe(true);
  });

  it('sizes the output: crop, then quarter turns swap the sides', () => {
    expect(outputSize(400, 300, {})).toEqual({ w: 400, h: 300 });
    expect(outputSize(400, 300, { crop: { x: 0, y: 0, w: 100, h: 50 } })).toEqual({ w: 100, h: 50 });
    expect(outputSize(400, 300, { turns: 1 })).toEqual({ w: 300, h: 400 });
    expect(outputSize(400, 300, { turns: 2 })).toEqual({ w: 400, h: 300 });
  });
});
