/**
 * What a learner has done, kept in this browser only - no account, nothing
 * sent anywhere. Storage can be missing or refuse (private windows, blocked
 * site data), so every access is guarded and the pages work without it.
 */

const KEY = 'interslavic-learn-v1';

interface Progress {
  done: string[];
  /** Exercise id -> answered right. */
  answers: Record<string, boolean>;
}

function load(): Progress {
  try {
    const raw = window.localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Progress>) : {};
    return { done: p.done ?? [], answers: p.answers ?? {} };
  } catch {
    return { done: [], answers: {} };
  }
}

function save(p: Progress): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Not remembered on this device; nothing else depends on it.
  }
}

export const isDone = (slug: string): boolean => load().done.includes(slug);

export function setDone(slug: string, done: boolean): void {
  const p = load();
  p.done = done ? [...new Set([...p.done, slug])] : p.done.filter((s) => s !== slug);
  save(p);
}

export const answered = (id: string): boolean | undefined => load().answers[id];

export function recordAnswer(id: string, right: boolean): void {
  const p = load();
  p.answers[id] = right;
  save(p);
}
