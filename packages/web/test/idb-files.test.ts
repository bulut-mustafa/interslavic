import { describe, expect, it } from 'vitest';
import { makeFileStore } from '../src/studio/idb.ts';

/** A table in memory. `refuseBlobs` makes it behave like a browser that cannot store a Blob. */
function table(refuseBlobs: boolean) {
  const rows = new Map<string, unknown>();
  return {
    rows,
    kv: {
      get: async <T,>(k: string) => rows.get(k) as T | undefined,
      put: async (k: string, v: unknown) => {
        if (refuseBlobs && v instanceof Blob) throw new DOMException('Blobs cannot be stored', 'DataCloneError');
        rows.set(k, v);
      },
      del: async (k: string) => void rows.delete(k),
    },
  };
}
const photo = () => new File([new Uint8Array([1, 2, 3, 4])], 'photo.jpg', { type: 'image/jpeg', lastModified: 1234 });

describe('saving a file', () => {
  it('keeps it as it is where the browser can, which is the cheap way', async () => {
    const t = table(false);
    const files = makeFileStore(t.kv);
    const f = photo();
    await files.put('k', f);
    expect(t.rows.get('k')).toBe(f);
    expect((await files.get('k'))?.name).toBe('photo.jpg');
    expect(t.rows.has('probe:file')).toBe(false); // the test file was cleared away
  });

  it('keeps plain bytes and the type where the browser cannot store a file, and gives the same file back', async () => {
    const t = table(true);
    const files = makeFileStore(t.kv);
    await files.put('k', photo());
    expect(t.rows.get('k')).toMatchObject({ kind: 'bytes', name: 'photo.jpg', type: 'image/jpeg', lastModified: 1234 });
    const back = (await files.get('k'))!;
    expect(back).toBeInstanceOf(File);
    expect([back.name, back.type, back.lastModified, back.size]).toEqual(['photo.jpg', 'image/jpeg', 1234, 4]);
    expect([...new Uint8Array(await back.arrayBuffer())]).toEqual([1, 2, 3, 4]);
  });

  it('only tests the browser once', async () => {
    const t = table(true);
    let puts = 0;
    const files = makeFileStore({ ...t.kv, put: async (k, v) => (puts++, t.kv.put(k, v)) });
    await files.put('a', photo());
    await files.put('b', photo());
    expect(puts).toBe(3); // one test, two saves
  });

  it('wraps a bare Blob that comes back without a name, using the name it is given', async () => {
    const t = table(false);
    t.rows.set('k', new Blob(['xy'], { type: 'image/png' }));
    const back = await makeFileStore(t.kv).get('k', 'from-record.png');
    expect(back).toBeInstanceOf(File);
    expect(back?.name).toBe('from-record.png');
  });

  it('gives nothing for a key that is not there', async () => {
    expect(await makeFileStore(table(false).kv).get('nope')).toBeUndefined();
  });
});
