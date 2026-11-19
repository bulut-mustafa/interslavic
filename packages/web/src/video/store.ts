import type * as H from '../editor/history.ts';
import { getFile, hasIndexedDb, kvClear, kvDel, kvGet, kvPut, putFile } from '../studio/idb.ts';
import type { Script, SourceLang } from '../subtitles/translate.ts';
import { historyFromV1, SOURCE_V1, type ProjectV1, type VideoProject } from './project.ts';

/**
 * Keeping the video editor's project between visits, on the user's own device:
 * every source file once, and the edit (clips, layers, every undo step,
 * settings) as it changes. Nothing is sent anywhere. The editor works against
 * this small interface, so it can be tested with a store held in memory.
 *
 * Version 2 keeps one file per source under `video:src:<id>` and the record
 * under `video:record`. Version 1 (one video, file under `video:file`, no
 * `version` field) is still read, and comes back as a version-2 project.
 */

export type { VideoProject };

export interface VideoRecord {
  version: 2;
  hist: H.History<VideoProject>;
  lang: SourceLang;
  script: Script;
  muted?: boolean;
  /** How loud the original sound is, 0 to 1. Missing: full. */
  volume?: number;
  /** Whether the text is spoken aloud while the preview plays. */
  voiceOver?: boolean;
}

export interface LoadedVideo {
  record: VideoRecord;
  /** Source id -> its file, for every source whose file was found (any source the history mentions, so undo can bring one back). */
  files: Map<string, File>;
  /** Sources of the CURRENT edit whose file is gone. The project is still returned; the editor shows these as missing. */
  missing: string[];
  /** True when a file came from the old single-video key: the editor saves each file under its new key, once. */
  migrated?: boolean;
}

export interface VideoStore {
  load(): Promise<LoadedVideo | null>;
  saveRecord(record: VideoRecord): Promise<void>;
  saveSource(id: string, file: File): Promise<void>;
  removeSource(id: string): Promise<void>;
  clear(): Promise<void>;
}

/** The record of the editor that could hold one video only. */
interface RecordV1 {
  name: string;
  hist: H.History<ProjectV1>;
  lang: SourceLang;
  script: Script;
  muted?: boolean;
  volume?: number;
  voiceOver?: boolean;
}

const PREFIX = 'video:';
const FILE_V1 = 'video:file';
const RECORD = 'video:record';
export const sourceKey = (id: string): string => `video:src:${id}`;

/** The table and file calls a store needs; the browser's database, or a Map in a test. */
export interface VideoBackend {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  clear(prefix: string): Promise<void>;
  putFile(key: string, file: File): Promise<void>;
  getFile(key: string, name?: string): Promise<File | undefined>;
}

const isV2 = (r: VideoRecord | RecordV1): r is VideoRecord => (r as VideoRecord).version === 2;

/** The store over a backend. All the loading rules live here, so a test exercises the real ones. */
export function makeVideoStore(b: VideoBackend): VideoStore {
  return {
    async load() {
      const stored = await b.get<VideoRecord | RecordV1>(RECORD);
      if (!stored) return null;

      if (!isV2(stored)) {
        // Version 1: one video under its own key becomes source `s0`.
        const record: VideoRecord = {
          version: 2,
          hist: historyFromV1(stored.hist, stored.name),
          lang: stored.lang,
          script: stored.script,
          ...(stored.muted !== undefined && { muted: stored.muted }),
          ...(stored.volume !== undefined && { volume: stored.volume }),
          ...(stored.voiceOver !== undefined && { voiceOver: stored.voiceOver }),
        };
        const file = await b.getFile(FILE_V1, stored.name);
        const files = new Map<string, File>();
        if (file) files.set(SOURCE_V1, file);
        return { record, files, missing: file ? [] : [SOURCE_V1], migrated: true };
      }

      // Every source any step of the history mentions, so undoing to one that was removed still has its file.
      const names = new Map<string, string>();
      for (const p of [...stored.hist.past, stored.hist.present, ...stored.hist.future]) for (const s of p.sources) names.set(s.id, s.name);
      const files = new Map<string, File>();
      for (const [id, name] of names) {
        const file = await b.getFile(sourceKey(id), name);
        if (file) files.set(id, file);
      }
      // An edit migrated from version 1 whose video was never copied to its new key: the old key still holds it.
      let migrated = false;
      if (names.has(SOURCE_V1) && !files.has(SOURCE_V1)) {
        const old = await b.getFile(FILE_V1, names.get(SOURCE_V1));
        if (old) {
          files.set(SOURCE_V1, old);
          migrated = true;
        }
      }
      const missing = stored.hist.present.sources.filter((s) => !files.has(s.id)).map((s) => s.id);
      return { record: stored, files, missing, ...(migrated && { migrated }) };
    },
    saveRecord: (record) => b.put(RECORD, record),
    saveSource: (id, file) => b.putFile(sourceKey(id), file),
    removeSource: (id) => b.del(sourceKey(id)),
    clear: () => b.clear(PREFIX),
  };
}

export const indexedDbVideoStore: VideoStore = makeVideoStore({
  get: kvGet,
  put: kvPut,
  del: kvDel,
  clear: kvClear,
  putFile,
  getFile,
});

/** The browser's store, or null where there is none. */
export const defaultVideoStore: VideoStore | null = hasIndexedDb ? indexedDbVideoStore : null;

/** A store held in memory for tests: the same rules as the browser's, a Map for a database, and a way to make writes fail like a full disk. */
export interface MemoryVideoStore extends VideoStore {
  /** While `on`, every write throws like a browser out of room. */
  fail: { on: boolean };
  /** The raw table: records under their keys, files under theirs. */
  data: Map<string, unknown>;
}

export function memoryVideoStore(): MemoryVideoStore {
  const data = new Map<string, unknown>();
  const fail = { on: false };
  const guard = () => {
    if (fail.on) throw new Error('QuotaExceededError');
  };
  const store = makeVideoStore({
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
