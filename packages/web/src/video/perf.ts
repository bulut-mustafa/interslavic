/**
 * Counters for the `?perf=1` readout (studio/PerfOverlay.tsx): how often the
 * video editor renders, draws a frame, hears the clock and corrects a drifting
 * element. Incrementing a number is all they cost; nothing leaves the device.
 */
const counts: Record<string, number> = {};

export const perfBump = (key: string): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

/** The counts since the last call, and a fresh start. */
export function perfTake(): Record<string, number> {
  const out = { ...counts };
  for (const k of Object.keys(counts)) counts[k] = 0;
  return out;
}
