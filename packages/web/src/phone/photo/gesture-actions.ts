import type { LayerBox } from '../../video/contracts.ts';
import { boxOfMedia, MIN_SIZE, normalizeDeg, patchOfBox } from '../../editor/transform-math.ts';
import { isImage, isShape, isText, type PhotoLayer } from '../../photo/doc.ts';
import { snapMove, type Guide } from '../../photo/guides.ts';
import { nudge, type Measure } from '../../photo/layer-ops.ts';
import { clampDelta } from '../../photo/page-ops.ts';

/**
 * What a touch does to the page, as pure functions of the layers: the phone's gestures only measure fingers and call these
 * (and the editor's own `edit`), so the maths is tested without a screen (test/phone-photo-math.test.ts).
 */

/** One finger drags the selected layers: `dx`/`dy` in page px since the finger went down. Keeps part of the group on the page and snaps to the page and other layers like the desktop drag does. */
export function planMove(opts: {
  base: readonly PhotoLayer[];
  ids: readonly string[];
  rect: { x: number; y: number; w: number; h: number };
  others: readonly LayerBox[];
  dx: number;
  dy: number;
  page: { w: number; h: number };
  /** Screen px per page px (snapping is a few screen pixels wide). */
  k: number;
  snap?: boolean;
}): { layers: PhotoLayer[]; guides: Guide[] } {
  const { rect, page } = opts;
  let { dx, dy } = clampDelta(rect, opts.dx, opts.dy, page);
  let guides: Guide[] = [];
  if (opts.snap !== false) {
    const box: LayerBox = { id: 'selection', cx: rect.x + rect.w / 2 + dx, cy: rect.y + rect.h / 2 + dy, w: rect.w, h: rect.h, rotation: 0 };
    const s = snapMove(box, opts.others, page, 6, opts.k);
    dx += s.dx;
    dy += s.dy;
    guides = s.guides;
  }
  return { layers: nudge(opts.base, opts.ids, dx, dy), guides };
}

export interface Pinch {
  /** Finger distance now / at the start. */
  scale: number;
  /** Degrees turned since the start, clockwise positive. */
  rotation: number;
  /** Travel of the fingers' midpoint since the start, in page px. */
  dx: number;
  dy: number;
}

export const MIN_TEXT_SIZE = 8;

/**
 * The layer after a two-finger pinch that began on it: a picture or shape is scaled (ratio kept) and turned about its centre, and
 * moves with the fingers; text changes its size (and wrap width) and turns, staying centred where it was. `base` is the layer as it was
 * when the pinch began, so the whole pinch is one undo step.
 */
export function pinchLayer(base: PhotoLayer, t: Pinch, measure: Measure, page: { w: number; h: number }): PhotoLayer {
  if (isImage(base) || isShape(base)) {
    const b = boxOfMedia(base);
    const w = Math.max(MIN_SIZE, b.w * t.scale);
    const h = Math.max(MIN_SIZE, b.h * t.scale);
    const next: LayerBox = { ...b, cx: b.cx + t.dx, cy: b.cy + t.dy, w, h, rotation: normalizeDeg(b.rotation + t.rotation) };
    return { ...base, ...patchOfBox(next) } as PhotoLayer;
  }
  if (!isText(base)) return base;
  const maxSize = Math.max(60, Math.round(page.h / 2));
  const size = Math.min(maxSize, Math.max(MIN_TEXT_SIZE, Math.round(base.style.size * t.scale)));
  const before = measure(base);
  const cx = base.x + before.w / 2 + t.dx;
  const cy = base.y + before.h / 2 + t.dy;
  const next = { ...base, maxWidth: base.maxWidth > 0 ? Math.round(base.maxWidth * (size / base.style.size)) : 0, style: { ...base.style, size }, rotation: normalizeDeg((base.rotation ?? 0) + t.rotation) };
  const after = measure(next);
  return { ...next, x: cx - after.w / 2, y: cy - after.h / 2 };
}

/** The first few degrees of a pinch are the fingers wobbling, not a turn: they are ignored, and the turn then grows from zero (no jump). */
export const SOFT_ROTATION_DEG = 4;
export const softRotation = (deg: number): number => (Math.abs(deg) <= SOFT_ROTATION_DEG ? 0 : deg - Math.sign(deg) * SOFT_ROTATION_DEG);
