import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_TIMEOUT_MS, StorageTimeout, createKv, withTimeout } from '../src/studio/idb.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('withTimeout', () => {
  it('gives the answer when it comes in time, and the failure when it fails', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000, 'x')).resolves.toBe(7);
    await expect(withTimeout(Promise.reject(new Error('no')), 1000, 'x')).rejects.toThrow('no');
  });

  it('gives up with a StorageTimeout when nothing comes', async () => {
    const caught = withTimeout(new Promise(() => {}), 1000, 'testing').catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(1001);
    const err = (await caught) as Error;
    expect(err).toBeInstanceOf(StorageTimeout);
    expect(err.message).toContain('testing');
  });
});

describe('a database that never answers', () => {
  it('fails after the opening time instead of waiting for good, and tries afresh next time', async () => {
    let opens = 0;
    const kv = createKv(() => ({ open: () => (opens++, {}) }) as unknown as IDBFactory); // a request that never calls back: blocked
    const first = kv.get('k').catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS + 1);
    expect(((await first) as Error).name).toBe('StorageTimeout');
    const second = kv.get('k').catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS + 1);
    expect(((await second) as Error).name).toBe('StorageTimeout');
    expect(opens).toBe(2); // the failure was not remembered
  });

  it('closes its connection when another tab asks it to make way for an upgrade', async () => {
    const closed = vi.fn();
    const db: Record<string, unknown> = { close: closed, transaction: () => { throw new Error('unused'); } };
    const req: Record<string, unknown> = { result: db };
    const kv = createKv(() => ({ open: () => { queueMicrotask(() => (req.onsuccess as () => void)()); return req; } }) as unknown as IDBFactory);
    await kv.get('k').catch(() => {}); // opens; the stand-in's transaction then throws, which does not matter here
    (db.onversionchange as () => void)();
    expect(closed).toHaveBeenCalled();
  });
});
