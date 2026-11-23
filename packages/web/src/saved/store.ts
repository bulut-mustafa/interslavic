/**
 * Translations the reader chose to keep. They live in this browser's local
 * storage only: no account, nothing is sent anywhere. Every access is guarded,
 * because storage can be blocked (private windows, site settings).
 */
const KEY = 'interslavic-saved-v1';
export const MAX_SAVED = 200;

export interface Saved {
  id: string;
  text: string;
  lang: 'en' | 'ru' | 'uk';
  script: string;
  out: string;
  savedAt: number;
}

const same = (a: Pick<Saved, 'text' | 'lang' | 'script'>, b: Pick<Saved, 'text' | 'lang' | 'script'>): boolean =>
  a.text.trim() === b.text.trim() && a.lang === b.lang && a.script === b.script;

export function loadSaved(): Saved[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as Saved[]).filter((s) => s && typeof s.text === 'string' && typeof s.out === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: Saved[]): Saved[] {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Not saved this time; the list on screen still works until the page closes.
  }
  return list;
}

export const isSaved = (list: Saved[], item: Pick<Saved, 'text' | 'lang' | 'script'>): boolean => list.some((s) => same(s, item));

/** Newest first; the same text, language and script is kept once; the oldest fall off past MAX_SAVED. */
export function addSaved(item: Omit<Saved, 'id' | 'savedAt'>): Saved[] {
  const rest = loadSaved().filter((s) => !same(s, item));
  const entry: Saved = { ...item, text: item.text.trim(), id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, savedAt: Date.now() };
  return write([entry, ...rest].slice(0, MAX_SAVED));
}

export function removeSaved(id: string): Saved[] {
  return write(loadSaved().filter((s) => s.id !== id));
}
