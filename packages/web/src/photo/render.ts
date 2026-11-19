import { boundsOf } from '../editor/layers.ts';
import { drawText } from '../editor/text-style.ts';
import { BLEND_OP, supportsFilter } from '../video/compositor.ts';
import { applyAdjustPixels, applyMask, chromaKey, cssFilter, isNeutralAdjust, needsPixelPass, parseHex, type FxAdjust } from '../video/effects.ts';
import { isImage, isShape, outputSize, type ImageLayer, type PageDoc, type PhotoLayer, type Shadow, type ShapeLayer } from './doc.ts';
import { geometryMatrix, HEART, outputBounds, shapeOutline, type Mat, type Size } from './geometry.ts';
import { boxOfLayer, isHidden } from './hit.ts';

/**
 * Draws a PageDoc. The editor's canvas, the thumbnail and the export all call `renderPage`, so what is shown is what is saved.
 *
 * Order: clear, page background, the base picture (geometry, then colour), the `erase` rectangles of text layers, then every layer
 * in array order (later = in front) skipping hidden ones, then the outlines of the selected layers. Positions are OUTPUT pixels
 * (after the base geometry); `scale` maps them to canvas pixels.
 *
 * Fast path while a slider is dragged: the colour-adjusted base is kept in an offscreen canvas (`RenderCache`) keyed by
 * (adjust, preset, geometry, size, base identity), so redrawing for a layer that moves costs one drawImage for the base. Changing
 * only the colour edit rebuilds it once per change. With no colour edit the base is drawn straight through the geometry matrix.
 * Scratch canvases (cache, layer, pixel pass) are module-level and resized only when the size changes, never made per frame.
 * Sources: docs/ideas/photo-research-render.md.
 */

export type PictureSource = CanvasImageSource & { width: number; height: number };

export interface RenderCache {
  canvas: HTMLCanvasElement | null;
  key: string;
  base: unknown;
}

export const createRenderCache = (): RenderCache => ({ canvas: null, key: '', base: null });

/** Gives the cache's memory back (a canvas keeps its pixels until it is made empty). */
export function disposeRenderCache(c: RenderCache): void {
  if (c.canvas) {
    c.canvas.width = 0;
    c.canvas.height = 0;
  }
  c.canvas = null;
  c.key = '';
  c.base = null;
}

export interface RenderRequest {
  doc: PageDoc;
  /** The picture at working size, or null while it is not ready (the page is still drawn without it). */
  base: PictureSource | null;
  /** The pictures of image layers, by `ImageLayer.src`; null when one is not ready (that layer is left out). */
  images: { pictureOf(srcId: string): CanvasImageSource | null };
  /** The canvas's pixel size. */
  size: Size;
  selected?: readonly string[];
  /** Canvas pixels per output pixel. Default: `size.w / output width`, so the page fills the canvas. */
  scale?: number;
  /** Zoom a straightened picture so no background shows in the corners (see geometry.ts `fillScale`). */
  fill?: boolean;
  /** The colour edit a named preset stands for (photo/presets.ts), at the given strength 0..1; null when unknown. */
  presets?: (id: string, amount: number) => FxAdjust | null;
  /** Changes whenever the base's pixels change in place without the object changing (a new cut-out); part of the cache key. */
  baseVersion?: number | string;
  /** Keeps the coloured base between calls. Default: one shared by every call; pass your own for an export so it does not disturb the preview's. */
  cache?: RenderCache;
  /** Most pixels an image layer's per-pixel pass (green screen, extras, adjust without ctx.filter) works on; larger layers are worked on scaled down. Default 1920x1080. */
  pixelCap?: number;
}

const sharedCache = createRenderCache();
const OUTLINE = '#1f6b6b';
const DEFAULT_PIXEL_CAP = 1920 * 1080;

const makeCanvas = (): HTMLCanvasElement | null => (typeof document === 'undefined' ? null : document.createElement('canvas'));
const alphaOf = (c: CanvasRenderingContext2D): number => (typeof c.globalAlpha === 'number' ? c.globalAlpha : 1);

/** Pixel size of a picture source, or null when it is not known (copied from video/compositor.ts, where it is private). */
function sizeOf(src: CanvasImageSource): Size | null {
  const s = src as Partial<Record<'videoWidth' | 'videoHeight' | 'naturalWidth' | 'naturalHeight' | 'width' | 'height', unknown>>;
  const num = (v: unknown): number => (typeof v === 'number' && v > 0 ? v : 0);
  const w = num(s.videoWidth) || num(s.naturalWidth) || num(s.width);
  const h = num(s.videoHeight) || num(s.naturalHeight) || num(s.height);
  return w && h ? { w, h } : null;
}

/** The same adjustment with its blur multiplied: filter lengths are in canvas pixels, not touched by the transform (HTML spec, Filters). */
const withBlur = (a: FxAdjust, k: number): FxAdjust => (a.blur ? { ...a, blur: a.blur * k } : a);

// ---------------------------------------------------------------- paths

/** The current path: a rectangle with rounded corners, from arcTo (MDN: arcTo; negative radius throws, so it is clamped). */
function roundedRect(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number): void {
  const r = Math.min(Math.max(0, radius), w / 2, h / 2);
  if (r <= 0) {
    ctx.rect(0, 0, w, h);
    return;
  }
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.arcTo(w, 0, w, r, r);
  ctx.lineTo(w, h - r);
  ctx.arcTo(w, h, w - r, h, r);
  ctx.lineTo(r, h);
  ctx.arcTo(0, h, 0, h - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
}

type Outline = 'rect' | 'rounded' | 'ellipse' | 'triangle' | 'star' | 'heart';

/** Begins a new path holding the outline in the box (0,0)-(w,h). */
function tracePath(ctx: CanvasRenderingContext2D, kind: Outline, w: number, h: number, radius: number): void {
  ctx.beginPath();
  if (kind === 'rect' || kind === 'rounded') roundedRect(ctx, w, h, radius);
  else if (kind === 'ellipse') ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
  else if (kind === 'heart') {
    ctx.moveTo(HEART.move[0] * w, HEART.move[1] * h);
    for (const c of HEART.curves) ctx.bezierCurveTo(c[0] * w, c[1] * h, c[2] * w, c[3] * h, c[4] * w, c[5] * h);
    ctx.closePath();
  } else {
    const pts = shapeOutline(kind, w, h);
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  }
}

/** The shadow colour with the shadow's own opacity folded into its alpha (hex colours; any other colour is used as given). */
function shadowColor(s: Shadow): string {
  const rgb = parseHex(s.color);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.min(1, Math.max(0, s.opacity))})` : s.color;
}

/** Shadow offset and blur are not touched by the transform (HTML spec, shadows), so they are scaled to canvas pixels by hand. */
function setShadow(ctx: CanvasRenderingContext2D, s: Shadow, k: number): void {
  ctx.shadowColor = shadowColor(s);
  ctx.shadowBlur = Math.max(0, s.blur * k);
  ctx.shadowOffsetX = s.x * k;
  ctx.shadowOffsetY = s.y * k;
}
const clearShadow = (ctx: CanvasRenderingContext2D): void => {
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
};

/** Moves the origin to the layer's top-left through its centre: rotation, then flips, about the centre. */
function placeLayer(ctx: CanvasRenderingContext2D, l: { x: number; y: number; w: number; h: number; rotation: number; flipX?: boolean; flipY?: boolean; opacity: number; blend: ImageLayer['blend'] }): void {
  ctx.translate(l.x + l.w / 2, l.y + l.h / 2);
  if (l.rotation) ctx.rotate((l.rotation * Math.PI) / 180);
  if (l.flipX || l.flipY) ctx.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1);
  ctx.globalAlpha = alphaOf(ctx) * l.opacity;
  ctx.globalCompositeOperation = BLEND_OP[l.blend] ?? 'source-over';
  ctx.translate(-l.w / 2, -l.h / 2);
}

// ---------------------------------------------------------------- base picture

function geometryOf(doc: PageDoc) {
  const b = doc.base;
  return { crop: b.crop, turns: b.turns, straighten: b.straighten, flipX: b.flipX, flipY: b.flipY };
}

const isIdentity = (m: Mat): boolean => m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0;

function drawBase(ctx: CanvasRenderingContext2D, req: RenderRequest, src: Size, out: Size): void {
  const base = req.base!;
  const geo = geometryOf(req.doc);
  const m = geometryMatrix(src, geo, { fill: req.fill });
  const preset = req.doc.base.preset && req.presets ? req.presets(req.doc.base.preset, req.doc.base.presetAmount ?? 1) : null;
  const stages = [preset, req.doc.base.adjust].filter((s): s is FxAdjust => !!s && !isNeutralAdjust(s));

  const direct = (c: CanvasRenderingContext2D, filter: string): void => {
    c.save();
    if (isIdentity(m)) {
      if (filter !== 'none') c.filter = filter;
      c.drawImage(base, 0, 0);
    } else {
      c.beginPath();
      c.rect(0, 0, out.w, out.h);
      c.clip();
      c.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      if (filter !== 'none') c.filter = filter;
      c.drawImage(base, 0, 0, src.w, src.h);
    }
    c.restore();
  };

  if (stages.length === 0) {
    direct(ctx, 'none');
    return;
  }

  const cache = req.cache ?? sharedCache;
  const cw = Math.max(1, Math.round(out.w * scaleOf(req, out)));
  const ch = Math.max(1, Math.round(out.h * scaleOf(req, out)));
  const key = JSON.stringify([geo, !!req.fill, stages, cw, ch, src.w, src.h, req.baseVersion ?? 0]);
  if (!cache.canvas || cache.key !== key || cache.base !== base) {
    const canvas = cache.canvas ?? makeCanvas();
    const cctx = canvas?.getContext('2d') ?? null;
    if (!canvas || !cctx) {
      // No offscreen surface (pre-rendering, a browser out of memory): colour straight onto the page where the browser can.
      direct(ctx, supportsFilter(ctx) ? stages.map((s) => cssFilter(s)).filter((f) => f !== 'none').join(' ') || 'none' : 'none');
      return;
    }
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw; // resizing clears the bitmap
      canvas.height = ch;
    } else cctx.clearRect(0, 0, cw, ch); // drawImage composites over what is there
    const kx = cw / out.w;
    const filt = supportsFilter(cctx);
    cctx.save();
    cctx.scale(kx, ch / out.h);
    cctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    const fs = filt ? stages.map((s) => cssFilter(withBlur(s, kx))).filter((f) => f !== 'none').join(' ') : '';
    if (fs) cctx.filter = fs;
    cctx.drawImage(base, 0, 0, src.w, src.h);
    if (fs) cctx.filter = 'none';
    cctx.restore();
    // The part of the colour edit a browser's filter cannot do (or all of it without ctx.filter) is done on the pixels.
    if (stages.some((s) => needsPixelPass(s, filt))) {
      const img = cctx.getImageData(0, 0, cw, ch);
      for (const s of stages) if (needsPixelPass(s, filt)) applyAdjustPixels(img, s, filt ? { extrasOnly: true } : undefined);
      cctx.putImageData(img, 0, 0);
    }
    cache.canvas = canvas;
    cache.key = key;
    cache.base = base;
  }
  ctx.drawImage(cache.canvas, 0, 0, out.w, out.h);
}

/** Canvas pixels per output pixel. */
function scaleOf(req: RenderRequest, out: Size): number {
  return req.scale ?? (out.w > 0 ? req.size.w / out.w : 1);
}

// ---------------------------------------------------------------- image layers

let layerCanvas: HTMLCanvasElement | null = null;
let pixelCanvas: HTMLCanvasElement | null = null;

/** Drops the kept scratch canvases (tests; fresh ones are made on next use). */
export function resetRenderScratch(): void {
  layerCanvas = null;
  pixelCanvas = null;
  disposeRenderCache(sharedCache);
}

/** A kept canvas of this size: resized (which clears it) only when the size changes, cleared in place otherwise. */
function sized(held: HTMLCanvasElement | null, w: number, h: number): HTMLCanvasElement | null {
  const c = held ?? makeCanvas();
  if (!c) return null;
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  } else c.getContext('2d')?.clearRect(0, 0, w, h);
  return c;
}

const cropOf = (l: ImageLayer, pic: Size): { x: number; y: number; w: number; h: number } => {
  const c = l.crop ?? { x: 0, y: 0, w: pic.w, h: pic.h };
  const x = Math.min(Math.max(0, c.x), pic.w - 1);
  const y = Math.min(Math.max(0, c.y), pic.h - 1);
  return { x, y, w: Math.max(1, Math.min(c.w, pic.w - x)), h: Math.max(1, Math.min(c.h, pic.h - y)) };
};

/** The picture's cropped part into the layer box (0,0)-(w,h), with its colour edit and green screen. */
function drawPicture(c: CanvasRenderingContext2D, pic: CanvasImageSource, l: ImageLayer, crop: { x: number; y: number; w: number; h: number }, k: number, cap: number): void {
  const hasFilter = supportsFilter(c);
  const adjust = l.adjust as FxAdjust | undefined;
  const pixel = !!l.chroma || needsPixelPass(adjust, hasFilter);
  if (pixel) {
    // Worked on at the size it is drawn at, and no more than `cap` pixels.
    const kk = Math.min(1, Math.sqrt(cap / Math.max(1, l.w * k * l.h * k)));
    const sw = Math.max(1, Math.round(l.w * k * kk));
    const sh = Math.max(1, Math.round(l.h * k * kk));
    const scratch = sized(pixelCanvas, sw, sh);
    pixelCanvas = scratch;
    const sctx = scratch?.getContext('2d', { willReadFrequently: true }) ?? null;
    if (scratch && sctx) {
      sctx.drawImage(pic, crop.x, crop.y, crop.w, crop.h, 0, 0, sw, sh);
      const img = sctx.getImageData(0, 0, sw, sh);
      if (needsPixelPass(adjust, hasFilter)) applyAdjustPixels(img, adjust ?? {}, hasFilter ? { extrasOnly: true } : undefined);
      if (l.chroma) chromaKey(img, l.chroma);
      sctx.putImageData(img, 0, 0);
      const f = hasFilter ? cssFilter(withBlur(adjust ?? {}, k)) : 'none';
      if (f !== 'none') c.filter = f;
      c.drawImage(scratch, 0, 0, l.w, l.h);
      if (f !== 'none') c.filter = 'none';
      return;
    }
  }
  const f = hasFilter ? cssFilter(adjust && withBlur(adjust, k)) : 'none';
  if (f !== 'none') c.filter = f;
  c.drawImage(pic, crop.x, crop.y, crop.w, crop.h, 0, 0, l.w, l.h);
  if (f !== 'none') c.filter = 'none';
}

function drawImageLayer(ctx: CanvasRenderingContext2D, l: ImageLayer, pic: CanvasImageSource | null, k: number, cap: number): void {
  if (!pic || l.w <= 0 || l.h <= 0) return;
  const size = sizeOf(pic);
  if (!size) return;
  const crop = cropOf(l, size);
  const radius = l.radius ?? 0;
  const outline: Outline = l.frame === 'rounded' ? 'rounded' : l.frame ?? 'rect';
  const round = l.frame === 'rounded' ? (l.radius ?? 0.12 * Math.min(l.w, l.h)) : radius;
  const border = l.border && l.border.width > 0 ? l.border : null;
  const clipped = !!l.frame || radius > 0 || !!border;

  const content = (c: CanvasRenderingContext2D): void => {
    if (clipped) {
      c.save();
      tracePath(c, outline, l.w, l.h, round);
      c.clip();
    }
    drawPicture(c, pic, l, crop, k, cap);
    if (border) {
      // Twice the width on the edge, clipped to the shape: the full width shows inside the picture.
      tracePath(c, outline, l.w, l.h, round);
      c.lineWidth = border.width * 2;
      c.strokeStyle = border.color;
      c.lineJoin = 'round';
      c.stroke();
    }
    if (clipped) c.restore();
  };
  const masked = (c: CanvasRenderingContext2D): void => (l.mask ? applyMask(c, l.mask, l.w, l.h, content) : content(c));

  ctx.save();
  placeLayer(ctx, l);
  // A shadow follows what is drawn with it. A clipped, bordered or masked picture is first drawn on a layer of its own, so the shadow follows the finished shape.
  const separate = !!l.shadow && (clipped || !!l.mask);
  if (l.shadow) setShadow(ctx, l.shadow, k);
  const lw = Math.max(1, Math.ceil(l.w * k));
  const lh = Math.max(1, Math.ceil(l.h * k));
  const layer = separate ? (layerCanvas = sized(layerCanvas, lw, lh)) : null;
  const lctx = layer?.getContext('2d') ?? null;
  if (layer && lctx) {
    lctx.save();
    lctx.scale(lw / l.w, lh / l.h);
    masked(lctx);
    lctx.restore();
    ctx.drawImage(layer, 0, 0, l.w, l.h);
  } else masked(ctx);
  ctx.restore();
}

// ---------------------------------------------------------------- shapes

function drawShapeLayer(ctx: CanvasRenderingContext2D, l: ShapeLayer, k: number): void {
  if (l.w < 0 || l.h < 0) return;
  ctx.save();
  placeLayer(ctx, l);
  const line = l.shape === 'line' || l.shape === 'arrow';
  const stroke = l.stroke ?? (line ? { color: l.fill ?? '#000000', width: 4 } : undefined);
  const setStroke = (): void => {
    ctx.strokeStyle = stroke!.color;
    ctx.lineWidth = stroke!.width;
    ctx.lineJoin = 'round';
    ctx.lineCap = line && !stroke!.dash ? 'round' : 'butt';
    ctx.setLineDash(stroke!.dash ? [stroke!.width * 3, stroke!.width * 2] : []);
  };
  if (line) {
    if (stroke && stroke.width > 0) {
      const y = l.h / 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(l.w, y);
      if (l.shape === 'arrow') {
        // An open head: two strokes of length `head` back from the tip, 28 degrees either side.
        const head = Math.min(l.w * 0.5, Math.max(stroke.width * 4, 12));
        const a = (28 * Math.PI) / 180;
        ctx.moveTo(l.w - head * Math.cos(a), y - head * Math.sin(a));
        ctx.lineTo(l.w, y);
        ctx.lineTo(l.w - head * Math.cos(a), y + head * Math.sin(a));
      }
      if (l.shadow) setShadow(ctx, l.shadow, k);
      setStroke();
      ctx.stroke();
    }
  } else {
    tracePath(ctx, l.shape as Outline, l.w, l.h, l.radius ?? 0);
    const hasFill = !!l.fill && l.fill !== 'transparent';
    if (hasFill) {
      if (l.shadow) setShadow(ctx, l.shadow, k);
      ctx.fillStyle = l.fill!;
      ctx.fill();
      clearShadow(ctx); // the stroke does not cast a second shadow
    }
    if (stroke && stroke.width > 0) {
      if (l.shadow && !hasFill) setShadow(ctx, l.shadow, k);
      setStroke();
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- text

function drawTextLayer(ctx: CanvasRenderingContext2D, l: Extract<PhotoLayer, { text: string }>): void {
  if (!l.rotation) {
    drawText(ctx, l.text, l.style, l.x, l.y, l.maxWidth);
    return;
  }
  const b = boundsOf(ctx, l);
  ctx.save();
  ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
  ctx.rotate((l.rotation * Math.PI) / 180);
  drawText(ctx, l.text, l.style, -b.w / 2, -b.h / 2, l.maxWidth);
  ctx.restore();
}

// ---------------------------------------------------------------- the page

/** The size of the page in output pixels for a base picture of `w` x `h` (null: not ready) and a geometry. */
export function pageSize(doc: PageDoc, base: { width: number; height: number } | null): Size | null {
  return base ? outputSize(base.width, base.height, doc.base) : null;
}

export function renderPage(ctx: CanvasRenderingContext2D, req: RenderRequest): void {
  const { doc, size } = req;
  const src = req.base ? sizeOf(req.base) : null;
  const k0 = req.scale ?? 1;
  const out: Size = src ? outputBounds(src, doc.base) : { w: size.w / k0, h: size.h / k0 };
  const k = scaleOf(req, out);
  const cap = req.pixelCap ?? DEFAULT_PIXEL_CAP;

  ctx.clearRect(0, 0, size.w, size.h);
  ctx.save();
  if (k !== 1) ctx.scale(k, k);

  if (doc.background && doc.background !== 'transparent') {
    ctx.fillStyle = doc.background;
    ctx.fillRect(0, 0, out.w, out.h);
  }
  if (src && req.base) drawBase(ctx, req, src, out);

  const shown = doc.layers.filter((l) => !isHidden(l));
  // What the picture said, covered first, so a picture layer above it can still show.
  for (const l of shown) {
    if (isImage(l) || isShape(l) || !l.erase) continue;
    ctx.fillStyle = l.erase.color;
    ctx.fillRect(l.erase.x, l.erase.y, l.erase.w, l.erase.h);
  }
  for (const l of shown) {
    if (isImage(l)) drawImageLayer(ctx, l, req.images.pictureOf(l.src), k, cap);
    else if (isShape(l)) drawShapeLayer(ctx, l, k);
    else drawTextLayer(ctx, l);
  }

  const ids = req.selected ?? [];
  for (const l of shown) {
    if (!ids.includes(l.id)) continue;
    const b = boxOfLayer(l, ctx);
    ctx.save();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(2, out.w / 400);
    ctx.setLineDash([8, 6]);
    if (b.rotation) {
      ctx.translate(b.cx, b.cy);
      ctx.rotate((b.rotation * Math.PI) / 180);
      ctx.strokeRect(-b.w / 2 - 4, -b.h / 2 - 4, b.w + 8, b.h + 8);
    } else ctx.strokeRect(b.cx - b.w / 2 - 4, b.cy - b.h / 2 - 4, b.w + 8, b.h + 8);
    ctx.restore();
  }
  ctx.restore();
}

/** Sizes the canvas to `req.size` (only when it differs: setting the size clears it) and draws the page on it. Returns false when the browser gives no 2D context. */
export function renderToCanvas(canvas: HTMLCanvasElement, req: RenderRequest): boolean {
  const w = Math.max(1, Math.round(req.size.w));
  const h = Math.max(1, Math.round(req.size.h));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  renderPage(ctx, req);
  return true;
}
