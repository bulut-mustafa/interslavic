/** Pure geometry for touch gestures; no DOM, so it is unit-tested directly (test/phone-gesture-math.test.ts). */

export interface Pt {
  x: number;
  y: number;
}

/** Straight-line distance between two points, in px. */
export const distance = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Angle of the line a -> b in degrees, -180..180 (0 = pointing right, y grows downward so positive = clockwise on screen). */
export const angleDeg = (a: Pt, b: Pt): number => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

/** The point halfway between two. */
export const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Whether `to` is further than `threshold` px from `from` (strictly). */
export const movedBeyond = (from: Pt, to: Pt, threshold: number): boolean => distance(from, to) > threshold;

/** The shortest signed turn from angle `from` to angle `to`, in degrees (-180..180], so crossing the +-180 seam does not jump 360. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Scale factor of a pinch: current finger distance over the distance when it began (1 when it began at 0). */
export const pinchScale = (startDist: number, curDist: number): number => (startDist > 0 ? curDist / startDist : 1);

/** Whether a second tap at `b` (time `tb` ms) makes a double tap with the first at `a` (time `ta`). */
export const isDoubleTap = (a: Pt, ta: number, b: Pt, tb: number, maxGapMs = 300, maxDist = 30): boolean =>
  tb - ta <= maxGapMs && distance(a, b) <= maxDist;
