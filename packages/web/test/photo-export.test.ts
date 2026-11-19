import { describe, expect, it, vi } from 'vitest';
import { baseName, buildPdf, estimateBytes, exportPage, exportPdf, exportZip, fileNameFor, fitScale, formatBytes, isIOS, maxCanvasPixels, type ExportEnv } from '../src/photo/export.ts';

describe('canvas limits', () => {
  it('uses the smaller iOS area, including iPadOS that says Macintosh', () => {
    expect(isIOS({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(true);
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(maxCanvasPixels({ userAgent: 'iPad' })).toBe(4096 * 4096);
    expect(maxCanvasPixels({ userAgent: 'Windows' })).toBe(8192 * 8192);
  });
  it('fitScale keeps a wanted scale that fits, and clamps to 0.25..4', () => {
    expect(fitScale(1000, 500, 2, 1e9)).toEqual({ scale: 2, width: 2000, height: 1000, capped: false });
    expect(fitScale(1000, 500, 10, 1e9).scale).toBe(4);
    expect(fitScale(1000, 500, 0.01, 1e9).scale).toBe(0.25);
    expect(fitScale(1000, 500, NaN, 1e9).scale).toBe(1);
  });
  it('fitScale reduces a scale that would not fit the canvas, and flags it', () => {
    const f = fitScale(3000, 2000, 4, 4096 * 4096);
    expect(f.capped).toBe(true);
    expect(f.width * f.height).toBeLessThanOrEqual(4096 * 4096);
    expect(f.width / f.height).toBeCloseTo(1.5, 1);
    expect(f.width).toBeGreaterThan(4000);
  });
  it('fitScale also limits the longest side', () => {
    const f = fitScale(100, 5000, 4, 1e12);
    expect(Math.max(f.width, f.height)).toBeLessThanOrEqual(16384);
    expect(f.capped).toBe(true);
  });
});

describe('names, sizes', () => {
  it('names files for the format', () => {
    expect(baseName('Holiday.final.PNG')).toBe('Holiday.final');
    expect(baseName('a/b:c.jpeg')).toBe('a_b_c');
    expect(baseName('')).toBe('picture');
    expect(fileNameFor('x.png', 'jpeg')).toBe('x.jpg');
    expect(fileNameFor('x.png', 'pdf')).toBe('x.pdf');
  });
  it('estimates grow with pixels and quality, and print readably', () => {
    expect(estimateBytes(2000, 1000, 'jpeg', 0.9)).toBeGreaterThan(estimateBytes(2000, 1000, 'jpeg', 0.3));
    expect(estimateBytes(2000, 1000, 'png')).toBeGreaterThan(estimateBytes(1000, 500, 'png'));
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

/** A canvas stand-in recording what is done to it. */
function fakeEnv(answer: (type: string) => Blob | null, maxPixels = 1e9) {
  const calls: string[] = [];
  const ctx = { fillStyle: '', fillRect: vi.fn(() => calls.push('fill')) };
  const made: { width: number; height: number; type?: string; quality?: number }[] = [];
  const env: ExportEnv = {
    maxPixels,
    createCanvas: (width, height) => {
      const c = {
        width,
        height,
        getContext: () => ctx,
        toBlob: (cb: BlobCallback, type?: string, quality?: number) => {
          made.push({ width: c.width, height: c.height, type, quality });
          cb(answer(type ?? 'image/png'));
        },
      };
      return c as unknown as HTMLCanvasElement;
    },
  };
  return { env, calls, ctx, made };
}
const base = { name: 'pic.png', width: 100, height: 50 };

describe('exportPage', () => {
  it('draws at the scaled size, encodes with the mime and quality, and names the file', async () => {
    const f = fakeEnv((t) => new Blob(['x'], { type: t }));
    const render = vi.fn(() => { f.calls.push('render'); });
    const r = await exportPage(render, { ...base, format: 'jpeg', quality: 0.8, scale: 2 }, f.env);
    expect(render).toHaveBeenCalledWith(f.ctx, { width: 200, height: 100, scale: 2 });
    expect(f.made[0]).toMatchObject({ type: 'image/jpeg', quality: 0.8, width: 200, height: 100 });
    expect(r).toMatchObject({ name: 'pic.jpg', width: 200, height: 100, scaled: false, format: 'jpeg' });
    expect(f.calls).toEqual(['fill', 'render']); // JPEG is filled white before the page is drawn
  });
  it('gives PNG no quality, and leaves the background clear when asked (png/webp only)', async () => {
    const f = fakeEnv((t) => new Blob(['x'], { type: t }));
    await exportPage(() => {}, { ...base, format: 'png', quality: 0.5, transparent: true }, f.env);
    expect(f.made[0]!.quality).toBeUndefined();
    expect(f.calls).toEqual([]);
    const g = fakeEnv((t) => new Blob(['x'], { type: t }));
    await exportPage(() => {}, { ...base, format: 'jpeg', transparent: true }, g.env);
    expect(g.calls).toEqual(['fill']);
    const h = fakeEnv((t) => new Blob(['x'], { type: t }));
    await exportPage(() => {}, { ...base, format: 'webp', transparent: true }, h.env);
    expect(h.calls).toEqual([]);
    const i = fakeEnv((t) => new Blob(['x'], { type: t }));
    await exportPage(() => {}, { ...base, format: 'png', transparent: false }, i.env);
    expect(i.calls).toEqual(['fill']);
  });
  it('reduces the scale to the canvas limit and says so', async () => {
    const f = fakeEnv((t) => new Blob(['x'], { type: t }), 100 * 100);
    const r = await exportPage(() => {}, { ...base, format: 'png', scale: 4 }, f.env);
    expect(r.scaled).toBe(true);
    expect(r.width * r.height).toBeLessThanOrEqual(10000);
  });
  it('names the file for what the browser really made when it falls back to PNG', async () => {
    const f = fakeEnv(() => new Blob(['x'], { type: 'image/png' }));
    const r = await exportPage(() => {}, { ...base, format: 'webp' }, f.env);
    expect(r).toMatchObject({ name: 'pic.png', format: 'png' });
  });
  it('says so when the browser gives nothing', async () => {
    const f = fakeEnv(() => null);
    await expect(exportPage(() => {}, { ...base, format: 'png' }, f.env)).rejects.toThrow(/could not make the picture/);
  });
});

/** A tiny reader: finds startxref, reads the table, and checks every offset lands on its object. */
function parsePdf(bytes: Uint8Array) {
  const latin = new TextDecoder('latin1').decode(bytes); // one char per byte, so string offsets are byte offsets
  expect(latin.startsWith('%PDF-1.4\n')).toBe(true);
  expect(latin.endsWith('%%EOF\n')).toBe(true);
  const sx = latin.lastIndexOf('startxref\n');
  const xrefAt = Number(latin.slice(sx + 10).split('\n')[0]);
  expect(latin.slice(xrefAt, xrefAt + 5)).toBe('xref\n');
  const [first, count] = latin.slice(xrefAt + 5).split('\n')[0]!.split(' ').map(Number) as [number, number];
  expect(first).toBe(0);
  const entriesAt = xrefAt + 5 + `${first} ${count}\n`.length;
  const entries: { off: number; gen: number; kind: string }[] = [];
  for (let i = 0; i < count; i++) {
    const e = latin.slice(entriesAt + i * 20, entriesAt + i * 20 + 20);
    expect(e).toMatch(/^\d{10} \d{5} [nf] \n$/); // exactly 20 bytes
    entries.push({ off: Number(e.slice(0, 10)), gen: Number(e.slice(11, 16)), kind: e[17]! });
  }
  expect(entries[0]).toEqual({ off: 0, gen: 65535, kind: 'f' });
  const trailer = latin.slice(latin.indexOf('trailer\n', xrefAt));
  expect(trailer).toContain(`/Size ${count}`);
  expect(trailer).toContain('/Root 1 0 R');
  entries.slice(1).forEach((e, i) => expect(latin.slice(e.off, e.off + `${i + 1} 0 obj\n`.length)).toBe(`${i + 1} 0 obj\n`));
  return { latin, entries, count };
}

describe('buildPdf', () => {
  const jpg = (n: number, fill: number) => new Uint8Array([0xff, 0xd8, ...Array(n).fill(fill), 0xff, 0xd9]);

  it('writes a document whose xref offsets point at the objects, with one JPEG per page', () => {
    const a = jpg(300, 7);
    const b = jpg(50, 0x0a); // includes bytes that look like newlines
    const bytes = buildPdf([{ jpeg: a, width: 800, height: 600 }, { jpeg: b, width: 100, height: 200 }]);
    const { latin, count } = parsePdf(bytes);
    expect(count).toBe(9);
    expect(latin).toContain('/Type /Pages /Kids [3 0 R 6 0 R] /Count 2');
    expect(latin).toContain('/MediaBox [0 0 800 600]');
    expect(latin).toContain('/MediaBox [0 0 100 200]');
    expect(latin).toContain('/Width 800 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 304');
    // the stream's bytes are the JPEG, exactly, and /Length is right
    const at = latin.indexOf('/Length 304');
    const start = latin.indexOf('stream\n', at) + 7;
    expect([...bytes.slice(start, start + 304)]).toEqual([...a]);
    expect(latin.slice(start + 304, start + 304 + 10)).toBe('\nendstream');
    // content stream /Length matches its text
    const m = /<< \/Length (\d+) >>\nstream\n([^\n]*)\nendstream/.exec(latin)!;
    expect(Number(m[1])).toBe(m[2]!.length);
    expect(m[2]).toBe('q 800 0 0 600 0 0 cm /Im0 Do Q');
  });

  it('sizes the page in points from the dpi', () => {
    const { latin } = parsePdf(buildPdf([{ jpeg: jpg(4, 1), width: 300, height: 150 }], 300));
    expect(latin).toContain('/MediaBox [0 0 72 36]');
  });

  it('refuses nothing to write, and a dpi that is not a number above zero', () => {
    expect(() => buildPdf([])).toThrow();
    expect(() => buildPdf([{ jpeg: jpg(1, 1), width: 1, height: 1 }], 0)).toThrow();
  });

  it('exportPdf wraps it as a blob of the right type', async () => {
    const blob = await exportPdf([{ blob: new Blob([jpg(10, 3)]), width: 10, height: 10 }]);
    expect(blob.type).toBe('application/pdf');
    parsePdf(new Uint8Array(await blob.arrayBuffer()));
  });
});

describe('exportZip', () => {
  it('numbers files with the same name', async () => {
    const z = await exportZip([{ name: 'a.png', blob: new Blob(['1']) }, { name: 'a.png', blob: new Blob(['2']) }]);
    const text = new TextDecoder('latin1').decode(new Uint8Array(await z.arrayBuffer()));
    expect(text).toContain('a.png');
    expect(text).toContain('a-2.png');
    expect(z.type).toBe('application/zip');
  });
});
