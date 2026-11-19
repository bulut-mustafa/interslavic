import { describe, expect, it } from 'vitest';
import * as H from '../src/editor/history.ts';
import { newLayer } from '../src/editor/layers.ts';
import { emptyDoc, fromV1, type ImageLayer, type PageDoc } from '../src/photo/doc.ts';
import { fileKey, memoryPhotoStore, objectKey, pageKey, type PageRecord } from '../src/photo/store.ts';

const file = (name: string) => new File(['x'], name, { type: 'image/png' });
const pic = (id: string, src: string): ImageLayer => ({ kind: 'image', id, src, x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, blend: 'normal' });
const doc = (...srcs: string[]): PageDoc => ({ ...emptyDoc(), layers: srcs.map((s) => pic(`l-${s}`, s)) });
const record = (id: string, hist: H.History<PageDoc>, over: Partial<PageRecord> = {}): PageRecord => ({ id, name: `${id}.png`, lang: 'en', script: 'standard', hist, glyphs: [], read: true, ...over });
const meta = (...order: string[]) => ({ order, current: order[0] ?? null });

describe('photo store v2', () => {
  it('returns nothing when nothing is saved', async () => {
    expect(await memoryPhotoStore().load()).toBeNull();
  });

  it('round-trips a page, its picture and its layer pictures under the documented keys', async () => {
    const m = memoryPhotoStore();
    const hist = H.push(H.start(doc('a')), doc('a', 'b'));
    await m.saveFile('p', file('p.png'));
    await m.savePage(record('p', hist, { layerFiles: ['a', 'b'] }));
    await m.saveObjectFile('p', 'a', file('a.png'));
    await m.saveObjectFile('p', 'b', file('b.png'));
    await m.saveMeta(meta('p'));
    const got = (await m.load())!;
    const page = got.pages[0]!;
    expect(page.file.name).toBe('p.png');
    expect([...page.objects.keys()]).toEqual(['a', 'b']);
    expect(page.missing).toEqual([]);
    expect(page.hist.past).toHaveLength(1);
    expect(page.upgraded).toBeUndefined();
    expect(fileKey('p')).toBe('photo:file:p');
    expect(objectKey('p', 'a')).toBe('photo:obj:p:a');
    expect(m.data.has('photo:obj:p:a')).toBe(true);
  });

  it('reports a layer picture whose file is gone as missing, and the page still loads', async () => {
    const m = memoryPhotoStore();
    await m.saveFile('p', file('p.png'));
    await m.savePage(record('p', H.start(doc('a', 'b'))));
    await m.saveObjectFile('p', 'a', file('a.png'));
    await m.saveMeta(meta('p'));
    const page = (await m.load())!.pages[0]!;
    expect(page.missing).toEqual(['b']);
    expect(page.hist.present.layers).toHaveLength(2);
  });

  it('keeps the file of a layer that only an undo step mentions, without calling it missing', async () => {
    const m = memoryPhotoStore();
    const hist = H.push(H.start(doc('a', 'b')), doc('a'));
    await m.saveFile('p', file('p.png'));
    await m.savePage(record('p', hist));
    await m.saveObjectFile('p', 'a', file('a.png'));
    await m.saveObjectFile('p', 'b', file('b.png'));
    await m.saveMeta(meta('p'));
    const page = (await m.load())!.pages[0]!;
    expect([...page.objects.keys()].sort()).toEqual(['a', 'b']);
    expect(page.missing).toEqual([]);
  });

  it('removeObjectFile deletes just that file', async () => {
    const m = memoryPhotoStore();
    await m.saveObjectFile('p', 'a', file('a.png'));
    await m.saveObjectFile('p', 'b', file('b.png'));
    await m.removeObjectFile('p', 'a');
    expect([...m.data.keys()]).toEqual(['photo:obj:p:b']);
  });

  it('removePage deletes the record, the picture and every layer picture, and no other page', async () => {
    const m = memoryPhotoStore();
    for (const id of ['p', 'q']) {
      await m.saveFile(id, file(`${id}.png`));
      await m.savePage(record(id, H.start(doc('a'))));
      await m.saveObjectFile(id, 'a', file('a.png'));
    }
    await m.removePage('p');
    expect([...m.data.keys()].sort()).toEqual([fileKey('q'), objectKey('q', 'a'), pageKey('q')].sort());
  });

  it('upgrades an old record (text layers only) without losing the page, the text or the undo steps', async () => {
    const m = memoryPhotoStore();
    const t1 = newLayer({ x: 1, y: 2, text: 'one' });
    const t2 = newLayer({ x: 3, y: 4, text: 'two' });
    const old = { id: 'p', name: 'old.png', lang: 'en', script: 'standard', hist: H.push(H.start([t1]), [t1, t2]), glyphs: [], read: true, thumb: 'data:x' };
    m.data.set(pageKey('p'), old);
    await m.saveFile('p', file('old.png'));
    await m.saveMeta(meta('p'));
    const page = (await m.load())!.pages[0]!;
    expect(page.upgraded).toBe(true);
    expect(page.hist.present).toEqual(fromV1([t1, t2]));
    expect(page.hist.past).toEqual([fromV1([t1])]);
    expect(page.thumb).toBe('data:x');
    expect(page.missing).toEqual([]);
  });

  it('skips a page whose picture is gone but keeps the others', async () => {
    const m = memoryPhotoStore();
    await m.savePage(record('p', H.start(emptyDoc())));
    await m.savePage(record('q', H.start(emptyDoc())));
    await m.saveFile('q', file('q.png'));
    await m.saveMeta(meta('p', 'q'));
    expect((await m.load())!.pages.map((p) => p.id)).toEqual(['q']);
  });

  it('clear forgets everything under photo: and nothing else; failing writes throw', async () => {
    const m = memoryPhotoStore();
    m.data.set('video:record', 1);
    await m.saveFile('p', file('p.png'));
    await m.clear();
    expect([...m.data.keys()]).toEqual(['video:record']);
    m.fail.on = true;
    await expect(m.saveFile('p', file('p.png'))).rejects.toThrow('QuotaExceededError');
  });
});
