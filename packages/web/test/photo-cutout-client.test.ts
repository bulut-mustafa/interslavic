import { describe, expect, it, vi } from 'vitest';
import { CUTOUT_MODELS, newMatte, type Rgba } from '../src/photo/cutout.ts';
import { buildCutout, removeBackground, stageFraction, stageText, type Decoded, type Segmenter, type Stage } from '../src/photo/cutout-client.ts';

const solid = (w: number, h: number): Rgba => ({ w, h, data: new Uint8ClampedArray(w * h * 4).fill(200) });
const decoded = (): Decoded => ({ picture: solid(8, 4), small: solid(4, 2), sourceWidth: 16 });
const canvas = (p: Rgba) => ({ width: p.w, height: p.h, data: p.data }) as unknown as HTMLCanvasElement;

function fakeSegmenter(log: string[] = [], matte = { w: 4, h: 2, data: Uint8ClampedArray.from([0, 0, 255, 255, 0, 0, 255, 255]) }): Segmenter {
  return {
    load: async (model, onProgress) => {
      log.push(`load ${model.repo} ${model.dtype}`);
      onProgress({ fraction: 0.5, file: 'a' });
      onProgress({ fraction: 1, file: 'a' });
    },
    segment: async (rgba, w, h) => {
      log.push(`segment ${rgba.length} ${w}x${h}`);
      return matte;
    },
    dispose: () => void log.push('dispose'),
  };
}

describe('removeBackground', () => {
  it('runs read, load, outline in order and gives the matte at the picture size', async () => {
    const log: string[] = [];
    const stages: Stage[] = [];
    const r = await removeBackground(new Blob(['x']), {
      model: CUTOUT_MODELS[0]!,
      decode: async () => decoded(),
      makeSegmenter: () => fakeSegmenter(log),
      toCanvas: canvas,
      onStage: (s) => stages.push(s),
    });
    expect(log).toEqual(['load Xenova/modnet q8', 'segment 32 4x2', 'dispose']);
    expect(stages.map((s) => s.kind)).toEqual(['reading', 'model', 'model', 'model', 'outline', 'done']);
    expect([r.width, r.height, r.matte.w, r.matte.h]).toEqual([8, 4, 8, 4]);
    expect(r.scale).toBe(0.5);
    // the left half of the small matte is background, the right half subject, and so on at the larger size
    expect(r.matte.data[0]).toBe(0);
    expect(r.matte.data[7]).toBe(255);
    // the cutout's alpha is the matte
    expect((r.cutout as unknown as { data: Uint8ClampedArray }).data[3]).toBe(0);
    expect((r.cutout as unknown as { data: Uint8ClampedArray }).data[7 * 4 + 3]).toBe(200);
  });

  it('stops at once when cancelled during the download, ends the worker and says so', async () => {
    const log: string[] = [];
    const ctl = new AbortController();
    const seg: Segmenter = { ...fakeSegmenter(log), load: () => new Promise<void>(() => {}) };
    seg.dispose = () => void log.push('dispose');
    const p = removeBackground(new Blob(['x']), { decode: async () => decoded(), makeSegmenter: () => seg, toCanvas: canvas, signal: ctl.signal });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(log).toContain('dispose');
  });

  it('does nothing when already cancelled', async () => {
    const decode = vi.fn();
    const ctl = new AbortController();
    ctl.abort();
    await expect(removeBackground(new Blob(['x']), { decode, signal: ctl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(decode).not.toHaveBeenCalled();
  });

  it('passes a model failure on and still lets the worker go', async () => {
    const log: string[] = [];
    const seg = { ...fakeSegmenter(log), load: async () => { throw new Error('Failed to fetch'); } };
    await expect(removeBackground(new Blob(['x']), { decode: async () => decoded(), makeSegmenter: () => seg, toCanvas: canvas })).rejects.toThrow('Failed to fetch');
    expect(log).toEqual(['dispose']);
  });
});

describe('progress text', () => {
  it('says the percentage, then that the model is starting', () => {
    expect(stageText({ kind: 'model', fraction: 0.42 })).toBe('Getting the model… 42%');
    expect(stageText({ kind: 'model', fraction: 1 })).toContain('Starting the model');
    expect(stageText({ kind: 'outline' })).toBe('Finding the outline…');
    expect(stageText({ kind: 'done' })).toBeNull();
    expect(stageFraction({ kind: 'model', fraction: 0.3 })).toBe(0.3);
    expect(stageFraction({ kind: 'outline' })).toBeNull();
  });
});

describe('buildCutout', () => {
  it('applies the matte and trims, returning where the piece sits', () => {
    const pic = solid(6, 6);
    const m = newMatte(6, 6);
    m.data[2 * 6 + 2] = 255;
    const out = buildCutout(canvas(pic), m, { trim: true }, canvas, (c) => ({ w: c.width, h: c.height, data: (c as unknown as { data: Uint8ClampedArray }).data }));
    expect(out.box).toEqual({ x: 2, y: 2, w: 1, h: 1 });
  });
});
