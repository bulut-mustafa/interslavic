import { describe, expect, it } from 'vitest';
import { caretAt, glyphsFrom, isCovered, layersFromRuns, lineAround, nearestGlyph, runsIn, stretch, textOf, unionBox, wordAround } from '../src/photo/live-text.ts';
import type { OcrLine } from '../src/photo/ocr.ts';

const line = (text: string, y0: number, over: Partial<OcrLine> = {}): OcrLine => ({ text, confidence: 90, bbox: { x0: 100, y0, x1: 100 + text.length * 20, y1: y0 + 40 }, ...over });
const lines = [line('Welcome to our shop', 100), line('Open daily', 200)];
const text = (gs: { text: string }[]) => gs.map((g) => g.text).join('');

describe('glyphsFrom', () => {
  it('makes a glyph of each letter and of each space between words, in reading order', () => {
    const g = glyphsFrom(lines);
    expect(text(g)).toBe('Welcome to our shopOpen daily');
    expect(g.map((x) => x.index)).toEqual(g.map((_, i) => i));
    expect(new Set(g.filter((x) => x.line === 1).map((x) => x.text)).has(' ')).toBe(true);
  });

  it('lays the letters of a word side by side across the word, wide letters wider than narrow ones', () => {
    const g = glyphsFrom([{ ...line('mi', 0), words: [{ text: 'mi', confidence: 90, bbox: { x0: 0, y0: 0, x1: 100, y1: 40 } }] }]);
    expect(g[0]!.box.x0).toBe(0);
    expect(g[0]!.box.x1).toBeCloseTo(g[1]!.box.x0, 5);
    expect(g[1]!.box.x1).toBeCloseTo(100, 5);
    expect(g[0]!.box.x1 - g[0]!.box.x0).toBeGreaterThan(g[1]!.box.x1 - g[1]!.box.x0); // m wider than i
  });

  it('uses the reader\'s own letter boxes when it gives them', () => {
    const w = { text: 'ab', confidence: 90, bbox: { x0: 0, y0: 0, x1: 100, y1: 40 }, symbols: [{ text: 'a', bbox: { x0: 0, y0: 0, x1: 70, y1: 40 } }, { text: 'b', bbox: { x0: 70, y0: 0, x1: 100, y1: 40 } }] };
    const g = glyphsFrom([{ ...line('ab', 0), words: [w] }]);
    expect(g.map((x) => x.box.x1)).toEqual([70, 100]);
  });

  it('puts words left to right, and a space only between two words of a line', () => {
    const g = glyphsFrom([{ ...line('Hi there', 0), words: [
      { text: 'there', confidence: 90, bbox: { x0: 300, y0: 0, x1: 400, y1: 40 } },
      { text: 'Hi', confidence: 90, bbox: { x0: 100, y0: 0, x1: 160, y1: 40 } },
    ] }]);
    expect(text(g)).toBe('Hi there');
  });

  it('leaves out unsure lines, unsure words, and marks with no letter or digit', () => {
    const g = glyphsFrom([line('Sure', 0), line('unsure', 50, { confidence: 10 }), { ...line('Hi --', 100), words: [
      { text: 'Hi', confidence: 90, bbox: { x0: 0, y0: 100, x1: 40, y1: 140 } },
      { text: '--', confidence: 90, bbox: { x0: 50, y0: 100, x1: 90, y1: 140 } },
      { text: 'meh', confidence: 5, bbox: { x0: 100, y0: 100, x1: 140, y1: 140 } },
    ] }]);
    expect(text(g)).toBe('SureHi');
  });
});

describe('picking letters', () => {
  const g = glyphsFrom(lines);
  const centre = (i: number) => ({ x: (g[i]!.box.x0 + g[i]!.box.x1) / 2, y: (g[i]!.box.y0 + g[i]!.box.y1) / 2 });

  it('finds the letter under a point, or the nearest one', () => {
    expect(nearestGlyph(g, centre(3))).toBe(3);
    expect(nearestGlyph(g, { x: 5, y: 210 })).toBe(g.findIndex((x) => x.line === 1)); // left of the second line: its first letter
    expect(nearestGlyph(g, { x: 900, y: 110 })).toBe(g.filter((x) => x.line === 0).length - 1);
    expect(nearestGlyph([], { x: 0, y: 0 })).toBeNull();
  });

  it('puts the caret on the near side of the letter the point is on', () => {
    const c = centre(3);
    expect(caretAt(g, { x: c.x - 3, y: c.y })).toBe(3); // left half: before the letter
    expect(caretAt(g, { x: c.x + 3, y: c.y })).toBe(4); // right half: after it
  });

  it('picks nothing when the two ends are the same gap, and orders them otherwise', () => {
    expect(stretch(4, 4)).toBeNull();
    expect(stretch(7, 2)).toEqual([2, 7]);
  });

  it('finds the word around a letter, and the line around it', () => {
    const at = g.findIndex((x) => x.line === 0 && x.text === 'o' ); // the o of "Welcome"
    expect(text(g.slice(...wordAround(g, at)))).toBe('Welcome');
    expect(text(g.slice(...lineAround(g, at)))).toBe('Welcome to our shop');
  });

  it('splits what is picked into one run for each line, without spaces at the ends', () => {
    const from = g.findIndex((x) => x.line === 0 && x.text === 't'); // the t of "to"... after "Welcome "
    const lineEnd = lineAround(g, from)[1];
    const runs = runsIn(g, [from - 1, lineEnd + 4]); // starts on the space before "to", runs into the next line
    expect(runs.map(text)).toEqual(['to our shop', 'Open']);
  });

  it('picks part of a word', () => {
    const w = wordAround(g, 0);
    expect(text(runsIn(g, [w[0] + 2, w[0] + 5])[0]!)).toBe('lco');
  });

  it('knows the box around a run', () => {
    const run = runsIn(g, [1, 4])[0]!;
    const b = unionBox(run);
    expect(b.x0).toBe(g[1]!.box.x0);
    expect(b.x1).toBe(g[3]!.box.x1);
  });

  it('says a letter is covered when a text layer sits over it', () => {
    const c = g[0]!.box;
    const cover = { x: c.x0 - 3, y: c.y0 - 3, w: c.x1 - c.x0 + 6, h: c.y1 - c.y0 + 6 };
    expect(isCovered(g[0]!, [cover])).toBe(true);
    expect(isCovered(g[g.length - 1]!, [cover])).toBe(false);
  });
});

describe('layersFromRuns', () => {
  const g = glyphsFrom(lines);
  const ring = () => 'rgb(40, 90, 120)';
  const word = () => runsIn(g, wordAround(g, 0));
  it('makes one layer for each run, where the letters were, with their own text and a patch over them', () => {
    const from = g.findIndex((x) => x.line === 0 && x.text === 'o' && g[x.index + 1]?.text === 'u'); // the o of "our"
    const runs = runsIn(g, [from, from + 14]);
    const layers = layersFromRuns(runs, { ringColorOf: ring });
    expect(layers.map((l) => l.text)).toEqual(runs.map(textOf));
    const first = unionBox(runs[0]!);
    expect(layers[0]!.x).toBe(first.x0);
    expect(layers[0]!.erase).toMatchObject({ x: first.x0 - 3, y: first.y0 - 3, color: 'rgb(40, 90, 120)' });
    expect(layers[0]!.original).toBe(layers[0]!.text);
  });
  it('takes the lettering colour from the picture, else a readable one', () => {
    expect(layersFromRuns(word(), { ringColorOf: ring, inkOf: () => '#ffd878' })[0]!.style.color).toBe('#ffd878');
    expect(layersFromRuns(word(), { ringColorOf: ring })[0]!.style.color).toBe('#ffffff');
  });
  it('sizes the type so the text is as wide as the letters were', () => {
    const widthAt = (t: string, s: number) => t.length * s * 0.5;
    const run = word();
    const width = unionBox(run[0]!).x1 - unionBox(run[0]!).x0;
    const [layer] = layersFromRuns(run, { ringColorOf: ring, widthAt });
    expect(layer!.style.size).toBe(Math.round(width / (0.5 * 'Welcome'.length)));
  });
});

describe('matching the look of the letters', () => {
  const g = glyphsFrom(lines);
  const ring = () => 'rgb(40, 90, 120)';
  it('uses the matched font, weight and size, and keeps the middle of the lettering where it was', () => {
    const run = runsIn(g, wordAround(g, 0));
    const b = unionBox(run[0]!);
    const [layer] = layersFromRuns(run, { ringColorOf: ring, matchStyle: () => ({ font: 'serif', bold: true, size: 50, centre: 4 }) });
    expect(layer!.style).toMatchObject({ font: 'serif', bold: true, size: 50 });
    expect(layer!.y + (50 * 1.15) / 2 + 4).toBeCloseTo((b.y0 + b.y1) / 2, 5);
  });
  it('falls back to a width fit when nothing matches', () => {
    const [layer] = layersFromRuns(runsIn(g, wordAround(g, 0)), { ringColorOf: ring, matchStyle: () => null, widthAt: (t, s) => t.length * s });
    expect(layer!.style.font).toBe('sans');
    expect(layer!.style.size).toBeGreaterThan(0);
  });
  it('keeps letters that were all capitals in capitals', () => {
    const caps = glyphsFrom([line('GRAND OPENING', 0)]);
    expect(layersFromRuns(runsIn(caps, [0, caps.length]), { ringColorOf: ring })[0]!.style.uppercase).toBe(true);
    expect(layersFromRuns(runsIn(g, wordAround(g, 0)), { ringColorOf: ring })[0]!.style.uppercase).toBe(false);
  });
});
