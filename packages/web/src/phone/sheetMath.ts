/** Pure sheet geometry (no DOM), unit-tested in test/phone-sheet-math.test.ts. */

export type Detent = 'half' | 'full' | number;

/** Default heights as a percentage of the viewport height; a number detent is used as-is (percent). */
export const DETENT_PERCENT = { half: 45, full: 85 } as const;

export const detentPercent = (d: Detent): number => (typeof d === 'number' ? d : DETENT_PERCENT[d]);

/**
 * Visible heights in px for the detents, ascending, and the offsets (px the
 * sheet is pushed down from its tallest position) that go with them. The
 * sheet element is as tall as its tallest detent; `hidden` is the offset that
 * pushes it fully off screen.
 */
export function layout(detents: Detent[], viewportH: number): { heights: number[]; max: number; offsets: number[]; hidden: number } {
  const heights = detents.map((d) => Math.round((detentPercent(d) / 100) * viewportH)).sort((a, b) => a - b);
  const max = heights[heights.length - 1] ?? 0;
  return { heights, max, offsets: heights.map((h) => max - h), hidden: max };
}

/**
 * Where a released drag settles: project the position forward by the release
 * velocity (px/ms, positive = downward), then take the nearest of `offsets`
 * (and `hidden`, if the sheet may be dismissed). Returns an index into offsets,
 * or -1 for dismiss.
 */
export function settle(offset: number, velocity: number, offsets: number[], hidden: number, dismissible: boolean, lookaheadMs = 150): number {
  const projected = offset + velocity * lookaheadMs;
  let best = -1;
  let bestDist = dismissible ? Math.abs(projected - hidden) : Infinity;
  offsets.forEach((o, i) => {
    const d = Math.abs(projected - o);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/** The detent a tap on the grabber moves to: the next taller, wrapping to the shortest after the tallest. */
export const nextIndex = (i: number, count: number): number => (count <= 1 ? 0 : (i + 1) % count);
