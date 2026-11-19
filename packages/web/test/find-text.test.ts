import { describe, expect, it } from 'vitest';
import { layersFromLines, luminance } from '../src/photo/find-text.ts';
import type { OcrLine } from '../src/photo/ocr.ts';

const line = (text: string, over: Partial<OcrLine> = {}): OcrLine => ({ text, confidence: 90, bbox: { x0: 100, y0: 200, x1: 500, y1: 260 }, ...over });
const white = () => 'rgb(250, 250, 250)';

describe('luminance', () => {
  it('is 0 for black, 1 for white', () => {
    expect(luminance('rgb(0, 0, 0)')).toBe(0);
    expect(luminance('rgb(255, 255, 255)')).toBeCloseTo(1);
  });
  it('treats an unreadable colour as light', () => {
    expect(luminance('nonsense')).toBe(1);
  });
});

describe('layersFromLines', () => {
  it('puts a layer where the line was, as large as the line was, with an erase patch around it', () => {
    const { layers } = layersFromLines([line('Hello world')], white);
    const l = layers[0]!;
    expect(l.text).toBe('Hello world');
    expect(l.original).toBe('Hello world');
    expect(l.x).toBe(100);
    expect(l.style.size).toBe(Math.round(60 * 0.78));
    expect(l.maxWidth).toBe(406);
    expect(l.erase).toEqual({ x: 97, y: 197, w: 406, h: 66, color: 'rgb(250, 250, 250)' });
    // the text sits inside the line's box, vertically centred
    expect(l.y).toBeGreaterThanOrEqual(200);
    expect(l.y + l.style.size * l.style.lineHeight).toBeLessThanOrEqual(260 + 1);
  });

  it('writes dark text on a light background and light text on a dark one', () => {
    expect(layersFromLines([line('Hello')], white).layers[0]!.style.color).toBe('#111111');
    expect(layersFromLines([line('Hello')], () => 'rgb(10, 10, 20)').layers[0]!.style.color).toBe('#ffffff');
  });

  it('leaves out lines the reader is unsure of, empty lines and lines with no letters, counting only real text', () => {
    const { layers, skipped } = layersFromLines([line('Sure'), line('unsure', { confidence: 20 }), line('   '), line('-- ..'), line('42')], white);
    expect(layers.map((l) => l.text)).toEqual(['Sure', '42']);
    expect(skipped).toBe(2);
  });

  it('leaves out a box too small to be text', () => {
    expect(layersFromLines([line('Tiny', { bbox: { x0: 0, y0: 0, x1: 3, y1: 3 } })], white).layers).toEqual([]);
  });

  it('gives each layer its own id', () => {
    const { layers } = layersFromLines([line('One'), line('Two')], white);
    expect(new Set(layers.map((l) => l.id)).size).toBe(2);
  });
});

describe('fitting the found text to the original', () => {
  it('takes the lettering colour from the picture when it can', () => {
    const { layers } = layersFromLines([line('Hello')], white, 40, { inkOf: () => '#ffd878' });
    expect(layers[0]!.style.color).toBe('#ffd878');
  });

  it('falls back to a readable colour when the lettering colour is unknown', () => {
    expect(layersFromLines([line('Hello')], white, 40, { inkOf: () => null }).layers[0]!.style.color).toBe('#111111');
  });

  it('sizes the type so the text is as wide as the line was', () => {
    // 10px per character per 10px of size: "Hello" (5 letters) at size s is 5 * s wide.
    const widthAt = (t: string, s: number) => t.length * s;
    const { layers } = layersFromLines([line('Hello', { bbox: { x0: 0, y0: 0, x1: 300, y1: 100 } })], white, 40, { widthAt });
    expect(layers[0]!.style.size).toBe(60); // 300 / 5
  });
});
