import { describe, expect, it } from 'vitest';
import * as H from '../src/editor/history.ts';
import { emptyDoc, type ImageLayer, type PageDoc } from '../src/photo/doc.ts';
import { fileKey, layerFileIds, memoryPhotoStore, objectKey, pageKey, type PageRecord } from '../src/photo/store.ts';

const file = (name: string) => new File(['x'], name, { type: 'image/png' });
const pic = (id: string, src: string): ImageLayer => ({ kind: 'image', id, src, x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, blend: 'normal' });
const doc = (...srcs: string[]): PageDoc => ({ ...emptyDoc(), layers: srcs.map((s, i) => pic(`l${i}-${s}`, s)) });
const record = (id: string, hist: H.History<PageDoc>, over: Partial<PageRecord> = {}): PageRecord => ({ id, name: `${id}.png`, lang: 'en', script: 'standard', hist, glyphs: [], read: true, ...over });

async function put(m: ReturnType<typeof memoryPhotoStore>, id: string, hist: H.History<PageDoc>, over: Partial<PageRecord> = {}) {
  await m.saveFile(id, file(`${id}.png`));
  await m.savePage(record(id, hist, over));
}

describe('layerFileIds', () => {
  it('collects the files of the present, every undo step, every redo step and the record list, once each', () => {
    let h = H.start(doc('a'));
    h = H.push(h, doc('a', 'b'));
    h = H.push(h, doc('c'));
    h = H.undo(h); // 'c' is now in the future
    const ids = layerFileIds(record('p', h, { layerFiles: ['z', 'a'] }));
    expect(ids.sort()).toEqual(['a', 'b', 'c', 'z']);
  });
});

describe('load: which pages come back, and in which order', () => {
  it('follows meta.order, not the order they were written, and ignores pages that meta does not list', async () => {
    const m = memoryPhotoStore();
    await put(m, 'a', H.start(emptyDoc()));
    await put(m, 'b', H.start(emptyDoc()));
    await put(m, 'stray', H.start(emptyDoc()));
    await m.saveMeta({ order: ['b', 'a'], current: 'a' });
    const got = (await m.load())!;
    expect(got.pages.map((p) => p.id)).toEqual(['b', 'a']);
    expect(got.meta.current).toBe('a');
  });

  it('answers null when meta lists pages but none of them can be shown (and when meta is empty)', async () => {
    const m = memoryPhotoStore();
    await m.savePage(record('a', H.start(emptyDoc()))); // record without its picture
    await m.saveMeta({ order: ['a', 'ghost'], current: 'a' });
    expect(await m.load()).toBeNull();
    await m.saveMeta({ order: [], current: null });
    expect(await m.load()).toBeNull();
  });

  it('hands the editor the saved meta as it was, so the editor must cope with a current page that was dropped', async () => {
    const m = memoryPhotoStore();
    await m.savePage(record('gone', H.start(emptyDoc())));
    await put(m, 'kept', H.start(emptyDoc()));
    await m.saveMeta({ order: ['gone', 'kept'], current: 'gone' });
    const got = (await m.load())!;
    expect(got.pages.map((p) => p.id)).toEqual(['kept']);
    // documented as-is behaviour: PhotoEditor.tsx:1674 re-checks current against the pages that did load
    expect(got.meta.current).toBe('gone');
  });
});

describe('load: layer pictures', () => {
  it('reports a missing file once however many layers use it, and not at all when only an undo step used it', async () => {
    const m = memoryPhotoStore();
    const two = { ...doc('x'), layers: [pic('1', 'x'), pic('2', 'x')] };
    await put(m, 'p', H.push(H.start(doc('old')), two));
    await m.saveMeta({ order: ['p'], current: 'p' });
    const page = (await m.load())!.pages[0]!;
    expect(page.missing).toEqual(['x']); // 'old' (only in the undo step) is not reported
    expect(page.objects.size).toBe(0);
  });

  it('brings back a file the record lists even if no step mentions it, without reporting anything missing', async () => {
    const m = memoryPhotoStore();
    await put(m, 'p', H.start(emptyDoc()), { layerFiles: ['spare'] });
    await m.saveObjectFile('p', 'spare', file('spare.png'));
    await m.saveMeta({ order: ['p'], current: 'p' });
    const page = (await m.load())!.pages[0]!;
    expect([...page.objects.keys()]).toEqual(['spare']);
    expect(page.missing).toEqual([]);
  });

  it('does not take another page\'s layer picture that has the same file id', async () => {
    const m = memoryPhotoStore();
    await put(m, 'p', H.start(doc('shared')));
    await put(m, 'q', H.start(doc('shared')));
    await m.saveObjectFile('q', 'shared', file('shared.png'));
    await m.saveMeta({ order: ['p', 'q'], current: 'p' });
    const [p, q] = (await m.load())!.pages;
    expect(p!.missing).toEqual(['shared']);
    expect(q!.missing).toEqual([]);
  });

  it('does not change the stored record while loading (a v2 record is handed back as it is)', async () => {
    const m = memoryPhotoStore();
    const rec = record('p', H.start(doc('a')));
    const before = JSON.stringify(rec);
    await m.saveFile('p', file('p.png'));
    await m.savePage(rec);
    await m.saveMeta({ order: ['p'], current: 'p' });
    await m.load();
    expect(JSON.stringify(m.data.get(pageKey('p')))).toBe(before);
  });
});

describe('removePage', () => {
  it('deletes the files that only a redo step or the record list mention, and nothing of other pages', async () => {
    const m = memoryPhotoStore();
    let h = H.push(H.start(doc('a')), doc('b'));
    h = H.undo(h); // 'b' lives only in the redo list
    await put(m, 'p', h, { layerFiles: ['c'] });
    for (const f of ['a', 'b', 'c']) await m.saveObjectFile('p', f, file(`${f}.png`));
    await put(m, 'q', H.start(doc('a')));
    await m.saveObjectFile('q', 'a', file('a.png'));
    await m.removePage('p');
    expect([...m.data.keys()].sort()).toEqual([fileKey('q'), objectKey('q', 'a'), pageKey('q')].sort());
  });

  it('is harmless for a page that was never saved, and for a version-1 record (no layer files to find)', async () => {
    const m = memoryPhotoStore();
    await put(m, 'q', H.start(emptyDoc()));
    await m.removePage('nothing');
    expect([...m.data.keys()].sort()).toEqual([fileKey('q'), pageKey('q')].sort());
    m.data.set(pageKey('old'), { id: 'old', name: 'o.png', lang: 'en', script: 'standard', hist: { past: [], present: [], future: [] }, glyphs: [], read: true });
    await m.saveFile('old', file('o.png'));
    await m.removePage('old');
    expect(m.data.has(pageKey('old'))).toBe(false);
    expect(m.data.has(fileKey('old'))).toBe(false);
  });
});

describe('failing writes', () => {
  it('a failed savePage leaves the earlier record readable and unchanged', async () => {
    const m = memoryPhotoStore();
    await put(m, 'p', H.start(doc('a')));
    await m.saveMeta({ order: ['p'], current: 'p' });
    m.fail.on = true;
    await expect(m.savePage(record('p', H.push(H.start(doc('a')), doc('a', 'b'))))).rejects.toThrow('QuotaExceededError');
    await expect(m.saveMeta({ order: ['p', 'q'], current: 'q' })).rejects.toThrow();
    m.fail.on = false;
    const got = (await m.load())!;
    expect(got.pages[0]!.hist.past).toHaveLength(0);
    expect(got.meta.order).toEqual(['p']);
  });
});
