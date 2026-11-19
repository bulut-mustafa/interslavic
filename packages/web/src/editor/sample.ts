import type { Rect } from './text-style.ts';

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/**
 * The colour around a rectangle: the median of each channel over a thin ring
 * just outside it. Painted over the rectangle it hides lettering on a plain or
 * gently shaded background. It cannot rebuild a busy picture behind the text -
 * that needs real inpainting, which this does not attempt.
 */
export function ringColor(img: Pixels, rect: Rect, ring = 4): string {
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const x0 = Math.max(0, Math.floor(rect.x) - ring);
  const y0 = Math.max(0, Math.floor(rect.y) - ring);
  const x1 = Math.min(img.width - 1, Math.ceil(rect.x + rect.w) + ring);
  const y1 = Math.min(img.height - 1, Math.ceil(rect.y + rect.h) + ring);
  const inside = (x: number, y: number) => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (inside(x, y)) continue;
      const i = (y * img.width + x) * 4;
      r.push(img.data[i]!);
      g.push(img.data[i + 1]!);
      b.push(img.data[i + 2]!);
    }
  }
  return `rgb(${median(r)}, ${median(g)}, ${median(b)})`;
}

const hex2 = (n: number): string => Math.round(n).toString(16).padStart(2, '0');

/**
 * The colour of the lettering inside a rectangle: the average of the pixels
 * that differ most from the background around it. Null when nothing there
 * stands out (the area is blank, or the lettering is almost the background).
 */
export function inkColor(img: Pixels, rect: Rect, background: string): string | null {
  const m = background.match(/(\d+)\D+(\d+)\D+(\d+)/);
  if (!m) return null;
  const [br, bg, bb] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(img.height, Math.ceil(rect.y + rect.h));
  const px: { d: number; r: number; g: number; b: number }[] = [];
  let max = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      const r = img.data[i]!;
      const g = img.data[i + 1]!;
      const b = img.data[i + 2]!;
      const d = Math.hypot(r - br, g - bg, b - bb);
      px.push({ d, r, g, b });
      if (d > max) max = d;
    }
  }
  if (max < 60) return null;
  let n = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (const p of px) {
    if (p.d < max * 0.8) continue;
    n++;
    sr += p.r;
    sg += p.g;
    sb += p.b;
  }
  return n === 0 ? null : `#${hex2(sr / n)}${hex2(sg / n)}${hex2(sb / n)}`;
}

/**
 * The share of a rectangle that the lettering fills: pixels clearly different
 * from the background, over all pixels. How heavy the lettering is. Null when
 * nothing there stands out.
 */
export function inkFraction(img: Pixels, rect: Rect, background: string): number | null {
  const m = background.match(/(\d+)\D+(\d+)\D+(\d+)/);
  if (!m) return null;
  const [br, bg, bb] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(img.height, Math.ceil(rect.y + rect.h));
  let max = 0;
  const dist: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      const d = Math.hypot(img.data[i]! - br, img.data[i + 1]! - bg, img.data[i + 2]! - bb);
      dist.push(d);
      if (d > max) max = d;
    }
  }
  if (max < 60 || dist.length === 0) return null;
  return dist.filter((d) => d >= max * 0.5).length / dist.length;
}

/**
 * Reads just the pixels around a rectangle off a canvas, and hands them to
 * `use` with the rectangle moved to their own coordinates. Looking at a few
 * small regions on demand is what lets a page hold no copy of the whole
 * picture's pixels. `pad` is how far beyond the rectangle to read.
 */
export function withRegion<T>(canvas: HTMLCanvasElement, rect: Rect, pad: number, use: (img: Pixels, at: Rect) => T): T | null {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) return null;
  const x0 = Math.max(0, Math.floor(rect.x) - pad);
  const y0 = Math.max(0, Math.floor(rect.y) - pad);
  const x1 = Math.min(canvas.width, Math.ceil(rect.x + rect.w) + pad);
  const y1 = Math.min(canvas.height, Math.ceil(rect.y + rect.h) + pad);
  if (x1 <= x0 || y1 <= y0) return null;
  const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  return use(img, { x: rect.x - x0, y: rect.y - y0, w: rect.w, h: rect.h });
}
