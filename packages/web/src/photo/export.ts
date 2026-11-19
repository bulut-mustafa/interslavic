import { makeZip } from '../zip.ts';

/**
 * Handing the finished page over: PNG, JPEG or WebP through the canvas, a PDF
 * written by hand (one JPEG per page), and a zip of several. Everything is made
 * on this device. Sources and what was checked: docs/ideas/photo-research-export.md.
 */

export type ImageFormat = 'png' | 'jpeg' | 'webp';
export type ExportFormat = ImageFormat | 'pdf';

export const MIME: Record<ImageFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
export const EXTENSION: Record<ExportFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp', pdf: 'pdf' };
export const FORMAT_LABEL: Record<ExportFormat, string> = { png: 'PNG', jpeg: 'JPG', webp: 'WebP', pdf: 'PDF' };

/** Whether the format can keep a see-through background (JPEG and PDF-of-JPEG cannot: they are filled white). */
export const supportsTransparency = (f: ExportFormat): boolean => f === 'png' || f === 'webp';
/** Whether the format has a quality setting (the lossy ones). */
export const hasQuality = (f: ExportFormat): boolean => f === 'jpeg' || f === 'webp' || f === 'pdf';

export const SCALE_MIN = 0.25;
export const SCALE_MAX = 4;
/** The longest side a canvas is made. Chrome and Firefox allow more (16384 and 32767 in published tests); this is the common floor of desktop browsers. */
export const MAX_CANVAS_SIDE = 16384;

export interface CanvasEnv {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

const browserEnv = (): CanvasEnv => (typeof navigator === 'undefined' ? { userAgent: '' } : { userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints });

/** An iPhone, iPad (which says "Macintosh" with touch since iPadOS 13) or iPod. */
export const isIOS = (e: CanvasEnv): boolean => /iP(hone|ad|od)/.test(e.userAgent) || (e.platform === 'MacIntel' && (e.maxTouchPoints ?? 0) > 1);

/**
 * The most pixels (width x height) a canvas is asked for. Conservative on purpose:
 * iOS Safari's longstanding area limit is 16,777,216 (4096 x 4096; one report has
 * iOS 18 at 8192 x 8192, not relied on); elsewhere 67,108,864 (8192 x 8192, 256 MB
 * of RGBA), well under what desktop Chrome (268,435,456) and Firefox allow, so a
 * big export is not the one that runs a tab out of memory. A cap of this app's,
 * not a browser's number.
 */
export function maxCanvasPixels(env: CanvasEnv = browserEnv()): number {
  return isIOS(env) ? 16_777_216 : 67_108_864;
}

export interface FittedScale {
  /** The scale actually used, within SCALE_MIN..SCALE_MAX and the canvas limit. */
  scale: number;
  width: number;
  height: number;
  /** True when the wanted scale had to be reduced to fit the browser's canvas limit. */
  capped: boolean;
}

/** The size a `w` x `h` page is exported at for the wanted scale, reduced when it would not fit one canvas. */
export function fitScale(w: number, h: number, scale: number, maxPixels = maxCanvasPixels()): FittedScale {
  const wanted = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Number.isFinite(scale) ? scale : 1));
  let s = wanted;
  const area = (k: number) => Math.max(1, Math.round(w * k)) * Math.max(1, Math.round(h * k));
  const side = (k: number) => Math.max(Math.round(w * k), Math.round(h * k));
  if (area(s) > maxPixels || side(s) > MAX_CANVAS_SIDE) {
    s = Math.min(Math.sqrt(maxPixels / (w * h)), MAX_CANVAS_SIDE / Math.max(w, h), s);
    // Rounding the sides up must not push the area back over the limit.
    while (s > 0 && (area(s) > maxPixels || side(s) > MAX_CANVAS_SIDE)) s *= 0.999;
  }
  return { scale: s, width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)), capped: s < wanted };
}

/**
 * A rough guess of the file size in bytes, to tell people whether a result is
 * going to be big. Rule-of-thumb bytes per pixel (not measured on this app's
 * output, so shown as "about"): PNG 1.2 (photographs; flat artwork is far less),
 * JPEG 0.1 to 1.7 and WebP 0.07 to 1.2 as quality goes 0 to 1.
 */
export function estimateBytes(width: number, height: number, format: ExportFormat, quality = 0.9): number {
  const px = width * height;
  const q = Math.min(1, Math.max(0, quality));
  const perPixel = format === 'png' ? 1.2 : format === 'webp' ? 0.07 + 1.13 * q * q : 0.1 + 1.6 * q * q;
  return Math.round(px * perPixel);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** "Holiday photo.final.png" -> "Holiday photo.final": the name without a picture extension, and without characters files cannot have. */
export function baseName(name: string): string {
  const cleaned = name
    .replace(/\.(png|jpe?g|webp|gif|avif|bmp|svg|heic|heif|pdf)$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim();
  return cleaned || 'picture';
}

export const fileNameFor = (name: string, format: ExportFormat): string => `${baseName(name)}.${EXTENSION[format]}`;

export interface ExportOptions {
  format: ImageFormat;
  /** 0..1 for JPEG and WebP; ignored for PNG. */
  quality?: number;
  /** Wanted scale of the page's own size (fitScale limits it). */
  scale?: number;
  /** Keep the background see-through (PNG and WebP only). Otherwise, and always for JPEG, the page is filled white first. */
  transparent?: boolean;
  /** The page's name; the file takes its base name. */
  name: string;
  /** The page's own size in pixels, at scale 1. */
  width: number;
  height: number;
}

export interface ExportResult {
  blob: Blob;
  name: string;
  width: number;
  height: number;
  /** True when the scale was reduced to fit the browser's canvas limit. */
  scaled: boolean;
  /** The format actually made: a browser that cannot write WebP answers PNG, and the file is named for what it is. */
  format: ImageFormat;
}

/** What the page is drawn on: `render` receives the context and the OUTPUT size in pixels. */
export type RenderFn = (ctx: CanvasRenderingContext2D, size: { width: number; height: number; scale: number }) => void | Promise<void>;

export interface ExportEnv {
  createCanvas(width: number, height: number): HTMLCanvasElement;
  maxPixels: number;
}

export const browserExportEnv = (): ExportEnv => ({
  createCanvas(width, height) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  },
  maxPixels: maxCanvasPixels(),
});

const toBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), type, quality));

/** Draws the finished page at the chosen size and encodes it. Throws a readable Error if the browser gives nothing. */
export async function exportPage(render: RenderFn, opts: ExportOptions, env: ExportEnv = browserExportEnv()): Promise<ExportResult> {
  const fit = fitScale(opts.width, opts.height, opts.scale ?? 1, env.maxPixels);
  const canvas = env.createCanvas(fit.width, fit.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not make a canvas to draw the picture on.');
  const clear = opts.transparent && supportsTransparency(opts.format);
  if (!clear) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, fit.width, fit.height);
  }
  await render(ctx, { width: fit.width, height: fit.height, scale: fit.scale });
  const quality = opts.format === 'png' ? undefined : Math.min(1, Math.max(0, opts.quality ?? 0.92));
  let blob: Blob | null;
  try {
    blob = await toBlob(canvas, MIME[opts.format], quality);
  } finally {
    // Frees the canvas's memory at once instead of when it is collected (matters on a phone).
    canvas.width = 0;
    canvas.height = 0;
  }
  if (!blob) throw new Error('The browser could not make the picture file. Try a smaller size.');
  // A browser that cannot write the format answers PNG (MDN: toBlob falls back to image/png).
  const made = (Object.keys(MIME) as ImageFormat[]).find((f) => MIME[f] === blob.type) ?? opts.format;
  return { blob, name: fileNameFor(opts.name, made), width: fit.width, height: fit.height, scaled: fit.capped, format: made };
}

// ---------------------------------------------------------------- PDF

export interface PdfPage {
  /** The page as a baseline or progressive JPEG file's bytes (what `exportPage` makes for 'jpeg'). */
  jpeg: Uint8Array;
  /** The picture's size in pixels. */
  width: number;
  height: number;
}

const enc = new TextEncoder();

/** A number as PDF writes it: no exponent, up to 3 decimals, no trailing zeros. */
const num = (n: number): string => (Math.round(n * 1000) / 1000).toString();

/**
 * A PDF with one picture per page, written by hand (PDF 32000-1:2008, 7.5 file
 * structure; the JPEG is embedded as it is with /DCTDecode, 8.9.5 and 7.4.8).
 * The page is `width * 72 / dpi` points wide (72 points to the inch): at the
 * default 72 dpi one pixel is one point.
 *
 * Objects: 1 Catalog, 2 Pages, then per page n: Page, its content stream, its image.
 */
export function buildPdf(pages: PdfPage[], dpi = 72): Uint8Array {
  if (pages.length === 0) throw new Error('A PDF needs at least one page.');
  if (!(dpi > 0)) throw new Error('The dpi must be positive.');
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let at = 0;
  const push = (p: Uint8Array | string) => {
    const b = typeof p === 'string' ? enc.encode(p) : p;
    parts.push(b);
    at += b.length;
  };
  const object = (n: number, ...body: (Uint8Array | string)[]) => {
    offsets[n] = at;
    push(`${n} 0 obj\n`);
    body.forEach(push);
    push('\nendobj\n');
  };

  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // a comment of high bytes: tells tools this is a binary file (7.5.2)
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  pages.forEach((p, i) => {
    const page = 3 + i * 3;
    const w = (p.width * 72) / dpi;
    const h = (p.height * 72) / dpi;
    const content = `q ${num(w)} 0 0 ${num(h)} 0 0 cm /Im0 Do Q`;
    object(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(w)} ${num(h)}] /Resources << /XObject << /Im0 ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`);
    object(page + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    object(
      page + 2,
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      p.jpeg,
      '\nendstream',
    );
  });

  const count = 3 + pages.length * 3; // objects 0..count-1
  const xref = at;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(at);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** The PDF as a downloadable file: each page's JPEG blob (from `exportPage` with format 'jpeg') becomes a page. */
export async function exportPdf(pages: { blob: Blob; width: number; height: number }[], dpi = 72): Promise<Blob> {
  const parts = await Promise.all(pages.map(async (p) => ({ jpeg: new Uint8Array(await p.blob.arrayBuffer()), width: p.width, height: p.height })));
  return new Blob([buildPdf(parts, dpi) as BlobPart], { type: 'application/pdf' });
}

/** Several finished pictures as one zip; same-named files get "-2", "-3" (zip.ts). */
export function exportZip(files: { name: string; blob: Blob }[]): Promise<Blob> {
  return makeZip(files);
}

// ---------------------------------------------------------------- the dialog's request

export interface ExportRequest {
  format: ExportFormat;
  quality: number;
  scale: number;
  transparent: boolean;
  /** 'current': the page showing, one file. 'all': every page, as a zip of pictures, or one PDF. */
  scope: 'current' | 'all';
}
