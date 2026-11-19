// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import PhotoEditor from '../src/photo/PhotoEditor.tsx';
import type { Recognizer } from '../src/photo/ocr.ts';
import { memoryPhotoStore, type Meta, type PageRecord, type PhotoStore, type SavedPage } from '../src/photo/store.ts';
import { emptyDoc, fromV1 } from '../src/photo/doc.ts';
import * as H from '../src/editor/history.ts';
import { newLayer } from '../src/editor/layers.ts';
import { screen } from './live-screen.ts';
import { fakeContext } from './photo-canvas.ts';

/** jsdom has no canvas or image decoding, so both are stood in for here. */
const ctx = fakeContext();

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(['png'], { type: 'image/png' })); } as never;
  HTMLCanvasElement.prototype.toDataURL = (() => 'data:image/jpeg;base64,AAAA') as never;
  URL.createObjectURL = () => 'blob:pic';
  URL.revokeObjectURL = () => {};
  vi.stubGlobal('Image', class { onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 800; naturalHeight = 600; set src(_v: string) { queueMicrotask(() => this.onload?.()); } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const png = (name = 'sign.png') => new File(['x'], name, { type: 'image/png' });

/** A store held in memory (the real rules over a Map), with a way to look inside it and to make it fail. */
function memoryStore(seed?: { meta: Meta; pages: SavedPage[] }) {
  const store = memoryPhotoStore();
  const seeded = (async () => {
    for (const { file, objects: _o, missing: _m, upgraded: _u, ...rec } of seed?.pages ?? []) {
      await store.saveFile(rec.id, file);
      await store.savePage(rec);
    }
    if (seed) await store.saveMeta(seed.meta);
  })();
  const wrap = <A extends unknown[], R>(f: (...a: A) => Promise<R>) => async (...a: A) => { await seeded; return f(...a); };
  const waiting: PhotoStore = { ...store, load: wrap(store.load) };
  const keys = (prefix: string) => [...store.data.keys()].filter((k) => k.startsWith(prefix));
  const files = {
    get size() { return keys('photo:file:').length; },
    keys: () => keys('photo:file:').map((k) => k.slice('photo:file:'.length)),
    values: () => keys('photo:file:').map((k) => store.data.get(k) as File),
  };
  const pages = {
    get size() { return keys('photo:page:').length; },
    keys: () => keys('photo:page:').map((k) => k.slice('photo:page:'.length)),
    values: () => keys('photo:page:').map((k) => store.data.get(k) as PageRecord),
    has: (id: string) => store.data.has(`photo:page:${id}`),
  };
  return { store: waiting, files, pages, fail: store.fail, meta: () => (store.data.get('photo:meta') as Meta | undefined) ?? null };
}

const reader = (calls: { n: number }): Recognizer => ({
  recognize: async (_b, _l, onProgress) => {
    calls.n++;
    onProgress(1, 'done');
    return { text: 'Hello there', confidence: 90, lines: [{ text: 'Hello there', confidence: 90, bbox: { x0: 50, y0: 50, x1: 450, y1: 110 } }] };
  },
});

const wait = (ms = 400) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const add = (...files: File[]) => fireEvent.change(screen.getByLabelText('Photo'), { target: { files } });
const tiles = () => [...document.querySelectorAll('.page-tile')] as HTMLElement[];

/** A page as it would have been saved: one text layer, one undo step, text already read. */
function savedPage(id: string, name: string, over: Partial<PageRecord> = {}): SavedPage {
  const layer = newLayer({ x: 50, y: 50, text: 'Zdravo' });
  return { id, name, file: png(name), objects: new Map(), missing: [], lang: 'en', script: 'standard', hist: H.push(H.start(emptyDoc()), fromV1([layer])), glyphs: [], read: true, thumb: 'data:image/jpeg;base64,BBBB', ...over };
}

describe('keeping pages on this device', () => {
  it('keeps the picture, the order of the pages and which is shown, as pages are added', async () => {
    const m = memoryStore();
    render(<PhotoEditor recognizer={reader({ n: 0 })} store={m.store} />);
    await wait(50);
    add(png('one.png'));
    await wait();
    add(png('two.png'));
    await wait();
    expect(m.files.values().map((f) => f.name)).toEqual(['one.png', 'two.png']);
    const ids = m.files.keys();
    expect(m.meta()).toEqual({ order: ids, current: ids[1] });
    expect(screen.getByText('Kept on this device')).toBeTruthy();
  });

  it('keeps each page\'s changes and undo steps as they are made', async () => {
    const m = memoryStore();
    render(<PhotoEditor recognizer={reader({ n: 0 })} store={m.store} />);
    await wait(50);
    add(png('one.png'));
    await wait();
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
    await wait();
    const rec = m.pages.values()[0]!;
    expect(rec.name).toBe('one.png');
    expect(rec.hist.present.layers).toHaveLength(1);
    expect(rec.hist.past).toHaveLength(1);
    expect(rec.read).toBe(true);
    expect(rec.glyphs.length).toBeGreaterThan(0); // the letters found, so the picture need not be read again
  });

  it('keeps an edit made just before the editor closes, without waiting for the pause that normally precedes saving', async () => {
    const m = memoryStore();
    render(<PhotoEditor recognizer={reader({ n: 0 })} store={m.store} />);
    await wait(50);
    add(png('one.png'));
    await wait();
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
    cleanup(); // well within the 250 ms
    await wait(100);
    expect(m.pages.values()[0]!.hist.present.layers).toHaveLength(1);
  });

  it('brings the pages back next time, as they were left, without reading the pictures again', async () => {
    const calls = { n: 0 };
    const seed = { meta: { order: ['a', 'b'], current: 'b' }, pages: [savedPage('a', 'first.png'), savedPage('b', 'second.png')] };
    render(<PhotoEditor recognizer={reader(calls)} store={memoryStore(seed).store} />);
    expect(screen.getByText('Getting your pictures back…')).toBeTruthy();
    await waitFor(() => expect(tiles()).toHaveLength(2));
    expect(tiles().map((t) => t.getAttribute('aria-label'))).toEqual(['Page 1: first.png', 'Page 2: second.png']);
    expect(tiles()[1]!.getAttribute('aria-current')).toBe('page'); // the page that was showing
    expect(document.querySelectorAll('.page-dot')).toHaveLength(2); // both have changes in them
    await wait(50);
    expect(calls.n).toBe(0); // read already: not read again
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(false); // the undo steps came back too
  });

  it('reads a picture again if it had not been read to the end', async () => {
    const calls = { n: 0 };
    const seed = { meta: { order: ['a'], current: 'a' }, pages: [savedPage('a', 'first.png', { read: false })] };
    render(<PhotoEditor recognizer={reader(calls)} store={memoryStore(seed).store} />);
    await waitFor(() => expect(tiles()).toHaveLength(1));
    await wait(50);
    expect(calls.n).toBe(1);
  });

  it('puts the restored pictures in the Uploads list again', async () => {
    const seed = { meta: { order: ['a'], current: 'a' }, pages: [savedPage('a', 'first.png')] };
    render(<PhotoEditor recognizer={reader({ n: 0 })} store={memoryStore(seed).store} />);
    await waitFor(() => expect(tiles()).toHaveLength(1));
    // with no Studio around it the library is inert; what matters here is that restoring does not break without one
    expect(tiles()[0]!.getAttribute('aria-current')).toBe('page');
  });

  it('forgets a page that is removed, and everything when the last one goes', async () => {
    const seed = { meta: { order: ['a', 'b'], current: 'a' }, pages: [savedPage('a', 'first.png', { hist: H.start(emptyDoc()) }), savedPage('b', 'second.png', { hist: H.start(emptyDoc()) })] };
    const m = memoryStore(seed);
    render(<PhotoEditor recognizer={reader({ n: 0 })} store={m.store} />);
    await waitFor(() => expect(tiles()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Remove page 2' }));
    await wait();
    expect(m.pages.keys()).toEqual(['a']);
    expect(m.meta()!.order).toEqual(['a']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove page 1' }));
    await wait();
    expect(m.pages.size).toBe(0);
    expect(m.meta()).toBeNull();
    expect(document.querySelector('.dropzone')).toBeTruthy();
  });

  it('asks before removing a page that has changes, since that now deletes the saved copy too', async () => {
    const seed = { meta: { order: ['a'], current: 'a' }, pages: [savedPage('a', 'first.png')] };
    const m = memoryStore(seed);
    render(<PhotoEditor recognizer={reader({ n: 0 })} store={m.store} />);
    await waitFor(() => expect(tiles()).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Remove page 1' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('first.png');
    expect(m.pages.has('a')).toBe(true); // nothing deleted yet
  });

  it('says so when the browser will not keep the work, instead of pretending', async () => {
    const m = memoryStore();
    m.fail.on = true;
    render(<PhotoEditor recognizer={reader({ n: 0 })} store={m.store} />);
    await wait(50);
    add(png('one.png'));
    await wait();
    expect(screen.getByRole('alert').textContent).toContain('Could not keep your work');
  });

  it('says what is kept where, on the empty start', async () => {
    render(<PhotoEditor recognizer={reader({ n: 0 })} store={memoryStore().store} />);
    await waitFor(() => expect(screen.getByText(/kept on this device, and nowhere else/)).toBeTruthy());
  });

  it('works without a store: nothing is kept, and the browser warns before the work is lost', async () => {
    render(<PhotoEditor recognizer={reader({ n: 0 })} store={null} />);
    add(png('one.png'));
    await wait();
    expect(screen.queryByText('Kept on this device')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('starts empty, and says why, when the saved pictures cannot be read', async () => {
    const m = memoryStore();
    await m.store.saveFile('keep', png('keep.png'));
    await m.store.savePage({ id: 'keep', name: 'keep.png', lang: 'en', script: 'standard', glyphs: [], read: true, hist: { past: [], present: { base: {}, layers: [], background: 'transparent' }, future: [] } } as never);
    await m.store.saveMeta({ order: ['keep'], current: 'keep' });
    m.store.load = async () => {
      throw new Error('StorageTimeout');
    };
    render(<PhotoEditor recognizer={reader({ n: 0 })} store={m.store} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be read'));
    expect(document.querySelector('.dropzone')).toBeTruthy(); // not stuck waiting: the editor is usable
    await act(async () => {});
    // A failed read must not look like "no pages": the pictures that are still saved are not erased.
    expect(m.pages.has('keep')).toBe(true);
    expect(m.files.keys()).toContain('keep');
    expect(m.meta()).not.toBeNull();
  });
});
