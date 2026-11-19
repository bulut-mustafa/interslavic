import type * as H from '../editor/history.ts';
import type { TextLayer } from '../editor/layers.ts';
import type { Adjust, Blend } from '../video/project.ts';
import type { Chroma, Mask } from '../video/effects.ts';

/**
 * The photo editor's page as one plain value, so it can be undone, saved and
 * handed to the renderer and the exporter alike.
 *
 *  - `base` is what is done to the picture itself, without touching its pixels
 *    on disk: geometry (crop, turn, flip) and colour (adjust, preset). The
 *    original file is always kept, so "Restore" and "Reset" are exact.
 *  - `layers` sit on top of the picture, in drawing order (later = in front):
 *    text (the editor's existing TextLayer), pictures and shapes. Positions are
 *    in the OUTPUT picture's pixels, i.e. after the base geometry is applied.
 *
 * Old pages (a history of text layers only) are upgraded by `fromV1`.
 */

/** Geometry applied to the picture: first flip, then straighten + turn about the centre, then crop. All optional = untouched. */
export interface Geometry {
  /** Crop rectangle in the picture's ORIGINAL pixels, before turning; missing = the whole picture. */
  crop?: { x: number; y: number; w: number; h: number };
  /** Quarter turns clockwise: 0..3. */
  turns?: 0 | 1 | 2 | 3;
  /** Fine rotation in degrees, -45..45 (straighten), clockwise. */
  straighten?: number;
  flipX?: boolean;
  flipY?: boolean;
}

export interface BaseEdit extends Geometry {
  adjust?: Adjust;
  /** A named look (see photo/presets.ts); applied before `adjust`. */
  preset?: string;
  /** How strongly the preset shows, 0..1; 1 when missing. */
  presetAmount?: number;
  /**
   * Set when "Replace the background" was used: the id of the stored file (a PNG with transparency, the whole picture at the
   * working size, from photo/CutoutDialog.tsx onReplace) that is drawn instead of the original pixels. Geometry and colour still
   * apply on top of it; clearing this shows the original again. A cut-out kept as its own picture layer is an ImageLayer with `cutoutOf`.
   */
  background?: string;
}

export interface Shadow {
  color: string;
  blur: number;
  x: number;
  y: number;
  opacity: number;
}

export interface Border {
  color: string;
  width: number;
}

/** Things every non-text layer has. Position is the top-left before rotation; rotation is about the centre. */
interface Placed {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rotation: number;
  /** 0..1 */
  opacity: number;
  blend: Blend;
  flipX?: boolean;
  flipY?: boolean;
  /** Corner rounding in pixels (pictures and rectangles). */
  radius?: number;
  border?: Border;
  shadow?: Shadow;
  /** Locked layers cannot be picked or moved on the canvas; they can still be selected in the layers panel. */
  locked?: boolean;
  hidden?: boolean;
  /** A name shown in the layers panel. */
  name?: string;
}

/** A picture placed on the page. The pixels live in `src` (a file kept next to the page, by id). */
export interface ImageLayer extends Placed {
  kind: 'image';
  src: string;
  /** The part of the picture shown, in its own pixels; missing = all of it. */
  crop?: { x: number; y: number; w: number; h: number };
  adjust?: Adjust;
  mask?: Mask;
  chroma?: Chroma;
  /** Shows the picture inside a shape instead of a rectangle. */
  frame?: 'ellipse' | 'heart' | 'star' | 'triangle' | 'rounded';
  /** This picture is the cut-out of another (background removed): the id of the layer or `base` it came from. */
  cutoutOf?: string;
}

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'star' | 'heart' | 'line' | 'arrow';

export interface ShapeLayer extends Placed {
  kind: 'shape';
  shape: ShapeKind;
  fill?: string;
  /** Lines and arrows use `stroke`; other shapes may have both. */
  stroke?: { color: string; width: number; dash?: boolean };
}

export type PhotoLayer = TextLayer | ImageLayer | ShapeLayer;

export const isImage = (l: PhotoLayer): l is ImageLayer => (l as ImageLayer).kind === 'image';
export const isShape = (l: PhotoLayer): l is ShapeLayer => (l as ShapeLayer).kind === 'shape';
export const isText = (l: PhotoLayer): l is TextLayer => !isImage(l) && !isShape(l);

export interface PageDoc {
  base: BaseEdit;
  layers: PhotoLayer[];
  /** What shows where the picture does not fill the page (after a turn/straighten): a colour, or 'transparent'. */
  background: string;
}

export const emptyDoc = (): PageDoc => ({ base: {}, layers: [], background: 'transparent' });

/** An old page (text layers only) as a document. */
export const fromV1 = (layers: TextLayer[]): PageDoc => ({ base: {}, layers, background: 'transparent' });

export const historyFromV1 = (h: H.History<TextLayer[]>): H.History<PageDoc> => ({
  past: h.past.map(fromV1),
  present: fromV1(h.present),
  future: h.future.map(fromV1),
});

/** Whether the picture itself has been changed (geometry or colour). */
export function baseEdited(b: BaseEdit): boolean {
  return !!(b.crop || b.turns || b.straighten || b.flipX || b.flipY || b.preset || (b.adjust && Object.values(b.adjust).some((v) => v)) || b.background);
}

/** Whether the page has any edit at all (what the page strip's dot and the leave-warning use). */
export const docEdited = (d: PageDoc): boolean => d.layers.length > 0 || baseEdited(d.base);

/** The size of the output picture for a source of `w` x `h` pixels after the geometry (before any later scaling). */
export function outputSize(w: number, h: number, g: Geometry): { w: number; h: number } {
  const c = g.crop ?? { x: 0, y: 0, w, h };
  const swap = (g.turns ?? 0) % 2 === 1;
  return swap ? { w: c.h, h: c.w } : { w: c.w, h: c.h };
}
