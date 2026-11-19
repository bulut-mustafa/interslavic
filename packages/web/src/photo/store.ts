import type * as H from '../editor/history.ts';
import type { TextLayer } from '../editor/layers.ts';
import { getFile, hasIndexedDb, kvClear, kvDel, kvGet, kvPut, putFile } from '../studio/idb.ts';
import type { Script } from '../subtitles/translate.ts';
import { historyFromV1, isImage, type PageDoc } from './doc.ts';
import type { Glyph } from './live-text.ts';
import type { OcrLang } from './ocr.ts';

/**
 * Keeping the photo editor's pages between visits, on the user's own device, in
 * the browser's database (IndexedDB). Nothing is sent anywhere; clearing the
 * browser's site data clears it. The editor works against this small interface,
 * so it can be tested with a store held in memory (`memoryPhotoStore`).
 *
 * Version 2 (this file) keeps a page's whole document (`PageDoc`: picture
 * edits + text, picture and shape layers) in its undo history, the picture
 * itself under `photo:file:<pageId>`, and every picture placed ON the page as
 * a layer under `photo:obj:<pageId>:<fileId>` (`ImageLayer.src` is that fileId).
 * Version 1 records (a history of text layers only) are still read, and come
 * back as version-2 pages; nothing is lost. Same shape as video/store.ts.
 */

/** Everything about a page except the pictures, which are kept as files when the page / layer is added. */
export interface PageRecord {
  id: string;
  name: string;
  lang: OcrLang;
  script: Script;
  /** The page's document and every undo step. */
  hist: H.History<PageDoc>;
  /** The letters found in the picture, so the picture need not be read again. */
  glyphs: Glyph[];
  /** Whether the picture was read to the end; if not, it is read again when the page comes back. */
  read: boolean;
  thumb?: string;
  /** Ids of the files used by picture layers (kept under `photo:obj:<pageId>:<fileId>`). */
  layerFiles?: string[];
}

export interface Meta {
  /** The pages, in order. */
  order: string[];
  current: string | null;
}

export interface SavedPage extends PageRecord {
  /** The page's picture. */
  file: File;
  /** File id -> the picture of a layer, for every layer picture any undo step uses and whose file was found. */
  objects: Map<string, File>;
  /** File ids the CURRENT document needs and which are gone. The page still loads; the editor shows these layers as missing. */
  missing: string[];
  /** True when the record was a version-1 one and was upgraded on the way in: the editor saves it again, once. */
  upgraded?: boolean;
}

export interface PhotoStore {
  load(): Promise<{ meta: Meta; pages: SavedPage[] } | null>;
  saveFile(id: string, file: File): Promise<void>;
  savePage(record: PageRecord): Promise<void>;
  saveMeta(meta: Meta): Promise<void>;
  saveObjectFile(pageId: string, fileId: string, file: File): Promise<void>;
  removeObjectFile(pageId: string, fileId: string): Promise<void>;
  removePage(id: string): Promise<void>;
  clear(): Promise<void>;
}

/** A version-1 record: the same, but the history is of text layers only. */
type RecordV1 = Omit<PageRecord, 'hist' | 'layerFiles'> & { hist: H.History<TextLayer[]> };

const PREFIX = 'photo:';
const META = 'photo:meta';
export const pageKey = (id: string): string => `photo:page:${id}`;
export const fileKey = (id: string): string => `photo:file:${id}`;
export const objectKey = (pageId: string, fileId: string): string => `photo:obj:${pageId}:${fileId}`;

/** The table and file calls a store needs; the browser's database, or a Map in a test. */
export interface PhotoBackend {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  clear(prefix: string): Promise<void>;
  putFile(key: string, file: File): Promise<void>;
  getFile(key: string, name?: string): Promise<File | undefined>;
}

const isV1 = (r: PageRecord | RecordV1): r is RecordV1 => Array.isArray((r as RecordV1).hist?.present);

/** Ids of the files that picture layers of a document point at. */
const srcsOf = (d: PageDoc): string[] => d.layers.filter(isImage).map((l) => l.src);

/** Every file id any step of the history, or the record's own list, mentions (so undo can bring one back). */
export function layerFileIds(r: PageRecord): string[] {
  const ids = new Set<string>(r.layerFiles ?? []);
  for (const d of [...r.hist.past, r.hist.present, ...r.hist.future]) for (const s of srcsOf(d)) ids.add(s);
  return [...ids];
}

/** The store over a backend. All the loading rules live here, so a test exercises the real ones. */
export function makePhotoStore(b: PhotoBackend): PhotoStore {
  return {
    async load() {
      const meta = await b.get<Meta>(META);
      if (!meta || meta.order.length === 0) return null;
      const pages: SavedPage[] = [];
      for (const id of meta.order) {
        const stored = await b.get<PageRecord | RecordV1>(pageKey(id));
        if (!stored) continue;
        const file = await b.getFile(fileKey(id), stored.name);
        if (!file) continue; // a page without its picture cannot be shown
        const upgraded = isV1(stored);
        const record: PageRecord = isV1(stored) ? { ...stored, hist: historyFromV1(stored.hist) } : stored;
        const objects = new Map<string, File>();
        for (const fid of layerFileIds(record)) {
          const f = await b.getFile(objectKey(id, fid), fid);
          if (f) objects.set(fid, f);
        }
        const missing = [...new Set(srcsOf(record.hist.present))].filter((s) => !objects.has(s));
        pages.push({ ...record, file, objects, missing, ...(upgraded && { upgraded }) });
      }
      return pages.length === 0 ? null : { meta, pages };
    },
    saveFile: (id, file) => b.putFile(fileKey(id), file),
    savePage: (record) => b.put(pageKey(record.id), record),
    saveMeta: (meta) => b.put(META, meta),
    saveObjectFile: (pageId, fileId, file) => b.putFile(objectKey(pageId, fileId), file),
    removeObjectFile: (pageId, fileId) => b.del(objectKey(pageId, fileId)),
    async removePage(id) {
      const stored = await b.get<PageRecord | RecordV1>(pageKey(id));
      if (stored && !isV1(stored)) for (const fid of layerFileIds(stored)) await b.del(objectKey(id, fid));
      await b.del(pageKey(id));
      await b.del(fileKey(id));
    },
    clear: () => b.clear(PREFIX),
  };
}

export const indexedDbStore: PhotoStore = makePhotoStore({ get: kvGet, put: kvPut, del: kvDel, clear: kvClear, putFile, getFile });

/** The browser's store, or null where there is none (a private window in some browsers, or a page being pre-rendered). */
export const defaultStore: PhotoStore | null = hasIndexedDb ? indexedDbStore : null;

/** A store held in memory for tests: the same rules as the browser's, a Map for a database, and a way to make writes fail like a full disk. */
export interface MemoryPhotoStore extends PhotoStore {
  /** While `on`, every write throws like a browser out of room. */
  fail: { on: boolean };
  /** The raw table: records under their keys, files under theirs. */
  data: Map<string, unknown>;
}

export function memoryPhotoStore(): MemoryPhotoStore {
  const data = new Map<string, unknown>();
  const fail = { on: false };
  const guard = () => {
    if (fail.on) throw new Error('QuotaExceededError');
  };
  const store = makePhotoStore({
    get: async <T,>(key: string) => data.get(key) as T | undefined,
    put: async (key, value) => {
      guard();
      data.set(key, value);
    },
    del: async (key) => {
      data.delete(key);
    },
    clear: async (prefix) => {
      for (const k of [...data.keys()]) if (k.startsWith(prefix)) data.delete(k);
    },
    putFile: async (key, file) => {
      guard();
      data.set(key, file);
    },
    getFile: async (key) => data.get(key) as File | undefined,
  });
  return Object.assign(store, { fail, data });
}

export { askToKeep } from '../studio/idb.ts';
