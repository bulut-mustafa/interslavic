/**
 * Turning a picture file into something the editor can draw, with the care a
 * phone needs: the camera's EXIF turn is applied, a huge picture is made
 * smaller before it fills the memory, and a file the browser cannot read
 * comes back as a plain sentence instead of a stack trace.
 *
 * Verified against MDN (createImageBitmap options, ImageBitmap, drawImage
 * smoothing); see docs/ideas/photo-research-export.md.
 */

/** The longest side a picture is kept at for editing (what the editor has always used). */
export const MAX_SIDE = 2400;

/**
 * The most pixels a file may have before it is refused. A decoded picture costs
 * 4 bytes a pixel (RGBA) while it is turned into the smaller working copy, so
 * 120 million pixels is about 480 MB at its peak: a 12000 x 10000 picture is
 * accepted (a 100 MP camera is not), and beyond that a phone's tab is killed
 * rather than slowed. This is a conservative choice of this app, not a number
 * from a specification.
 */
export const MAX_SOURCE_PIXELS = 120_000_000;

export type DecodeProblem = 'empty' | 'heic' | 'unsupported' | 'corrupt' | 'too-large';

/** An error whose message can be shown to the person as it is. */
export class PictureError extends Error {
  constructor(
    readonly problem: DecodeProblem,
    message: string,
  ) {
    super(message);
    this.name = 'PictureError';
  }
}

/** The browser calls decode needs; the page's own below, a stand-in in a test. */
export interface DecodeEnv {
  createImageBitmap(file: Blob, options: ImageBitmapOptions): Promise<{ width: number; height: number; close?(): void }>;
  /** Draws `from` into a new surface of the given size and returns it. */
  scale(from: unknown, width: number, height: number): unknown;
}

export const browserDecodeEnv: DecodeEnv = {
  createImageBitmap: (file, options) => createImageBitmap(file, options),
  scale(from, width, height) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(from as CanvasImageSource, 0, 0, width, height);
    return c;
  },
};

export interface DecodedPicture {
  /** Something `drawImage` accepts: an ImageBitmap, or a canvas where it was made smaller. */
  source: unknown;
  /** The size of `source`. */
  width: number;
  height: number;
  /** The size of the file's picture, after the camera's turn. */
  srcWidth: number;
  srcHeight: number;
  /** Whether `source` is a smaller copy. */
  scaled: boolean;
}

/** Whether a picture of this size is made smaller to fit `maxSide`. */
export const needsDownscale = (w: number, h: number, maxSide = MAX_SIDE): boolean => Math.max(w, h) > maxSide;

/** The size it is made, with the same shape. */
export function downscaleSize(w: number, h: number, maxSide = MAX_SIDE): { width: number; height: number } {
  if (!needsDownscale(w, h, maxSide)) return { width: w, height: h };
  const k = maxSide / Math.max(w, h);
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** Whether the file is a HEIC/HEIF picture (iPhone's default), by its type, its extension or its first bytes. */
export function isHeicName(file: Pick<File, 'name' | 'type'>): boolean {
  return /^image\/hei[cf]/i.test(file.type) || /\.(heic|heif|hif)$/i.test(file.name);
}

const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];

/** The same, also looking at the file's first bytes (an "ISO base media" box `ftyp` with a HEIF brand). */
export async function isHeic(file: File): Promise<boolean> {
  if (isHeicName(file)) return true;
  const head = await readHead(file, 12);
  if (head.length < 12) return false;
  const ascii = (a: number, b: number) => String.fromCharCode(...head.slice(a, b));
  return ascii(4, 8) === 'ftyp' && HEIF_BRANDS.includes(ascii(8, 12));
}

async function readHead(file: Blob, n: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, n).arrayBuffer());
}

/**
 * The picture's size read from the file's header alone (no decoding), for PNG,
 * JPEG, GIF and WebP; null for anything else or a damaged header. A JPEG's
 * size is as stored (before the camera's turn), which is all the pixel guard needs.
 */
export async function sourceSizeOf(file: Blob): Promise<{ width: number; height: number } | null> {
  const b = new Uint8Array(await file.slice(0, 1 << 16).arrayBuffer());
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const str = (at: number, n: number) => String.fromCharCode(...b.slice(at, at + n));
  try {
    if (b.length >= 24 && b[0] === 0x89 && str(1, 3) === 'PNG') {
      // IHDR: width and height, 4 bytes big-endian each, right after the 8-byte signature and the chunk header.
      return ok(dv.getUint32(16), dv.getUint32(20));
    }
    if (b.length >= 10 && (str(0, 6) === 'GIF87a' || str(0, 6) === 'GIF89a')) return ok(dv.getUint16(6, true), dv.getUint16(8, true));
    if (b.length >= 30 && str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP') {
      const kind = str(12, 4);
      if (kind === 'VP8X') return ok(1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)));
      if (kind === 'VP8L') {
        const bits = dv.getUint32(21, true);
        return ok((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
      }
      if (kind === 'VP8 ') return ok(dv.getUint16(26, true) & 0x3fff, dv.getUint16(28, true) & 0x3fff);
      return null;
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
      let at = 2;
      while (at + 9 < b.length) {
        if (b[at] !== 0xff) return null;
        const marker = b[at + 1]!;
        if (marker === 0xff) {
          at++;
          continue;
        }
        // Start-of-frame markers (not DHT C4, JPG C8, DAC CC) carry the height then the width, 2 bytes each.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return ok(dv.getUint16(at + 7), dv.getUint16(at + 5));
        at += 2 + dv.getUint16(at + 2);
      }
    }
  } catch {
    return null;
  }
  return null;
}

const ok = (width: number, height: number) => (width > 0 && height > 0 ? { width, height } : null);

const HEIC_MESSAGE = 'This is a HEIC picture (the iPhone camera’s format) and this browser cannot open it. Safari can; elsewhere, export it as a JPEG or PNG first (on an iPhone: Settings, Camera, Formats, Most Compatible), then add it again.';

/**
 * Reads a picture file. `maxSide` is the longest side kept (default 2400).
 * Throws a `PictureError` whose message is fit to show.
 */
export async function decodePicture(file: File, maxSide = MAX_SIDE, env: DecodeEnv = browserDecodeEnv): Promise<DecodedPicture> {
  if (file.size === 0) throw new PictureError('empty', `${file.name || 'This file'} is empty, so there is no picture in it.`);
  const heic = await isHeic(file);
  const size = await sourceSizeOf(file);
  if (size && size.width * size.height > MAX_SOURCE_PIXELS) {
    const mp = Math.round((size.width * size.height) / 1e6);
    throw new PictureError('too-large', `This picture is ${size.width} x ${size.height} pixels (${mp} megapixels), too large to open safely here. Make it smaller first (under ${MAX_SOURCE_PIXELS / 1e6} megapixels) and add it again.`);
  }
  let bitmap;
  try {
    // 'from-image' applies the camera's EXIF turn; said out loud so it does not depend on a default that has changed before.
    bitmap = await env.createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    if (heic) throw new PictureError('heic', HEIC_MESSAGE);
    if (file.type && !file.type.startsWith('image/')) throw new PictureError('unsupported', `${file.name} is not a picture this browser can open (${file.type}).`);
    throw new PictureError('corrupt', `${file.name || 'This file'} could not be read as a picture. It may be damaged or in a format this browser does not support.`);
  }
  const { width, height } = bitmap;
  if (!(width > 0 && height > 0)) {
    bitmap.close?.();
    throw new PictureError('corrupt', `${file.name || 'This file'} has no picture in it (its size is zero).`);
  }
  if (!needsDownscale(width, height, maxSide)) return { source: bitmap, width, height, srcWidth: width, srcHeight: height, scaled: false };
  const to = downscaleSize(width, height, maxSide);
  const small = env.scale(bitmap, to.width, to.height);
  bitmap.close?.();
  return { source: small, width: to.width, height: to.height, srcWidth: width, srcHeight: height, scaled: true };
}
