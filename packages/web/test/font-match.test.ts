import { describe, expect, it } from 'vitest';
import { matchFont, type Candidate, type Probe, type Prober } from '../src/photo/font-match.ts';
import { inkFraction } from '../src/editor/sample.ts';

/** Pretend faces: each has its own width per letter, height and weight (how much ink it puts down). */
const FACES: Record<string, { perChar: number; height: number; ink: number }> = {
  'sans/false': { perChar: 50, height: 72, ink: 0.28 },
  'sans/true': { perChar: 55, height: 72, ink: 0.4 },
  'serif/false': { perChar: 48, height: 70, ink: 0.26 },
  'serif/true': { perChar: 53, height: 70, ink: 0.38 },
  'mono/false': { perChar: 60, height: 74, ink: 0.24 },
  'display/false': { perChar: 62, height: 73, ink: 0.55 },
};
const probe: Prober = (text: string, c: Candidate): Probe => {
  const f = FACES[`${c.font}/${c.bold}`]!;
  return { width: text.length * f.perChar, height: f.height, centre: 2, ink: f.ink };
};

/** What a picture showing `face` at `size` looks like. Real regular lettering is a fifth heavier than the editor's own, bold a little, as measured. */
const HEAVIER = 1.2;
const seen = (face: string, size: number, text = 'Welcome') => {
  const f = FACES[face]!;
  return { text, width: (text.length * f.perChar * size) / 100, height: (f.height * size) / 100, ink: f.ink * (face.endsWith('true') ? 1.05 : HEAVIER) };
};

describe('matchFont', () => {
  it('finds the face and the size the words were set in', () => {
    for (const face of Object.keys(FACES)) {
      const m = matchFont(seen(face, 60), probe)!;
      expect(`${m.font}/${m.bold}`).toBe(face);
      expect(m.size).toBeCloseTo(60, 5);
    }
  });

  it('tells a bold face from a light one by how much ink it puts down, when the shapes are alike', () => {
    expect(matchFont(seen('sans/true', 40), probe)!.bold).toBe(true);
    expect(matchFont(seen('sans/false', 40), probe)!.bold).toBe(false);
  });

  it('reports where the middle of the ink sits, at the matched size', () => {
    expect(matchFont(seen('sans/false', 50), probe)!.centre).toBeCloseTo(1, 5); // 2 at size 100
  });

  it('still answers when the weight is not known, and gives up on nothing to measure', () => {
    expect(matchFont({ ...seen('serif/false', 40), ink: null }, probe)).not.toBeNull();
    expect(matchFont({ text: '  ', width: 10, height: 10, ink: 0.3 }, probe)).toBeNull();
    expect(matchFont(seen('sans/false', 40), () => null)).toBeNull();
  });

  it('keeps to plain sans when the evidence is a toss-up', () => {
    const tie = (text: string, _c: Candidate): Probe => ({ width: text.length * 50, height: 72, centre: 0, ink: 0.28 });
    const m = matchFont({ text: 'Welcome', width: 350, height: 72, ink: 0.28 * HEAVIER }, tie)!;
    expect(m).toMatchObject({ font: 'sans', bold: false });
  });
});

describe('inkFraction', () => {
  const img = (w: number, h: number, fn: (x: number, y: number) => [number, number, number]) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...fn(x, y), 255], (y * w + x) * 4);
    return { width: w, height: h, data };
  };
  it('is the share of the box the lettering covers', () => {
    const px = img(10, 10, (x) => (x < 3 ? [255, 255, 255] : [0, 0, 0]));
    expect(inkFraction(px, { x: 0, y: 0, w: 10, h: 10 }, 'rgb(0, 0, 0)')).toBeCloseTo(0.3, 5);
  });
  it('is null when nothing stands out', () => {
    expect(inkFraction(img(5, 5, () => [9, 9, 9]), { x: 0, y: 0, w: 5, h: 5 }, 'rgb(9, 9, 9)')).toBeNull();
  });
});
