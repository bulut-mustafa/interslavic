import { describe, expect, it } from 'vitest';
import { isReadableLine, readableLines, READABLE } from '../src/photo/readable.ts';
import { layersFromLines } from '../src/photo/find-text.ts';
import { glyphsFrom } from '../src/photo/live-text.ts';
import type { OcrLine, OcrWord } from '../src/photo/ocr.ts';

/**
 * Fixtures are lines the real tesseract.js 7 (blocks output, eng/rus/ukr) returned
 * on text-free pictures (gravel, foliage, noise, wood: the "false" ones) and on
 * rendered text in English, Russian and Ukrainian (the "real" ones), with the
 * numbers it gave. Measured: 2000 false lines, highest confidence 56; 495 real
 * lines, median 96, 5th percentile 69.
 */
const box = { x0: 10, y0: 10, x1: 410, y1: 60 };
const mk = (text: string, confidence: number, wordConf: number[]): OcrLine => {
  const parts = text.split(' ');
  return {
    text,
    confidence,
    bbox: box,
    words: parts.map((t, i): OcrWord => ({ text: t, confidence: wordConf[i] ?? confidence, bbox: { x0: 10 + i * 60, y0: 10, x1: 60 + i * 60, y1: 60 } })),
  };
};
const white = () => 'rgb(255, 255, 255)';

// Lines read from pictures with no lettering at all (every one passed the old test: 40+ and two letters).
const FALSE_LINES: OcrLine[] = [
  mk('A 4 Lg Re ie IR wu', 55, [82, 92, 35, 79, 47, 25, 24]), // foliage_big, eng: the most confident false line
  mk('. N dvs ¥', 49, [36, 63, 31, 65]),
  mk('«їі. чу.', 52, [49, 55]), // foliage, ukr
  mk('ще 2 4 ща ж. |', 53, [61, 51, 70, 12, 29, 95]),
  mk('ь. < » 6:77 Эф) № |', 40, [33, 55, 65, 0, 9, 43, 77]),
  mk('TA yA A', 42, [31, 34, 61]), // scratches
  mk('5 єс ще: Фо: " За с« «ое ог ? о г', 44, [30, 36, 20, 0, 89, 28, 0, 67, 43, 72, 77, 89]), // gravel: words as sure as 89
  mk('с с', 54, [54, 54]), // noise_gauss, ukr
  mk('=', 56, [56]), // wood: the highest line confidence on text-free pictures
  mk('|', 95, [95]), // a lone character the reader was sure of
  mk('4', 92, [92]),
  mk('C000 000000000000 90000000 0000900000000 00', 19, [19]), // fence: rows of the same character
];

const REAL_LINES: OcrLine[] = [
  mk('Grand opening this Saturday', 96, [96, 96, 95, 96]),
  mk('Welcome to our shop', 95, [96, 94, 96, 95]),
  mk('Open every day, 9 to 5', 93, [96, 78, 96, 94, 91, 95]),
  mk('Добро пожаловать в наш магазин', 94, [96, 92, 96, 97, 94]),
  mk('Свіжий хліб і кава', 92, [90, 94, 96, 95]),
  mk('Hello world test', 96, [96, 96, 96]),
  mk('Go', 90, [90]), // a short sign
  mk('12:34', 88, [88]),
  mk('Не прислоняться', 72, [70, 73]),
];

describe('isReadableLine', () => {
  it('rejects every line read from text-free pictures', () => {
    for (const l of FALSE_LINES) expect(isReadableLine(l), l.text).toBe(false);
  });
  it('keeps real lettering of every language and size', () => {
    for (const l of REAL_LINES) expect(isReadableLine(l), l.text).toBe(true);
  });
  it('a line below the measured false-text ceiling needs a word of three letters that the reader itself is sure of', () => {
    // 3+ letter words on gravel reached 67 (never 70) while their lines stayed under 56.
    expect(isReadableLine(mk('Hello again', 60, [75, 50]))).toBe(true);
    expect(isReadableLine(mk('Hello again', 60, [66, 50]))).toBe(false);
    expect(isReadableLine(mk('Hello again', 54, [90, 90]))).toBe(false); // line under 55
    expect(isReadableLine(mk('to be', 60, [90, 90]))).toBe(false); // two-letter words are not an anchor below 75
  });
  it('a sure line (75+) needs only a word of two letters or two digits', () => {
    expect(isReadableLine(mk('to be', 80, [80, 80]))).toBe(true);
    expect(isReadableLine(mk('42', 80, [80]))).toBe(true);
    expect(isReadableLine(mk('x', 99, [99]))).toBe(false);
    expect(isReadableLine(mk('- | .', 99, [99, 99, 99]))).toBe(false);
  });
  it('documents the borderline: small grey side text, a timestamp beside a word the reader garbled, is dropped', () => {
    expect(isReadableLine(mk('12:34 - 2 пе\\у', 72, [87, 53, 93, 54]))).toBe(false); // measured, ru screenshot: 20 of 495 real lines were lost this way
  });
  it('honours a caller floor on top of the rules', () => {
    expect(isReadableLine(mk('Hello world', 80, [80, 80]), 85)).toBe(false);
    expect(isReadableLine(mk('Hello world', 80, [80, 80]), 40)).toBe(true);
  });
  it('works on a line the reader gave no words for', () => {
    expect(isReadableLine({ text: 'Hello world', confidence: 90, bbox: box })).toBe(true);
    expect(isReadableLine({ text: '| |', confidence: 90, bbox: box })).toBe(false);
  });
  it('keeps the levels in step with what was measured', () => {
    expect(READABLE.sureLine).toBeGreaterThan(56);
    expect(READABLE.fairLine).toBeGreaterThanOrEqual(55);
    expect(READABLE.anchorWord).toBeGreaterThan(67);
  });
  it('readableLines finds nothing in a picture with no text', () => {
    expect(readableLines(FALSE_LINES)).toEqual([]);
    expect(readableLines([...FALSE_LINES, ...REAL_LINES])).toHaveLength(REAL_LINES.length);
  });
});

describe('both ways of using a read share the filter', () => {
  it('layersFromLines makes no layer from text-free lines, so nothing can be translated', () => {
    const out = layersFromLines(FALSE_LINES, white);
    expect(out.layers).toEqual([]);
    expect(out.skipped).toBe(FALSE_LINES.length);
  });
  it('glyphsFrom finds no letters in text-free lines ("No text found")', () => {
    expect(glyphsFrom(FALSE_LINES)).toEqual([]);
  });
  it('real text is still found next to garbage lines, by both', () => {
    const lines = [...FALSE_LINES, ...REAL_LINES.slice(0, 3)];
    expect(layersFromLines(lines, white).layers.map((l) => l.text)).toEqual(REAL_LINES.slice(0, 3).map((l) => l.text));
    const g = glyphsFrom(lines);
    expect(new Set(g.map((x) => x.line)).size).toBe(3);
  });
});
