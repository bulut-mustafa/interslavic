import { clampPosition } from '../../editor/layers.ts';
import { MIN_SIZE } from '../../editor/transform-math.ts';

/** Pure maths for moving, pinching and turning a layer on the phone preview. Frame pixels in, patches out. */

export const MIN_TEXT = 8;

/** CSS px on the screen -> frame px: `k` is screen px per frame px (the preview's width over the frame's). */
export const toFrameDelta = (px: number, k: number): number => px / (k || 1);

/** A turn within this many degrees of a right angle (or straight) snaps to it, so a flat picture is easy to get back. */
export const ANGLE_SNAP = 4;
export function snapAngle(deg: number): number {
  const a = ((((deg % 360) + 540) % 360) - 180); // -180..180
  for (const stop of [-180, -90, 0, 90, 180]) if (Math.abs(a - stop) <= ANGLE_SNAP) return stop === 180 || stop === -180 ? 180 : stop;
  return a;
}

export interface Place {
  x: number;
  y: number;
}

/** A layer's top-left after the finger moved by (dx, dy) screen px from where the drag began, kept on the frame. */
export function movedTo(base: Place, dx: number, dy: number, k: number, frame: { w: number; h: number }): Place {
  return clampPosition(base.x + toFrameDelta(dx, k), base.y + toFrameDelta(dy, k), frame);
}

export interface MediaBase extends Place {
  w: number;
  h: number;
  rotation: number;
}

/** A picture or video after a pinch (`scale`, about its own centre) and a turn (`rotation` degrees), moved with the fingers' midpoint. */
export function transformedMedia(base: MediaBase, scale: number, rotation: number, pan: { dx: number; dy: number }, k: number): MediaBase {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const w = Math.max(MIN_SIZE, base.w * s);
  const h = Math.max(MIN_SIZE, base.h * s);
  const cx = base.x + base.w / 2 + toFrameDelta(pan.dx, k);
  const cy = base.y + base.h / 2 + toFrameDelta(pan.dy, k);
  return { x: cx - w / 2, y: cy - h / 2, w, h, rotation: snapAngle(base.rotation + rotation) };
}

/** Text after a pinch: its size scales (within limits), and it turns. */
export function transformedText(base: { size: number; rotation: number }, scale: number, rotation: number, maxSize: number): { size: number; rotation: number } {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return { size: Math.min(maxSize, Math.max(MIN_TEXT, Math.round(base.size * s))), rotation: snapAngle(base.rotation + rotation) };
}

/** Canvas pixels per frame pixel for a preview shown at most `screenW` CSS px wide: enough for `dpr` (at most 2) pixels per CSS px, never above 1, never below a quarter, and never fewer than 640 pixels across. */
export function previewScale(frameW: number, screenW: number, dpr: number): number {
  if (!(frameW > 0) || !(screenW > 0)) return 1;
  const want = Math.max(640, screenW * Math.min(Math.max(dpr || 1, 1), 2));
  return Math.min(1, Math.max(0.25, want / frameW));
}
