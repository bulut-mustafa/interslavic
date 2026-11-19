import { describe, expect, it, vi } from 'vitest';
import { MAX_SOURCE_PIXELS, PictureError, decodePicture, downscaleSize, isHeic, needsDownscale, sourceSizeOf, type DecodeEnv } from '../src/photo/decode.ts';

const bytes = (...n: number[]) => new Uint8Array(n);
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const png = (w: number, h: number) => bytes(0x89, ...ascii('PNG'), 13, 10, 26, 10, ...be32(13), ...ascii('IHDR'), ...be32(w), ...be32(h), 8, 6, 0, 0, 0);
const jpeg = (w: number, h: number) => bytes(0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0);
const f = (parts: Uint8Array | string, name: string, type = '') => new File([parts as BlobPart], name, { type });

function env(w: number, h: number, fail = false): DecodeEnv & { scaled: ReturnType<typeof vi.fn>; opts: ImageBitmapOptions[]; closed: number } {
  const e = {
    opts: [] as ImageBitmapOptions[],
    closed: 0,
    scaled: vi.fn((_f: unknown, width: number, height: number) => ({ canvas: true, width, height })),
    createImageBitmap: async (_b: Blob, o: ImageBitmapOptions) => {
      e.opts.push(o);
      if (fail) throw new Error('InvalidStateError');
      return { width: w, height: h, close: () => void e.closed++ };
    },
    scale: (...a: [unknown, number, number]) => e.scaled(...a),
  };
  return e;
}

describe('size rules', () => {
  it('knows when a picture is made smaller, and to what', () => {
    expect(needsDownscale(2400, 100)).toBe(false);
    expect(needsDownscale(2401, 100)).toBe(true);
    expect(downscaleSize(4800, 3600)).toEqual({ width: 2400, height: 1800 });
    expect(downscaleSize(100, 50)).toEqual({ width: 100, height: 50 });
    expect(downscaleSize(10000, 1)).toEqual({ width: 2400, height: 1 });
  });
});

describe('sourceSizeOf', () => {
  it('reads PNG, JPEG, GIF and WebP headers', async () => {
    expect(await sourceSizeOf(f(png(640, 480), 'a.png'))).toEqual({ width: 640, height: 480 });
    expect(await sourceSizeOf(f(jpeg(3000, 2000), 'a.jpg'))).toEqual({ width: 3000, height: 2000 });
    expect(await sourceSizeOf(f(bytes(...ascii('GIF89a'), 20, 0, 10, 0, 0, 0), 'a.gif'))).toEqual({ width: 20, height: 10 });
    const vp8x = bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii('VP8X'), 10, 0, 0, 0, 0, 0, 0, 0, 99, 0, 0, 49, 0, 0);
    expect(await sourceSizeOf(f(vp8x, 'a.webp'))).toEqual({ width: 100, height: 50 });
  });
  it('skips other segments before the JPEG frame header, and says null for the unknown', async () => {
    const app = [0xff, 0xe1, 0, 6, 1, 2, 3, 4];
    const j = bytes(0xff, 0xd8, ...app, 0xff, 0xc2, 0, 11, 8, 0, 5, 0, 7, 1, 1, 0x11, 0);
    expect(await sourceSizeOf(f(j, 'a.jpg'))).toEqual({ width: 7, height: 5 });
    expect(await sourceSizeOf(f('hello', 'a.txt'))).toBeNull();
    expect(await sourceSizeOf(f(bytes(0xff, 0xd8), 'a.jpg'))).toBeNull();
  });
});

describe('isHeic', () => {
  it('goes by type, extension or the file\'s first bytes', async () => {
    expect(await isHeic(f('x', 'a.HEIC'))).toBe(true);
    expect(await isHeic(f('x', 'a.bin', 'image/heif'))).toBe(true);
    expect(await isHeic(f(bytes(0, 0, 0, 24, ...ascii('ftypheic'), 0), 'noext'))).toBe(true);
    expect(await isHeic(f(png(1, 1), 'a.png'))).toBe(false);
  });
});

describe('decodePicture', () => {
  it('asks for the camera\'s turn explicitly and returns the picture as it is when small', async () => {
    const e = env(800, 600);
    const d = await decodePicture(f(png(800, 600), 'a.png', 'image/png'), 2400, e);
    expect(e.opts).toEqual([{ imageOrientation: 'from-image' }]);
    expect(d).toMatchObject({ width: 800, height: 600, srcWidth: 800, srcHeight: 600, scaled: false });
    expect(e.scaled).not.toHaveBeenCalled();
  });
  it('makes a large one smaller, frees the full bitmap, and says so', async () => {
    const e = env(4800, 3600);
    const d = await decodePicture(f(png(4800, 3600), 'a.png', 'image/png'), 2400, e);
    expect(e.scaled).toHaveBeenCalledWith(expect.anything(), 2400, 1800);
    expect(e.closed).toBe(1);
    expect(d).toMatchObject({ width: 2400, height: 1800, srcWidth: 4800, srcHeight: 3600, scaled: true });
  });
  it('refuses an empty file, with words', async () => {
    await expect(decodePicture(f('', 'a.png', 'image/png'), 2400, env(1, 1))).rejects.toMatchObject({ problem: 'empty' });
  });
  it('refuses a picture over the pixel cap before decoding it', async () => {
    const e = env(1, 1);
    const side = Math.ceil(Math.sqrt(MAX_SOURCE_PIXELS)) + 1;
    const p = decodePicture(f(png(side, side), 'big.png', 'image/png'), 2400, e);
    await expect(p).rejects.toMatchObject({ problem: 'too-large' });
    await expect(p).rejects.toThrow(/megapixels/);
    expect(e.opts).toHaveLength(0);
  });
  it('explains a HEIC the browser cannot open, but opens one it can', async () => {
    await expect(decodePicture(f('x', 'IMG_1.HEIC', 'image/heic'), 2400, env(1, 1, true))).rejects.toMatchObject({ problem: 'heic' });
    const d = await decodePicture(f('x', 'IMG_1.HEIC', 'image/heic'), 2400, env(10, 10));
    expect(d.width).toBe(10);
  });
  it('explains a file that is not a picture, and a damaged one', async () => {
    await expect(decodePicture(f('x', 'a.pdf', 'application/pdf'), 2400, env(1, 1, true))).rejects.toMatchObject({ problem: 'unsupported' });
    const err = await decodePicture(f('x', 'a.png', 'image/png'), 2400, env(1, 1, true)).catch((e) => e);
    expect(err).toBeInstanceOf(PictureError);
    expect(err.problem).toBe('corrupt');
    expect(err.message).toContain('a.png');
  });
  it('refuses a zero-size result', async () => {
    await expect(decodePicture(f('x', 'a.png', 'image/png'), 2400, env(0, 0))).rejects.toMatchObject({ problem: 'corrupt' });
  });
});
