/**
 * The playhead as a plain number that anything may read or watch without React:
 * the phone timeline moves itself from this every animation frame while the
 * rest of the screen only hears the time a few times a second.
 */
export interface LiveClock {
  get(): number;
  set(t: number): void;
  subscribe(fn: (t: number) => void): () => void;
}

export function createLiveClock(): LiveClock {
  let now = 0;
  const subs = new Set<(t: number) => void>();
  return {
    get: () => now,
    set(t) {
      now = t;
      for (const f of subs) f(t);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
