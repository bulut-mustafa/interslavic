import type { Adjust } from './project.ts';

/*
 * Picture effects for media layers: adjustments, masks and chroma key.
 * Every formula and browser fact used here, with its source, is recorded in
 * docs/ideas/video-research-effects.md.
 */

// ---------------------------------------------------------------- adjustments

/**
 * The project's Adjust plus the extras that have no CSS filter function and
 * so are always done on pixels. brightness, contrast, saturation: -100..100;
 * hue: degrees; blur: px; temperature, tint: -100..100; fade, sharpen,
 * vignette: 0..100. 0 or missing means untouched.
 */
export interface FxAdjust extends Adjust {
  temperature?: number;
  tint?: number;
  fade?: number;
  sharpen?: number;
  vignette?: number;
}

const BASIC: (keyof FxAdjust)[] = ['brightness', 'contrast', 'saturation', 'hue'];
const EXTRA: (keyof FxAdjust)[] = ['temperature', 'tint', 'fade', 'sharpen', 'vignette'];
const has = (a: FxAdjust | undefined, keys: (keyof FxAdjust)[]): boolean => !!a && keys.some((k) => !!a[k]);

export const isNeutralAdjust = (a: FxAdjust | undefined): boolean => !has(a, [...BASIC, ...EXTRA, 'blur']);

/** The ctx.filter string for the part of the adjustment CSS can do. 'none' when there is none. */
export function cssFilter(a: FxAdjust | undefined): string {
  if (!a) return 'none';
  const parts: string[] = [];
  const num = (n: number) => String(Math.round(n * 1e6) / 1e6);
  if (a.brightness) parts.push(`brightness(${num(1 + a.brightness / 100)})`);
  if (a.contrast) parts.push(`contrast(${num(1 + a.contrast / 100)})`);
  if (a.saturation) parts.push(`saturate(${num(1 + a.saturation / 100)})`);
  if (a.hue) parts.push(`hue-rotate(${num(a.hue)}deg)`);
  if (a.blur) parts.push(`blur(${num(a.blur)}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

/** Whether a pixel pass is needed: always for the extras, for the CSS part only when ctx.filter is missing. */
export function needsPixelPass(a: FxAdjust | undefined, hasCtxFilter: boolean): boolean {
  return has(a, EXTRA) || (!hasCtxFilter && has(a, BASIC));
}

/** The 3x3 colour block of the hueRotate feColorMatrix (rows r, g, b), from the Filter Effects spec. */
export function hueMatrix(deg: number): number[] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

/** The saturate feColorMatrix colour block for s (1 = unchanged), from the spec. */
const satMatrix = (s: number): number[] => [
  0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
];

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** How far temperature and tint push a channel at 100: +-15 percent gain (own approximation, see the research doc). */
const WB_GAIN = 0.15;
/** Where fade lifts black to at 100: a quarter of the range (own choice). */
const FADE_LIFT = 0.25;

/** Largest copy (bytes) kept between frames for the sharpen pass; a bigger image gets a one-off copy. */
const SHARP_KEEP_BYTES = 4 * 1920 * 1080;
let sharpBuf: Uint8ClampedArray | null = null;

/** A copy of `d` to read the untouched neighbours from, in a buffer reused between frames when it is not huge. */
function sharpSource(d: Uint8ClampedArray): Uint8ClampedArray {
  if (d.length > SHARP_KEEP_BYTES) return new Uint8ClampedArray(d);
  if (!sharpBuf || sharpBuf.length < d.length) sharpBuf = new Uint8ClampedArray(d.length);
  const view = sharpBuf.subarray(0, d.length);
  view.set(d);
  return view;
}

/**
 * Applies an adjustment to the pixels in place, in this order, each stage
 * clamped to 0..255 as the CSS filter chain does: brightness, contrast,
 * saturate, hue-rotate, temperature/tint, fade, sharpen, vignette. Blur is not
 * done here (a pixel blur costs too much per frame; browsers without
 * ctx.filter show no blur). With `extrasOnly` the first four are skipped
 * because ctx.filter already did them. Alpha is untouched.
 */
export function applyAdjustPixels(img: ImageData, a: FxAdjust, opts: { extrasOnly?: boolean } = {}): void {
  const d = img.data;
  const doBasic = !opts.extrasOnly;
  const bri = doBasic && a.brightness ? 1 + a.brightness / 100 : 1;
  const con = doBasic && a.contrast ? 1 + a.contrast / 100 : 1;
  const sat = doBasic && a.saturation ? satMatrix(1 + a.saturation / 100) : null;
  const hue = doBasic && a.hue ? hueMatrix(a.hue) : null;
  const gainR = 1 + (WB_GAIN * (a.temperature ?? 0)) / 100;
  const gainB = 1 - (WB_GAIN * (a.temperature ?? 0)) / 100;
  const gainG = 1 - (WB_GAIN * (a.tint ?? 0)) / 100;
  const wb = gainR !== 1 || gainG !== 1 || gainB !== 1;
  const lift = (FADE_LIFT * (a.fade ?? 0)) / 100;
  const sharp = (a.sharpen ?? 0) / 100;
  const vig = (a.vignette ?? 0) / 100;
  const per = bri !== 1 || con !== 1 || sat || hue || wb || lift;

  if (per) {
    // contrast: slope con, intercept 0.5 - 0.5 con, on 0..1 values
    const cOff = (0.5 - 0.5 * con) * 255;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i]!;
      let g = d[i + 1]!;
      let b = d[i + 2]!;
      if (bri !== 1) (r = clamp255(r * bri)), (g = clamp255(g * bri)), (b = clamp255(b * bri));
      if (con !== 1) (r = clamp255(r * con + cOff)), (g = clamp255(g * con + cOff)), (b = clamp255(b * con + cOff));
      if (sat) {
        const nr = clamp255(sat[0]! * r + sat[1]! * g + sat[2]! * b);
        const ng = clamp255(sat[3]! * r + sat[4]! * g + sat[5]! * b);
        const nb = clamp255(sat[6]! * r + sat[7]! * g + sat[8]! * b);
        (r = nr), (g = ng), (b = nb);
      }
      if (hue) {
        const nr = clamp255(hue[0]! * r + hue[1]! * g + hue[2]! * b);
        const ng = clamp255(hue[3]! * r + hue[4]! * g + hue[5]! * b);
        const nb = clamp255(hue[6]! * r + hue[7]! * g + hue[8]! * b);
        (r = nr), (g = ng), (b = nb);
      }
      if (wb) (r = clamp255(r * gainR)), (g = clamp255(g * gainG)), (b = clamp255(b * gainB));
      if (lift) (r = lift * 255 + r * (1 - lift)), (g = lift * 255 + g * (1 - lift)), (b = lift * 255 + b * (1 - lift));
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
  }

  if (sharp) {
    // out = c + amount * (4c - left - right - up - down), edge pixels repeat: amount 1 is the 3x3 kernel [0 -1 0; -1 5 -1; 0 -1 0]
    const { width: w, height: h } = img;
    const src = sharpSource(d);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(h - 1, y + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - 1);
        const x1 = Math.min(w - 1, x + 1);
        const i = (y * w + x) * 4;
        const l = (y * w + x0) * 4;
        const r = (y * w + x1) * 4;
        const u = (y0 * w + x) * 4;
        const o = (y1 * w + x) * 4;
        for (let c = 0; c < 3; c++) d[i + c] = clamp255(src[i + c]! + sharp * (4 * src[i + c]! - src[l + c]! - src[r + c]! - src[u + c]! - src[o + c]!));
      }
    }
  }

  if (vig) {
    // darken by vig * smoothstep(0.3, 1, d), d = distance from the centre, 1 at a corner
    const { width: w, height: h } = img;
    for (let y = 0; y < h; y++) {
      const dy = (y + 0.5 - h / 2) / (h / 2);
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - w / 2) / (w / 2);
        const f = 1 - vig * smoothstep(0.3, 1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT2);
        if (f === 1) continue;
        const i = (y * w + x) * 4;
        d[i] = d[i]! * f;
        d[i + 1] = d[i + 1]! * f;
        d[i + 2] = d[i + 2]! * f;
      }
    }
  }
}

// ---------------------------------------------------------------- chroma key

/** similarity and smoothness are distances on the chroma plane (0 to about 0.7); OBS's defaults are 0.4 and 0.08. */
export interface Chroma {
  color: string;
  similarity: number;
  smoothness: number;
}

export function parseHex(s: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** The chroma-plane coordinates of an RGB colour (0..1 in, 0..1 out). */
const chromaUV = (r: number, g: number, b: number): [number, number] => [-0.169 * r - 0.331 * g + 0.5 * b + 0.5, 0.5 * r - 0.419 * g - 0.081 * b + 0.5];

/**
 * Makes pixels near the key colour transparent, in place. Distance is
 * Euclidean on the chroma plane (so brightness is ignored); alpha is
 * clamp((distance - similarity) / smoothness, 0, 1) ^ 1.5, multiplied into
 * the existing alpha. Smoothness 0 is a hard step. A colour that cannot be
 * read changes nothing.
 */
export function chromaKey(img: ImageData, c: Chroma): void {
  const key = parseHex(c.color);
  if (!key) return;
  const [ku, kv] = chromaUV(key[0] / 255, key[1] / 255, key[2] / 255);
  const d = img.data;
  const { similarity: sim, smoothness: smooth } = c;
  for (let i = 0; i < d.length; i += 4) {
    const u = -0.169 * d[i]! - 0.331 * d[i + 1]! + 0.5 * d[i + 2]!;
    const v = 0.5 * d[i]! - 0.419 * d[i + 1]! - 0.081 * d[i + 2]!;
    const du = u / 255 + 0.5 - ku;
    const dv = v / 255 + 0.5 - kv;
    const dist = Math.sqrt(du * du + dv * dv);
    let t: number;
    if (smooth > 0) {
      t = (dist - sim) / smooth;
      t = t <= 0 ? 0 : t >= 1 ? 1 : t ** 1.5;
    } else t = dist > sim ? 1 : 0;
    if (t < 1) d[i + 3] = d[i + 3]! * t;
  }
}

/** Largest overlay (pixels) the chroma key is meant to run on per frame; see the research doc for the measurement. */
export const CHROMA_MAX_PIXELS = 640 * 360;

// ---------------------------------------------------------------------- masks

export type MaskShape = 'rect' | 'ellipse' | 'heart';

/** x, y, w, h are fractions of the layer's own box; rotation in degrees about the shape's centre; feather in px. */
export interface Mask {
  shape: MaskShape;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  feather: number;
  invert: boolean;
}

/** The heart in a unit box: six cubic Beziers, symmetric about x = 0.5 (own drawing). */
const HEART: { move: [number, number]; curves: [number, number, number, number, number, number][] } = {
  move: [0.5, 1],
  curves: [
    [0.1, 0.7, 0, 0.45, 0, 0.28],
    [0, 0.1, 0.15, 0, 0.28, 0],
    [0.4, 0, 0.5, 0.1, 0.5, 0.22],
    [0.5, 0.1, 0.6, 0, 0.72, 0],
    [0.85, 0, 1, 0.1, 1, 0.28],
    [1, 0.45, 0.9, 0.7, 0.5, 1],
  ],
};

type PathMaker = () => Path2D;

/**
 * The mask as a path in the layer's pixel box (0,0 to w,h). `makePath` is for
 * tests. With invert the whole box is added first, for the even-odd rule.
 */
export function maskPath(m: Mask, w: number, h: number, makePath: PathMaker = () => new Path2D()): Path2D {
  const p = makePath();
  if (m.invert) p.rect(0, 0, w, h);
  const cx = (m.x + m.w / 2) * w;
  const cy = (m.y + m.h / 2) * h;
  const rad = (m.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  /** A point of the unit box -> pixel coordinates, turned about the centre. */
  const at = (ux: number, uy: number): [number, number] => {
    const dx = (ux - 0.5) * m.w * w;
    const dy = (uy - 0.5) * m.h * h;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  };
  if (m.shape === 'ellipse') {
    p.ellipse(cx, cy, (m.w * w) / 2, (m.h * h) / 2, rad, 0, 2 * Math.PI);
  } else if (m.shape === 'heart') {
    p.moveTo(...at(...HEART.move));
    for (const c of HEART.curves) p.bezierCurveTo(...at(c[0], c[1]), ...at(c[2], c[3]), ...at(c[4], c[5]));
    p.closePath();
  } else {
    p.moveTo(...at(0, 0));
    p.lineTo(...at(1, 0));
    p.lineTo(...at(1, 1));
    p.lineTo(...at(0, 1));
    p.closePath();
  }
  return p;
}

type Scratch = (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas;

/** Largest mask scratch (pixels) kept between frames; a bigger layer gets one-off canvases. */
const MASK_KEEP_PIXELS = 4096 * 4096;
const pool: (HTMLCanvasElement | null)[] = [null, null];

/** Drops the kept mask canvases (tests). */
export const resetMaskPool = (): void => {
  pool[0] = pool[1] = null;
};

/**
 * Pooled scratch for the default case: slot 0 holds the mask, slot 1 the content. Reused between frames, resized
 * (which clears it) only when the size changes, cleared in place otherwise. Callers save()/restore() around their use
 * so no transform, shadow or blend state is left on a reused canvas.
 */
function pooled(slot: 0 | 1, w: number, h: number): HTMLCanvasElement {
  let c = w * h > MASK_KEEP_PIXELS ? null : pool[slot]!;
  if (!c) {
    c = document.createElement('canvas');
    if (w * h <= MASK_KEEP_PIXELS) pool[slot] = c;
  }
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  } else c.getContext('2d')?.clearRect(0, 0, w, h);
  return c;
}

/**
 * Draws `drawContent` through the mask. The content is drawn in the layer's
 * box (0,0 to w,h) of whatever transform `ctx` has. No feather: clip(path).
 * Feather: a scratch canvas holds the mask, made by drawing the shape far
 * off-canvas with shadowBlur = feather and shadowOffsetX bringing only its
 * blurred shadow back (shadow sigma = feather / 2, edge at 50 percent); a
 * second scratch canvas gets the content and keeps it with destination-in
 * (destination-out when inverted); that is drawn once onto ctx. Limits:
 * feather is in pixels of the layer box, scratch canvases are w x h (two,
 * kept between frames unless the layer is over 4096 x 4096), and the browser
 * may cap the blur.
 */
export function applyMask(
  ctx: CanvasRenderingContext2D,
  m: Mask,
  w: number,
  h: number,
  drawContent: (ctx: CanvasRenderingContext2D) => void,
  opts: { makePath?: PathMaker; scratch?: Scratch } = {},
): void {
  const path = maskPath(m, w, h, opts.makePath);
  if (!(m.feather > 0)) {
    ctx.save();
    ctx.clip(path, m.invert ? 'evenodd' : 'nonzero');
    drawContent(ctx);
    ctx.restore();
    return;
  }
  const mw = Math.max(1, Math.ceil(w));
  const mh = Math.max(1, Math.ceil(h));
  const maskCanvas = opts.scratch ? opts.scratch(mw, mh) : pooled(0, mw, mh);
  const mctx = maskCanvas.getContext('2d') as CanvasRenderingContext2D;
  mctx.save();
  // the shape must be fully off-canvas: its box can reach 2 diagonals to the left once turned
  const off = 2 * (w + h) + 4 * m.feather;
  // for the inverted mask the shape path carries the full box, so draw the plain shape and invert at composite time
  const plain = m.invert ? maskPath({ ...m, invert: false }, w, h, opts.makePath) : path;
  mctx.shadowColor = '#000';
  mctx.shadowBlur = m.feather;
  mctx.shadowOffsetX = off;
  mctx.shadowOffsetY = 0;
  mctx.translate(-off, 0);
  mctx.fill(plain);
  mctx.restore();

  const contentCanvas = opts.scratch ? opts.scratch(mw, mh) : pooled(1, mw, mh);
  const cctx = contentCanvas.getContext('2d') as CanvasRenderingContext2D;
  cctx.save();
  drawContent(cctx);
  cctx.globalCompositeOperation = m.invert ? 'destination-out' : 'destination-in';
  cctx.drawImage(maskCanvas, 0, 0);
  cctx.restore();
  ctx.drawImage(contentCanvas, 0, 0);
}
