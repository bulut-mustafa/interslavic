import { describe, expect, it } from 'vitest';
import { MAX_CANVAS_SIDE, buildPdf, exportPage, exportPdf, fitScale, type ExportEnv } from '../src/photo/export.ts';

/** A canvas stand-in that keeps the canvases it made, so what was done to them can be looked at afterwards. */
function env(opts: { ctx?: boolean; blob?: (type: string) => Blob | null } = {}) {
  const canvases: { width: number; height: number; qualities: (number | undefined)[] }[] = [];
  const ctx = { fillStyle: '', fillRect: () => {} };
  const e: ExportEnv = {
    maxPixels: 1e9,
    createCanvas: (width, height) => {
      const c = {
        width,
        height,
        qualities: [] as (number | undefined)[],
        getContext: () => (opts.ctx === false ? null : ctx),
        toBlob: (cb: BlobCallback, type?: string, quality?: number) => {
          c.qualities.push(quality);
          cb(opts.blob ? opts.blob(type ?? '') : new Blob(['x'], { type }));
        },
      };
      canvases.push(c);
      return c as unknown as HTMLCanvasElement;
    },
  };
  return { e, canvases };
}
const base = { name: 'p.png', width: 100, height: 50 };

describe('exportPage: failure paths', () => {
  it('says so when the browser cannot make a 2D context', async () => {
    const { e } = env({ ctx: false });
    await expect(exportPage(() => {}, { ...base, format: 'png' }, e)).rejects.toThrow(/could not make a canvas/);
  });

  it('passes a render error on unchanged (the caller shows it) and writes no file', async () => {
    const { e, canvases } = env();
    await expect(exportPage(() => { throw new Error('boom'); }, { ...base, format: 'png' }, e)).rejects.toThrow('boom');
    expect(canvases[0]!.qualities).toEqual([]); // never encoded
  });

  it('frees the canvas even when the renderer throws', async () => {
    const { e, canvases } = env();
    await exportPage(() => { throw new Error('boom'); }, { ...base, format: 'png' }, e).catch(() => {});
    expect(canvases[0]!.width).toBe(0);
  });

  it('frees the canvas after encoding, and also when the browser gives nothing', async () => {
    const ok = env();
    await exportPage(() => {}, { ...base, format: 'png' }, ok.e);
    expect([ok.canvases[0]!.width, ok.canvases[0]!.height]).toEqual([0, 0]);
    const none = env({ blob: () => null });
    await expect(exportPage(() => {}, { ...base, format: 'png' }, none.e)).rejects.toThrow();
    expect([none.canvases[0]!.width, none.canvases[0]!.height]).toEqual([0, 0]);
  });
});

describe('exportPage: quality', () => {
  const q = async (format: 'jpeg' | 'webp' | 'png', quality?: number) => {
    const { e, canvases } = env();
    await exportPage(() => {}, { ...base, format, quality }, e);
    return canvases[0]!.qualities[0];
  };
  it('defaults to 0.92 for lossy formats, clamps to 0..1, and is never sent for PNG', async () => {
    expect(await q('jpeg')).toBe(0.92);
    expect(await q('webp', 7)).toBe(1);
    expect(await q('jpeg', -3)).toBe(0);
    expect(await q('jpeg', 0)).toBe(0); // 0 is a real choice, not "missing"
    expect(await q('png', 0.1)).toBeUndefined();
  });
});

describe('fitScale invariants over many page sizes', () => {
  it('never exceeds the pixel cap or the side limit, never exceeds the wanted scale, and keeps the shape', () => {
    const sizes = [[1, 1], [3, 7000], [7000, 3], [1920, 1080], [4000, 3000], [16000, 16000], [100, 5000], [2400, 2400]];
    for (const [w, h] of sizes as [number, number][])
      for (const wanted of [0.25, 1, 2, 3.7, 4])
        for (const cap of [4096 * 4096, 8192 * 8192]) {
          const f = fitScale(w, h, wanted, cap);
          const tag = `${w}x${h} @${wanted} cap ${cap} -> ${JSON.stringify(f)}`;
          expect(f.width * f.height, tag).toBeLessThanOrEqual(cap);
          expect(Math.max(f.width, f.height), tag).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
          expect(f.scale, tag).toBeLessThanOrEqual(wanted + 1e-12);
          expect(f.width, tag).toBeGreaterThanOrEqual(1);
          expect(f.height, tag).toBeGreaterThanOrEqual(1);
          expect(f.capped, tag).toBe(f.scale < wanted);
        }
  });
});

describe('buildPdf: numbers in the page boxes', () => {
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b);
  it('writes fractional point sizes with at most 3 decimals and never an exponent', () => {
    const t = text(buildPdf([{ jpeg: jpg, width: 1001, height: 333 }], 96));
    expect(t).toContain('/MediaBox [0 0 750.75 249.75]');
    expect(t).toContain('q 750.75 0 0 249.75 0 0 cm');
    const tiny = text(buildPdf([{ jpeg: jpg, width: 1, height: 1 }], 1e6));
    expect(tiny).not.toMatch(/e-/);
    expect(tiny).toContain('/MediaBox [0 0 0 0]');
  });
  it('keeps many pages in order, each with its own image object and size', async () => {
    const pages = Array.from({ length: 12 }, (_, i) => ({ blob: new Blob([jpg]), width: 10 + i, height: 20 + i }));
    const t = text(new Uint8Array(await (await exportPdf(pages)).arrayBuffer()));
    expect(t).toContain('/Count 12');
    for (let i = 0; i < 12; i++) {
      const page = 3 + i * 3;
      expect(t).toContain(`${page} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${10 + i} ${20 + i}] /Resources << /XObject << /Im0 ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`);
    }
    expect(t).toContain('/Size 39');
  });
});
