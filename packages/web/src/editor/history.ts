/** Undo and redo for any state: every step is kept, the newest edit clears what was undone. */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

const LIMIT = 100;

export const start = <T>(present: T): History<T> => ({ past: [], present, future: [] });

export function push<T>(h: History<T>, next: T): History<T> {
  if (Object.is(next, h.present)) return h;
  return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
}

/** Replaces the present without a step of its own - for the many small changes of a drag. */
export const replace = <T>(h: History<T>, next: T): History<T> => ({ ...h, present: next });

/** Makes one undo step of a run of `replace` changes: `base` is the state before the run began. No step when nothing changed (same object, or an equal copy as a cancelled drag leaves). */
/** Most nodes the structural comparison visits; past it the values count as different (a step is kept), which also ends any cycle. */
const EQUAL_BUDGET = 20000;

/** Deepest nesting compared; deeper counts as different, so recursion stays shallow. */
const EQUAL_DEPTH = 100;

/** Structural equality for JSON-like data (plain objects, arrays, primitives). Gives up (false) over EQUAL_BUDGET nodes. */
export function sameValue(a: unknown, b: unknown): boolean {
  let left = EQUAL_BUDGET;
  const eq = (x: unknown, y: unknown, depth: number): boolean => {
    if (Object.is(x, y)) return true;
    if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null) return false;
    if (--left < 0 || depth > EQUAL_DEPTH) return false;
    if (Array.isArray(x) !== Array.isArray(y)) return false;
    if (Array.isArray(x)) {
      const ya = y as unknown[];
      if (x.length !== ya.length) return false;
      for (let i = 0; i < x.length; i++) if (!eq(x[i], ya[i], depth + 1)) return false;
      return true;
    }
    if (Object.getPrototypeOf(x) !== Object.getPrototypeOf(y)) return false;
    const xk = Object.keys(x);
    if (xk.length !== Object.keys(y).length) return false;
    for (const k of xk) {
      if (!Object.prototype.hasOwnProperty.call(y, k) || !eq((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], depth + 1)) return false;
    }
    return true;
  };
  return eq(a, b, 0);
}

export function commitFrom<T>(h: History<T>, base: T | null): History<T> {
  if (base === null || sameValue(base, h.present)) return h;
  return { past: [...h.past, base].slice(-LIMIT), present: h.present, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past.at(-1);
  return prev === undefined ? h : { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  const [next, ...rest] = h.future;
  return next === undefined ? h : { past: [...h.past, h.present], present: next, future: rest };
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0;
