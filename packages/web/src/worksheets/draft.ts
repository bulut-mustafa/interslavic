import { SECTION_DEFAULTS, type CustomPhrase, type Item, type Section } from './build.ts';
import type { Phrase } from '../learn/phrasebook.ts';

/**
 * A teacher's changes to a worksheet, kept apart from the worksheet itself.
 * The ready-made questions are rebuilt from the topics chosen every time; the
 * draft says which of them were changed or taken out, which questions and
 * sections were added, and in what order things go. So choosing another topic
 * never loses an edit, and a changed question can be put back as it was.
 */

/** The things about a question that can be changed. Which apply depends on its kind. */
export interface Patch {
  prompt?: string;
  answers?: string[];
  answer?: string;
  options?: string[];
  why?: string;
  caption?: string;
  /** For a phrase: what to translate, and its Interslavic. */
  en?: string;
  isv?: string;
  note?: string;
}

export type CustomKind = 'question' | 'choice' | 'translate';
type Bare = Item extends infer T ? (T extends { number: number } ? Omit<T, 'number'> : never) : never;

export interface Draft {
  patches: Record<string, Patch>;
  /** Ready-made questions taken out. */
  removed: string[];
  /** Questions written by hand, and which section each belongs to. */
  custom: { id: string; section: string; item: Bare }[];
  sectionText: Record<string, { title?: string; instruction?: string }>;
  /** Sections written by hand. */
  extra: { id: string; title: string; instruction: string }[];
  /** The order of the questions in a section, where it was changed. */
  order: Record<string, string[]>;
}

export const emptyDraft = (): Draft => ({ patches: {}, removed: [], custom: [], sectionText: {}, extra: [], order: {} });

export type SheetItem = Item & {
  id: string;
  /** Written by hand. */
  custom: boolean;
  /** A ready-made question that was changed. */
  edited: boolean;
};

export interface SheetSection {
  key: string;
  title: string;
  instruction: string;
  /** A section written by hand, which can be removed. */
  custom: boolean;
  items: SheetItem[];
}

const idOf = (item: Item | Bare): string => {
  switch (item.kind) {
    case 'fill':
    case 'choice':
      return `${item.kind}:${item.prompt}`;
    case 'phrase':
      return `phrase:${item.phrase.isv}`;
    case 'table':
      return `table:${item.caption}`;
  }
};

/** Puts a patch on a question. Fields that do not belong to the question's kind are ignored. */
export function patchItem<T extends Item | Bare>(item: T, p: Patch): T {
  switch (item.kind) {
    case 'fill':
      return { ...item, prompt: p.prompt ?? item.prompt, answers: p.answers ?? item.answers, why: p.why ?? item.why };
    case 'choice':
      return { ...item, prompt: p.prompt ?? item.prompt, options: p.options ?? item.options, answer: p.answer ?? item.answer, why: p.why ?? item.why };
    case 'phrase':
      return { ...item, phrase: { ...item.phrase, en: p.en ?? item.phrase.en, isv: p.isv ?? item.phrase.isv, note: p.note ?? item.phrase.note } as Phrase | CustomPhrase };
    case 'table':
      return { ...item, caption: p.caption ?? item.caption };
  }
}

/** The worksheet as it is to be shown and printed: the built sections with the draft's changes on them, numbered in order. */
export function applyDraft(built: Section[], draft: Draft): SheetSection[] {
  const removed = new Set(draft.removed);
  const out: SheetSection[] = [];

  const make = (key: string, title: string, instruction: string, custom: boolean, ready: Item[]): SheetSection => {
    const seen = new Map<string, number>();
    const items: SheetItem[] = [];
    for (const it of ready) {
      const base = idOf(it);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const id = n === 1 ? base : `${base}#${n}`;
      if (removed.has(id)) continue;
      const patch = draft.patches[id];
      items.push({ ...(patch ? patchItem(it, patch) : it), id, custom: false, edited: !!patch } as SheetItem);
    }
    for (const c of draft.custom.filter((x) => x.section === key)) items.push({ ...c.item, number: 0, id: c.id, custom: true, edited: false } as SheetItem);
    const order = draft.order[key];
    if (order) {
      const at = (id: string) => (order.indexOf(id) === -1 ? order.length : order.indexOf(id));
      items.sort((a, b) => at(a.id) - at(b.id)); // stable: anything not named keeps its place at the end
    }
    const text = draft.sectionText[key] ?? {};
    return { key, title: text.title ?? title, instruction: text.instruction ?? instruction, custom, items };
  };

  const builtKeys = new Set(built.map((s) => s.title));
  const keys = [...built.map((s) => s.title), ...Object.keys(SECTION_DEFAULTS).filter((k) => !builtKeys.has(k) && draft.custom.some((c) => c.section === k))];
  for (const key of keys) {
    const b = built.find((s) => s.title === key);
    out.push(make(key, key, b?.instruction ?? SECTION_DEFAULTS[key]!.instruction, false, b?.items ?? []));
  }
  for (const e of draft.extra) out.push(make(e.id, e.title, e.instruction, true, []));

  let n = 0;
  for (const s of out) for (const it of s.items) it.number = ++n;
  return out.filter((s) => s.items.length > 0 || s.custom);
}

export const countSheet = (sheet: SheetSection[]): number => sheet.reduce((n, s) => n + s.items.length, 0);

// ---- changes, each returning a new draft ----

export const setPatch = (d: Draft, id: string, p: Patch): Draft => ({ ...d, patches: { ...d.patches, [id]: { ...d.patches[id], ...p } } });

/** Puts a changed ready-made question back as it was. */
export const resetItem = (d: Draft, id: string): Draft => {
  const { [id]: _gone, ...rest } = d.patches;
  return { ...d, patches: rest };
};

export const patchCustom = (d: Draft, id: string, p: Patch): Draft => ({ ...d, custom: d.custom.map((c) => (c.id === id ? { ...c, item: patchItem(c.item, p) } : c)) });

export function removeItem(d: Draft, id: string): Draft {
  const isCustom = d.custom.some((c) => c.id === id);
  return {
    ...d,
    custom: d.custom.filter((c) => c.id !== id),
    removed: isCustom || d.removed.includes(id) ? d.removed : [...d.removed, id],
    order: Object.fromEntries(Object.entries(d.order).map(([k, ids]) => [k, ids.filter((x) => x !== id)])),
  };
}

/** Brings back everything taken out of the ready-made questions. */
export const restoreRemoved = (d: Draft): Draft => ({ ...d, removed: [] });

let counter = 0;
const fresh = (prefix: string): string => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`;

const BLANK: Record<CustomKind, Bare> = {
  question: { kind: 'fill', prompt: '', answers: [''], why: '' },
  choice: { kind: 'choice', prompt: '', options: ['', ''], answer: '', why: '' },
  translate: { kind: 'phrase', phrase: { en: '', isv: '', source: 'custom' } },
};

export function addCustom(d: Draft, section: string, kind: CustomKind): { draft: Draft; id: string } {
  const id = fresh('custom');
  return { id, draft: { ...d, custom: [...d.custom, { id, section, item: structuredClone(BLANK[kind]) }] } };
}

/** Moves a question one place earlier (-1) or later (1) within its section. `visible` is the section's questions as shown now. */
export function moveItem(d: Draft, section: string, visible: string[], id: string, by: -1 | 1): Draft {
  const at = visible.indexOf(id);
  const to = at + by;
  if (at === -1 || to < 0 || to >= visible.length) return d;
  const next = [...visible];
  [next[at], next[to]] = [next[to]!, next[at]!];
  return { ...d, order: { ...d.order, [section]: next } };
}

/** What is needed to put a deleted question back exactly where it was, without touching anything changed since. */
export interface ItemSnapshot {
  id: string;
  section: string;
  /** A hand-written question: its entry and where it stood among the hand-written ones. */
  custom: { id: string; section: string; item: Bare } | null;
  customAt: number;
  /** The section's order before, or undefined when it had no saved order. */
  order: string[] | undefined;
}

export const snapshotItem = (d: Draft, id: string, section: string): ItemSnapshot => {
  const at = d.custom.findIndex((c) => c.id === id);
  return { id, section, custom: at === -1 ? null : d.custom[at]!, customAt: at, order: d.order[section] };
};

/** Undoes `removeItem`. */
export function restoreItem(d: Draft, s: ItemSnapshot): Draft {
  const custom = s.custom && !d.custom.some((c) => c.id === s.id) ? [...d.custom.slice(0, s.customAt), s.custom, ...d.custom.slice(s.customAt)] : d.custom;
  const { [s.section]: _old, ...order } = d.order;
  return { ...d, custom, removed: d.removed.filter((x) => x !== s.id), order: s.order ? { ...order, [s.section]: s.order } : order };
}

/** Copies a question (as shown now, edits included) into a hand-written one just after it. A copied phrase is the teacher's own, so it no longer points at a source. */
export function duplicateItem(d: Draft, section: string, visible: string[], item: SheetItem): { draft: Draft; id: string } {
  const { number: _n, id: _i, custom: _c, edited: _e, ...rest } = item;
  const bare = structuredClone(rest) as unknown as Bare;
  if (bare.kind === 'phrase') bare.phrase = { ...bare.phrase, source: 'custom' } as CustomPhrase;
  const id = fresh('custom');
  const at = visible.indexOf(item.id);
  const next = [...visible];
  next.splice(at === -1 ? next.length : at + 1, 0, id);
  return { id, draft: { ...d, custom: [...d.custom, { id, section, item: bare }], order: { ...d.order, [section]: next } } };
}

export const setSectionText = (d: Draft, key: string, t: { title?: string; instruction?: string }): Draft => {
  const extra = d.extra.find((e) => e.id === key);
  if (extra) return { ...d, extra: d.extra.map((e) => (e.id === key ? { ...e, ...t } : e)) };
  return { ...d, sectionText: { ...d.sectionText, [key]: { ...d.sectionText[key], ...t } } };
};

export function addSection(d: Draft): { draft: Draft; id: string } {
  const id = fresh('section');
  return { id, draft: { ...d, extra: [...d.extra, { id, title: 'New section', instruction: '' }] } };
}

export const removeSection = (d: Draft, id: string): Draft => ({
  ...d,
  extra: d.extra.filter((e) => e.id !== id),
  custom: d.custom.filter((c) => c.section !== id),
});

export const hasChanges = (d: Draft): boolean =>
  Object.keys(d.patches).length > 0 || d.removed.length > 0 || d.custom.length > 0 || d.extra.length > 0 || Object.keys(d.sectionText).length > 0 || Object.keys(d.order).length > 0;

// ---- keeping it ----

const KEY = 'interslavic-worksheet-v1';

export interface Saved {
  draft: Draft;
  title: string;
  key: boolean;
  selection: { exercises: string[]; tables: string[]; phrases: string[] };
}

export function loadSaved(storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined' ? null : window.localStorage): Saved | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    const d = s.draft;
    const arr = Array.isArray;
    if (!d || typeof d.patches !== 'object' || !arr(d.removed) || !arr(d.custom) || !arr(d.extra) || typeof s.title !== 'string') return null;
    return { ...s, draft: { ...emptyDraft(), ...d } };
  } catch {
    return null;
  }
}

export function save(s: Saved, storage: Pick<Storage, 'setItem'> | null = typeof window === 'undefined' ? null : window.localStorage): void {
  try {
    storage?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* a private window, or a full store: the worksheet just is not kept */
  }
}

/** What is needed to put a deleted hand-written section back. */
export interface SectionSnapshot {
  extra: { id: string; title: string; instruction: string };
  at: number;
  custom: Draft['custom'];
}

export const snapshotSection = (d: Draft, id: string): SectionSnapshot | null => {
  const at = d.extra.findIndex((e) => e.id === id);
  return at === -1 ? null : { extra: d.extra[at]!, at, custom: d.custom.filter((c) => c.section === id) };
};

export const restoreSection = (d: Draft, s: SectionSnapshot): Draft =>
  d.extra.some((e) => e.id === s.extra.id) ? d : { ...d, extra: [...d.extra.slice(0, s.at), s.extra, ...d.extra.slice(s.at)], custom: [...d.custom, ...s.custom] };
