/**
 * Pure maths for how the picture sits in the phone's stage: fitted, zoomed and panned. No DOM; tested in test/phone-photo-math.test.ts.
 * Stage coordinates are CSS px from the stage's top-left; page coordinates are the picture's own pixels (the output size).
 */

export interface Size {
  w: number;
  h: number;
}
export interface Pan {
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
/** Space kept round a fitted picture, px. */
export const STAGE_MARGIN = 12;
/** How far past the edge a zoomed picture may be dragged, px, so a corner can always be reached. */
const PAN_SLACK = 48;

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Screen px per page px when the whole page fits the stage with a margin. */
export function fitScale(stage: Size, page: Size, margin = STAGE_MARGIN): number {
  const w = Math.max(1, stage.w - margin * 2);
  const h = Math.max(1, stage.h - margin * 2);
  return Math.min(w / Math.max(1, page.w), h / Math.max(1, page.h));
}

export interface Placement {
  /** Screen px per page px, zoom included. */
  k: number;
  /** The drawn page's size, px. */
  width: number;
  height: number;
  /** Its top-left in stage coordinates. */
  left: number;
  top: number;
}

/** Where the page is drawn for a zoom and a pan (pan 0,0 = centred). */
export function placement(stage: Size, page: Size, zoom: number, pan: Pan): Placement {
  const k = fitScale(stage, page) * zoom;
  const width = page.w * k;
  const height = page.h * k;
  return { k, width, height, left: (stage.w - width) / 2 + pan.x, top: (stage.h - height) / 2 + pan.y };
}

/** Keeps a pan so the picture cannot be lost: no pan while it is smaller than the stage on that axis. */
export function clampPan(stage: Size, drawn: Size, pan: Pan): Pan {
  const lx = Math.max(0, (drawn.w - stage.w) / 2 + PAN_SLACK);
  const ly = Math.max(0, (drawn.h - stage.h) / 2 + PAN_SLACK);
  return { x: drawn.w + 2 * STAGE_MARGIN <= stage.w ? 0 : clamp(pan.x, -lx, lx), y: drawn.h + 2 * STAGE_MARGIN <= stage.h ? 0 : clamp(pan.y, -ly, ly) };
}

/**
 * The zoom and pan after a pinch: `zoom0`/`pan0` are what they were when it began, `scale` the finger distance ratio, `focus` the
 * midpoint of the fingers when it began and `move` how far that midpoint has travelled since. The page point under the focus stays under
 * the fingers (zoom about the fingers), and the midpoint's travel pans.
 */
export function zoomAbout(stage: Size, page: Size, zoom0: number, pan0: Pan, scale: number, focus: Pan, move: Pan): { zoom: number; pan: Pan } {
  const zoom = clamp(zoom0 * scale, MIN_ZOOM, MAX_ZOOM);
  const ratio = zoom / zoom0;
  // Origin of the page (its centre) in stage coordinates before: stage centre + pan.
  const cx = stage.w / 2 + pan0.x;
  const cy = stage.h / 2 + pan0.y;
  const nx = focus.x - (focus.x - cx) * ratio + move.x;
  const ny = focus.y - (focus.y - cy) * ratio + move.y;
  const drawn = { w: page.w * fitScale(stage, page) * zoom, h: page.h * fitScale(stage, page) * zoom };
  return { zoom, pan: clampPan(stage, drawn, { x: nx - stage.w / 2, y: ny - stage.h / 2 }) };
}

/** A stage point as a page point. */
export const toPage = (p: Pan, at: Placement): Pan => ({ x: (p.x - at.left) / at.k, y: (p.y - at.top) / at.k });

/** A page rectangle as a stage rectangle. */
export const toStageRect = (r: { x: number; y: number; w: number; h: number }, at: Placement): { x: number; y: number; width: number; height: number } => ({
  x: at.left + r.x * at.k,
  y: at.top + r.y * at.k,
  width: r.w * at.k,
  height: r.h * at.k,
});

/** The pan that brings a stage rectangle into the visible part of the stage (above a keyboard, say), moving as little as it can; a box too tall for the room keeps its top in view. */
export function revealPan(stage: Size, rect: { x: number; y: number; width: number; height: number }, pan: Pan, margin = 16): Pan {
  const axis = (pos: number, len: number, room: number, p: number): number => {
    let shift = 0;
    if (pos + len > room - margin) shift = pos + len - (room - margin);
    if (pos - shift < margin) shift = pos - margin;
    return p - shift;
  };
  return { x: axis(rect.x, rect.width, stage.w, pan.x), y: axis(rect.y, rect.height, stage.h, pan.y) };
}
