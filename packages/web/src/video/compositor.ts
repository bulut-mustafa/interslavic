import { boundsOf, type TextLayer } from '../editor/layers.ts';
import { drawText } from '../editor/text-style.ts';
import { boxOf, stackOrder } from './boxes.ts';
import type { DrawFrame } from './contracts.ts';
import { editLength, isMedia, type Blend, type MediaLayer } from './project.ts';
import { applyAdjustPixels, applyMask, CHROMA_MAX_PIXELS, chromaKey, cssFilter, needsPixelPass } from './effects.ts';
import { resolve } from './keyframes.ts';
import { locate, total, type Clip } from './timeline.ts';
import { animOf, type AnimFactors } from './text-anim.ts';
import { drawTransition, transitionAt } from './transitions.ts';

/**
 * Draws one frame of the edit: the background, the main-track clip, then every
 * picture layer from the lowest lane to the highest. Preview and export both
 * call this, so what is shown is what is saved. It reads pictures from the
 * `MediaFeed` and never throws for a picture that is not ready: that layer is
 * simply left out of the frame.
 */

/** Canvas blend names for the project's `Blend` values (MDN: globalCompositeOperation). */
export const BLEND_OP: Record<Blend, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
};

/** Pixel size of a picture source, or null when it is not known. */
function sizeOf(src: CanvasImageSource): { w: number; h: number } | null {
  const s = src as Partial<Record<'videoWidth' | 'videoHeight' | 'naturalWidth' | 'naturalHeight' | 'width' | 'height', unknown>>;
  const num = (v: unknown): number => (typeof v === 'number' && v > 0 ? v : 0);
  const w = num(s.videoWidth) || num(s.naturalWidth) || num(s.width);
  const h = num(s.videoHeight) || num(s.naturalHeight) || num(s.height);
  return w && h ? { w, h } : null;
}

/** Where a picture of size `from` lands in a frame of size `to`: whole picture (contain) or filling it (cover), centred. */
export function fitRect(from: { w: number; h: number }, to: { w: number; h: number }, fit: 'contain' | 'cover'): { x: number; y: number; w: number; h: number } {
  const k = fit === 'cover' ? Math.max(to.w / from.w, to.h / from.h) : Math.min(to.w / from.w, to.h / from.h);
  const w = from.w * k;
  const h = from.h * k;
  return { x: (to.w - w) / 2, y: (to.h - h) / 2, w, h };
}

const filterSupport = new WeakMap<object, boolean>();
/**
 * Whether this context really applies `filter`. Browsers without it (Safari
 * ships it off by default) either lack the property or ignore the assignment,
 * so we assign a value and read it back. When unsupported, brightness,
 * contrast, saturation and hue are done in a per-pixel pass instead (see
 * drawPixelPassed); only blur is not shown, as it is too costly per frame.
 */
export function supportsFilter(ctx: CanvasRenderingContext2D): boolean {
  const known = filterSupport.get(ctx);
  if (known !== undefined) return known;
  let ok = false;
  try {
    // Assigning to a missing property would just create one that reads back, so the property must already exist.
    if (!('filter' in ctx)) throw new Error('no filter');
    ctx.filter = 'blur(1px)';
    ok = ctx.filter === 'blur(1px)';
    ctx.filter = 'none';
  } catch {
    ok = false;
  }
  filterSupport.set(ctx, ok);
  return ok;
}

const OUTLINE = '#1f6b6b';

export const drawFrame: DrawFrame = (ctx, req) => {
  const { project, time, size, media } = req;
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.fillStyle = project.background;
  ctx.fillRect(0, 0, size.w, size.h);

  // Main track. Inside a transition both clips are drawn and blended; the transition comes first because `locate` still names one clip there.
  const at = locate(project.clips, time);
  const paint = (clip: Clip) => (c: CanvasRenderingContext2D) => {
    const pic = media.picture(clip.id);
    if (!pic) return;
    const from = sizeOf(pic);
    const r = from ? fitRect(from, size, clip.fit ?? 'contain') : { x: 0, y: 0, w: size.w, h: size.h };
    c.globalAlpha = alphaOf(c) * (clip.opacity ?? 1); // multiplied, never assigned: drawTransition sets globalAlpha for fades
    c.drawImage(pic, r.x, r.y, r.w, r.h);
  };
  const tr = transitionAt(project.clips, time);
  if (tr) drawTransition(ctx, tr.kind, tr.progress, size, paint(project.clips[tr.fromIndex]!), paint(project.clips[tr.toIndex]!));
  else if (at) {
    ctx.save();
    paint(project.clips[at.index]!)(ctx);
    ctx.restore();
  }

  const editEnd = editLength(project, total(project.clips));
  const shown = stackOrder(project.layers)
    .filter((l) => (l.start === undefined || time >= l.start) && (l.end === undefined || time < l.end))
    // Each layer as it is at this moment: keyframed values applied, and how far through its in/out/loop animation it is.
    .map((l) => {
      const tl = time - (l.start ?? 0);
      const r = resolve(l as Parameters<typeof resolve>[0], tl) as typeof l;
      return { l: r, a: animOf(r, tl, (l.end ?? editEnd) - (l.start ?? 0)) };
    });
  for (const { l, a } of shown) {
    if (isMedia(l)) drawMedia(ctx, l, media.picture(l.id), a);
    else drawTextLayer(ctx, l as TextLayer, a);
  }

  // Outlines of the selected layers, on top of everything.
  const ids = req.selected ?? [];
  for (const { l } of shown) {
    if (!ids.includes(l.id)) continue;
    const b = boxOf(l, ctx);
    if (!b) continue;
    ctx.save();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(2, size.w / 400);
    ctx.setLineDash([8, 6]);
    if (b.rotation) {
      ctx.translate(b.cx, b.cy);
      ctx.rotate((b.rotation * Math.PI) / 180);
      ctx.strokeRect(-b.w / 2 - 4, -b.h / 2 - 4, b.w + 8, b.h + 8);
    } else ctx.strokeRect(b.cx - b.w / 2 - 4, b.cy - b.h / 2 - 4, b.w + 8, b.h + 8);
    ctx.restore();
  }
};

/** The current alpha of a context (1 if it cannot be read), so an effect can multiply into it instead of replacing it. */
const alphaOf = (c: CanvasRenderingContext2D): number => (typeof c.globalAlpha === 'number' ? c.globalAlpha : 1);

/** Whether an animation changes anything at this moment. */
const animated = (a: AnimFactors): boolean => a.dx !== 0 || a.dy !== 0 || a.scale !== 1 || a.opacity !== 1 || a.chars !== 1;

/** One scratch surface for the per-pixel passes, kept between frames so none is made per frame. */
let scratch: HTMLCanvasElement | null = null;

/** Drops the kept scratch surface (tests; a fresh one is made on next use). */
export const resetScratch = (): void => {
  scratch = null;
};

/** The layer's picture through the per-pixel passes (adjustments a browser cannot do itself, green screen), drawn into the box (0,0,w,h). */
function drawPixelPassed(c: CanvasRenderingContext2D, pic: CanvasImageSource, l: MediaLayer, w: number, h: number, hasFilter: boolean): void {
  // At most CHROMA_MAX_PIXELS are touched: a bigger layer is worked on scaled down and drawn back up.
  const k = Math.min(1, Math.sqrt(CHROMA_MAX_PIXELS / Math.max(1, w * h)));
  const sw = Math.max(1, Math.round(w * k));
  const sh = Math.max(1, Math.round(h * k));
  scratch ??= document.createElement('canvas');
  // Setting width/height reallocates and clears the bitmap, so only do it when the size changed; otherwise clear in place.
  const resized = scratch.width !== sw || scratch.height !== sh;
  if (resized) {
    scratch.width = sw;
    scratch.height = sh;
  }
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!sctx) return;
  if (!resized) sctx.clearRect(0, 0, sw, sh); // drawImage composites over what is there, so stale pixels must go
  sctx.drawImage(pic, 0, 0, sw, sh);
  const img = sctx.getImageData(0, 0, sw, sh);
  if (needsPixelPass(l.adjust ?? {}, hasFilter)) applyAdjustPixels(img, l.adjust ?? {}, hasFilter ? { extrasOnly: true } : undefined);
  if (l.chroma) chromaKey(img, l.chroma);
  sctx.putImageData(img, 0, 0);
  if (hasFilter) c.filter = cssFilter(l.adjust ?? {});
  c.drawImage(scratch, 0, 0, w, h);
  if (hasFilter) c.filter = 'none';
}

function drawMedia(ctx: CanvasRenderingContext2D, l: MediaLayer, pic: CanvasImageSource | null, a: AnimFactors): void {
  if (!pic) return;
  ctx.save();
  ctx.translate(l.x + l.w / 2 + a.dx * l.w, l.y + l.h / 2 + a.dy * l.h);
  if (l.rotation) ctx.rotate((l.rotation * Math.PI) / 180);
  if (a.scale !== 1) ctx.scale(a.scale, a.scale);
  ctx.globalAlpha = l.opacity * a.opacity;
  ctx.globalCompositeOperation = BLEND_OP[l.blend] ?? 'source-over';
  ctx.translate(-l.w / 2, -l.h / 2);
  const hasFilter = supportsFilter(ctx);
  const pixel = !!l.chroma || needsPixelPass(l.adjust ?? {}, hasFilter);
  const draw = (c: CanvasRenderingContext2D): void => {
    if (pixel) {
      drawPixelPassed(c, pic, l, l.w, l.h, hasFilter);
      return;
    }
    const f = cssFilter(l.adjust ?? {});
    if (hasFilter && f !== 'none') c.filter = f;
    c.drawImage(pic, 0, 0, l.w, l.h);
    if (hasFilter && f !== 'none') c.filter = 'none';
  };
  if (l.mask) applyMask(ctx, l.mask, l.w, l.h, draw);
  else draw(ctx);
  ctx.restore();
}

function drawTextLayer(ctx: CanvasRenderingContext2D, l: TextLayer, a: AnimFactors): void {
  if (l.erase) {
    ctx.fillStyle = l.erase.color;
    ctx.fillRect(l.erase.x, l.erase.y, l.erase.w, l.erase.h);
  }
  const text = a.chars < 1 ? l.text.slice(0, Math.round(a.chars * l.text.length)) : l.text;
  if (!l.rotation && !animated(a)) {
    drawText(ctx, text, l.style, l.x, l.y, l.maxWidth);
    return;
  }
  // The box comes from the whole text, so it does not jump about while the letters appear.
  const b = boundsOf(ctx, l);
  ctx.save();
  ctx.translate(b.x + b.w / 2 + a.dx * b.w, b.y + b.h / 2 + a.dy * b.h);
  if (l.rotation) ctx.rotate((l.rotation * Math.PI) / 180);
  if (a.scale !== 1) ctx.scale(a.scale, a.scale);
  ctx.globalAlpha = alphaOf(ctx) * a.opacity;
  drawText(ctx, text, l.style, -b.w / 2, -b.h / 2, l.maxWidth);
  ctx.restore();
}
