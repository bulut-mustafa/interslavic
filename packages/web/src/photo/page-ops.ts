import type { TextLayer } from '../editor/layers.ts';
import { corners } from '../editor/transform-math.ts';
import type { LayerBox } from '../video/contracts.ts';
import type { FxAdjust } from '../video/effects.ts';
import type { AdjustPatch } from './AdjustPanel.tsx';
import { isImage, isShape, isText, type BaseEdit, type Geometry, type PhotoLayer } from './doc.ts';
import { sameGeometry } from './geometry.ts';
import { isHidden, isLocked } from './layer-ops.ts';
import { PRESETS, presetAdjust } from './presets.ts';
import type { Handle } from './guides.ts';

/**
 * Small pure helpers between the editor and the part modules (doc, geometry, layer-ops, guides):
 * the glue that has no business inside a component, so it can be tested without one.
 */

/** Only the geometry fields of a base edit. */
export const geometryOf = (b: BaseEdit): Geometry => ({ crop: b.crop, turns: b.turns, straighten: b.straighten, flipX: b.flipX, flipY: b.flipY });

/** The base edit with its geometry replaced by `g` (a field that is off is removed, not left as undefined/0). */
export function withGeometry(b: BaseEdit, g: Geometry): BaseEdit {
  const { crop: _c, turns: _t, straighten: _s, flipX: _x, flipY: _y, ...rest } = b;
  return {
    ...rest,
    ...(g.crop ? { crop: g.crop } : {}),
    ...(g.turns ? { turns: g.turns } : {}),
    ...(g.straighten ? { straighten: g.straighten } : {}),
    ...(g.flipX ? { flipX: true } : {}),
    ...(g.flipY ? { flipY: true } : {}),
  };
}

/** The picture is shown as it came: no crop, turn, flip or straighten. */
export const isIdentityGeometry = (b: BaseEdit): boolean => sameGeometry(geometryOf(b), {});

/** The base edit without any colour edit (what Compare shows): geometry (and a replaced background) stay, so layers still line up. */
export function withoutColour(b: BaseEdit): BaseEdit {
  const { adjust: _a, preset: _p, presetAmount: _m, ...rest } = b;
  return rest;
}

/** The geometry without its crop, as the crop tool shows the picture (the whole picture, turned and flipped). */
export function withoutCrop(g: Geometry): Geometry {
  const { crop: _c, ...rest } = g;
  return rest;
}

/** A patch from the adjust panel applied to a base edit. A key present with `undefined` removes the setting. */
export function applyAdjustPatch(b: BaseEdit, patch: AdjustPatch): BaseEdit {
  const out: BaseEdit = { ...b };
  if ('adjust' in patch) out.adjust = patch.adjust;
  if ('preset' in patch) {
    if (patch.preset === undefined) {
      delete out.preset;
      delete out.presetAmount;
    } else out.preset = patch.preset;
  }
  if ('presetAmount' in patch && patch.presetAmount !== undefined) out.presetAmount = patch.presetAmount;
  return out;
}

/** The renderer's `presets` callback: the colour edit a named look stands for, null for an unknown name. */
export const presetsFor = (id: string, amount: number): FxAdjust | null => (PRESETS.some((p) => p.id === id) ? (presetAdjust(id, amount) as FxAdjust) : null);

/** Text layers only, as `TextLayer`s. */
export const textOnly = (layers: readonly PhotoLayer[]): TextLayer[] => layers.filter(isText);

/** Changes the chosen TEXT layers (other kinds with those ids are left alone). */
export const mapText = (all: PhotoLayer[], ids: readonly string[], f: (l: TextLayer) => TextLayer): PhotoLayer[] => all.map((l) => (ids.includes(l.id) && isText(l) ? f(l) : l));

/** A patch of a picture's or shape's own fields onto the chosen such layers; a key whose value is `undefined` is removed. */
export function patchObjects(layers: PhotoLayer[], ids: readonly string[], patch: Record<string, unknown>): PhotoLayer[] {
  return layers.map((l) => {
    if (!ids.includes(l.id) || isText(l)) return l;
    const next: Record<string, unknown> = { ...l };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    return next as unknown as PhotoLayer;
  });
}

/** The ids of the files the picture layers use. */
export const srcsOf = (layers: readonly PhotoLayer[]): string[] => [...new Set(layers.filter(isImage).map((l) => l.src))];

/** The layers that a pointer or the keys may move: shown and unlocked. */
export const movable = (layers: readonly PhotoLayer[], ids: readonly string[]): string[] => layers.filter((l) => ids.includes(l.id) && !isHidden(l) && !isLocked(l)).map((l) => l.id);

/** Every layer that can be picked on the canvas (shown, not locked). */
export const selectable = (layers: readonly PhotoLayer[]): string[] => layers.filter((l) => !isHidden(l) && !isLocked(l)).map((l) => l.id);

/**
 * Which resize handle was dragged, from the box before and after (upright boxes only): an edge that moved while its opposite one did
 * not. Null when it cannot be told (both sides moved: a resize from the centre, or a move; or nothing moved).
 */
export function inferHandle(before: LayerBox, after: LayerBox): Handle | null {
  if (before.rotation % 360 !== 0 || after.rotation % 360 !== 0) return null;
  const e = (b: LayerBox) => ({ l: b.cx - b.w / 2, r: b.cx + b.w / 2, t: b.cy - b.h / 2, b: b.cy + b.h / 2 });
  const p = e(before);
  const q = e(after);
  const moved = (a: number, b: number) => Math.abs(a - b) > 1e-6;
  const lm = moved(p.l, q.l);
  const rm = moved(p.r, q.r);
  const tm = moved(p.t, q.t);
  const bm = moved(p.b, q.b);
  if ((lm && rm) || (tm && bm)) return null;
  const x = rm ? 'e' : lm ? 'w' : '';
  const y = bm ? 's' : tm ? 'n' : '';
  const h = `${y}${x}`;
  return h ? (h as Handle) : null;
}

/** How far a group may be moved by (dx, dy) so at least `keep` pixels of its rectangle stay on the page. */
export function clampDelta(rect: { x: number; y: number; w: number; h: number }, dx: number, dy: number, page: { w: number; h: number }, keep = 24): { dx: number; dy: number } {
  const k = Math.min(keep, rect.w, rect.h);
  const x = rect.x + dx;
  const y = rect.y + dy;
  let cx = dx;
  let cy = dy;
  if (x + rect.w < k) cx += k - (x + rect.w);
  else if (x > page.w - k) cx += page.w - k - x;
  if (y + rect.h < k) cy += k - (y + rect.h);
  else if (y > page.h - k) cy += page.h - k - y;
  return { dx: cx, dy: cy };
}

/** The corners of a layer box as an upright rectangle that holds them. */
export function uprightOf(b: LayerBox): { x: number; y: number; w: number; h: number } {
  const cs = corners(b);
  const x0 = Math.min(...cs.map((p) => p.x));
  const x1 = Math.max(...cs.map((p) => p.x));
  const y0 = Math.min(...cs.map((p) => p.y));
  const y1 = Math.max(...cs.map((p) => p.y));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export { isImage, isShape, isText };
