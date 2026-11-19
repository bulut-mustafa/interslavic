/**
 * The browser's database (IndexedDB), as one table of keys and values that every
 * Studio tool keeps its saved work in, each under its own prefix ("photo:",
 * "video:"). Stays on the user's device; clearing the site's data clears it.
 *
 * It must never leave the page waiting for good: a database that is blocked
 * (another tab holding an old version, a delete still pending) simply never
 * answers, so every call is given a time to answer in, and a connection that is
 * asked to make way for an upgrade does.
 */

const DB_NAME = 'interslavic-studio';
const STORE = 'kv';

/** How long the database has to open before it is given up on. */
export const OPEN_TIMEOUT_MS = 4000;
/** How long one read or write has: generous, because a video is a large write. */
export const OPERATION_TIMEOUT_MS = 120_000;

export class StorageTimeout extends Error {
  constructor(what: string) {
    super(`The browser's storage did not answer (${what}).`);
    this.name = 'StorageTimeout';
  }
}

/** The promise's answer, or a StorageTimeout if it has not come in `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StorageTimeout(what)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** The table over a given IndexedDB factory. The page's own is made below; a test gives it a stand-in. */
export function createKv(factory: () => IDBFactory) {
  let opened: Promise<IDBDatabase> | null = null;

  function open(): Promise<IDBDatabase> {
    opened ??= withTimeout(
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = factory().open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => {
          const db = req.result;
          // Another tab wants to upgrade or delete the database: close, so it is not held up by this one.
          db.onversionchange = () => {
            db.close();
            opened = null;
          };
          db.onclose = () => {
            opened = null;
          };
          resolve(db);
        };
        req.onerror = () => reject(req.error);
        // `onblocked` is left to the time limit: it may clear by itself, and if it does not, the caller is told.
      }),
      OPEN_TIMEOUT_MS,
      'opening',
    ).catch((e) => {
      opened = null; // the next call tries afresh
      throw e;
    });
    return opened;
  }

  async function run<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open();
    return withTimeout(
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
      OPERATION_TIMEOUT_MS,
      mode === 'readonly' ? 'reading' : 'writing',
    );
  }

  const get = <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key));
  const put = (key: string, value: unknown) => run('readwrite', (s) => s.put(value, key)).then(() => undefined);
  const del = (key: string) => run('readwrite', (s) => s.delete(key)).then(() => undefined);
  const keys = () => run<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  /** Deletes every key that starts with a prefix. */
  const clear = async (prefix: string): Promise<void> => {
    for (const k of await keys()) if (typeof k === 'string' && k.startsWith(prefix)) await del(k);
  };
  return { get, put, del, keys, clear };
}

export const hasIndexedDb = typeof indexedDB !== 'undefined';
const page = createKv(() => indexedDB);
export const kvGet = page.get;
export const kvPut = page.put;
export const kvDel = page.del;
export const kvKeys = page.keys;
export const kvClear = page.clear;

/** Asks the browser not to clear what is saved when it is short of room. Quietly does nothing where that is not offered. */
export async function askToKeep(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* not offered here */
  }
}

// ---- files ----

/** A file as plain bytes, for a browser that cannot keep a File in its database. */
interface StoredBytes {
  kind: 'bytes';
  name: string;
  type: string;
  lastModified: number;
  data: ArrayBuffer;
}

interface Kv {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

/**
 * Saving a user's file. Chrome and Firefox keep a File as it is, which is the
 * cheapest way (the browser writes it to disk, not into the database's own
 * file). Some browsers, older Safari on iPhones above all, cannot store one, so
 * this tries once, with a few bytes, and if the browser refuses it keeps files
 * as plain bytes and the type alongside instead.
 */
export function makeFileStore(kv: Kv) {
  let works: Promise<boolean> | null = null;
  const blobsWork = (): Promise<boolean> =>
    (works ??= (async () => {
      const probe = 'probe:file';
      try {
        await kv.put(probe, new Blob(['abc'], { type: 'text/plain' }));
        const back = await kv.get<Blob>(probe);
        await kv.del(probe).catch(() => undefined);
        return back instanceof Blob && back.size === 3;
      } catch {
        return false;
      }
    })());

  return {
    async put(key: string, file: File): Promise<void> {
      if (await blobsWork()) return kv.put(key, file);
      const bytes: StoredBytes = { kind: 'bytes', name: file.name, type: file.type, lastModified: file.lastModified, data: await file.arrayBuffer() };
      return kv.put(key, bytes);
    },
    /** The file saved under a key, in whichever form it was saved. `name` is used if only a Blob (with no name) comes back. */
    async get(key: string, name = 'file'): Promise<File | undefined> {
      const v = await kv.get<File | Blob | StoredBytes>(key);
      if (!v) return undefined;
      if ('kind' in v && v.kind === 'bytes') return new File([v.data], v.name, { type: v.type, lastModified: v.lastModified });
      if (v instanceof File) return v;
      const blob = v as Blob;
      return new File([blob], name, { type: blob.type });
    },
  };
}

const files = makeFileStore({ get: kvGet, put: kvPut, del: kvDel });
export const putFile = files.put;
export const getFile = files.get;
