// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { CutoutOutput } from '../src/photo/CutoutDialog.tsx';
import type { RenderRequest } from '../src/photo/render.ts';
import type { ImageLayer, PhotoLayer } from '../src/photo/doc.ts';
import { isImage } from '../src/photo/doc.ts';
import type { Recognizer } from '../src/photo/ocr.ts';
import { memoryPhotoStore, type PageRecord } from '../src/photo/store.ts';
import PhotoEditor from '../src/photo/PhotoEditor.tsx';
import { setRenderProbe } from '../src/photo/render-probe.ts';
import { screen } from './live-screen.ts';
import { fakeContext } from './photo-canvas.ts';

/** What the stand-in dialog hands back when its buttons are pressed (the real dialog is tested in photo-cutout-dialog.test.tsx). */
const h = vi.hoisted(() => ({ out: null as null | CutoutOutput, opened: 0, source: null as unknown }));
vi.mock('../src/photo/CutoutDialog.tsx', () => ({
  default: (p: { source: unknown; onKeep: (o: CutoutOutput) => void; onReplace: (o: CutoutOutput) => void; onClose: () => void }) => {
    h.opened++;
    h.source = p.source;
    return (
      <div role="dialog" aria-label="Remove the background">
        <button onClick={() => p.onKeep(h.out!)}>stub keep</button>
        <button onClick={() => p.onReplace(h.out!)}>stub replace</button>
        <button onClick={p.onClose}>stub close</button>
      </div>
    );
  },
}));

const calls: RenderRequest[] = [];
const ctx = fakeContext();

beforeEach(() => {
  calls.length = 0;
  h.opened = 0;
  setRenderProbe((r) => calls.push(r));
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, type?: string) {
    cb(new Blob(['x'], { type: type ?? 'image/png' }));
  } as never;
  HTMLCanvasElement.prototype.toDataURL = (() => 'data:image/jpeg;base64,AAAA') as never;
  URL.createObjectURL = () => 'blob:pic';
  URL.revokeObjectURL = () => {};
  Blob.prototype.arrayBuffer ??= function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.readAsArrayBuffer(this);
    });
  };
  vi.stubGlobal('Image', class { onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 800; naturalHeight = 600; set src(_v: string) { queueMicrotask(() => this.onload?.()); } });
  // A decoded picture remembers which file it came from, so a test can tell the cut-out from the original.
  vi.stubGlobal('createImageBitmap', async (f: File) => ({ width: 800, height: 600, name: f.name, close: vi.fn() }));
  h.out = { png: new Blob(['png'], { type: 'image/png' }), width: 200, height: 300, box: { x: 100, y: 50, w: 200, h: 300 }, scale: 1, picture: { w: 800, h: 600 } };
});
afterEach(() => {
  setRenderProbe(null);
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ocr: Recognizer = { recognize: async (_b, _l, p) => (p(1, 'done'), { text: '', confidence: 90, lines: [] }) };
const png = (name = 'sign.png') => new File(['x'], name, { type: 'image/png' });
const later = () => act(async () => {});
const last = () => calls.at(-1)!;
const nameOfBase = () => (last().base as unknown as { name?: string }).name;
const images = () => last().doc.layers.filter(isImage) as ImageLayer[];
const undoDisabled = () => (screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled;
const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

async function open(store: ReturnType<typeof memoryPhotoStore> | null = null) {
  render(<PhotoEditor recognizer={ocr} store={store} />);
  if (store && store.data.has('photo:meta')) await waitFor(() => expect(document.querySelector('.layer-canvas')).toBeTruthy());
  else {
    await waitFor(() => expect(screen.getByLabelText('Photo')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Photo'), { target: { files: [png()] } });
  }
  await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Photo tools' })).toBeTruthy());
  await later();
  await later();
}
const openDialog = async () => {
  await click('Remove background');
  await waitFor(() => expect(screen.getByRole('dialog', { name: 'Remove the background' })).toBeTruthy());
};
const choose = async (what: 'stub keep' | 'stub replace') => {
  await click(what);
  await later();
  await later();
};

async function seed(doc: Partial<PageRecord['hist']['present']>, withFile: boolean) {
  const store = memoryPhotoStore();
  await store.saveFile('a', png('first.png'));
  if (withFile) await store.saveObjectFile('a', 'bg1', new File(['x'], 'background.png', { type: 'image/png' }));
  await store.savePage({
    id: 'a', name: 'first.png', lang: 'en', script: 'standard', glyphs: [], read: true,
    layerFiles: withFile ? ['bg1'] : undefined,
    hist: { past: [], present: { base: {}, layers: [], background: 'transparent', ...doc }, future: [] },
  } as PageRecord);
  await store.saveMeta({ order: ['a'], current: 'a' });
  return store;
}

describe('the Remove background button', () => {
  it('opens the dialog with the page\'s own picture, and is disabled while cropping', async () => {
    await open();
    await openDialog();
    expect(h.source).toBeInstanceOf(File);
    expect((h.source as File).name).toBe('sign.png');
    await click('stub close');
    expect(screen.queryByRole('dialog', { name: 'Remove the background' })).toBeNull();
    await click('Crop and rotate');
    expect((screen.getByRole('button', { name: 'Remove background' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks for the crop and rotation to be reset first, instead of placing a cut-out in the wrong spot', async () => {
    const store = await seed({ base: { turns: 1 } }, false);
    await open(store);
    await click('Remove background');
    expect(h.opened).toBe(0);
    expect(screen.getByText(/reset the crop and rotation first/i)).toBeTruthy();
  });
});

describe('Keep as picture layer', () => {
  it('adds a selected picture layer above the original at the cut-out\'s place, stored and tracked, as one undo step', async () => {
    const store = memoryPhotoStore();
    await open(store);
    expect(undoDisabled()).toBe(true);
    await openDialog();
    await choose('stub keep');
    await waitFor(() => expect(images()).toHaveLength(1)); // the cut-out is decoded off the main turn
    const [layer] = images();
    expect(layer).toMatchObject({ kind: 'image', cutoutOf: 'base', x: 100, y: 50, w: 200, h: 300 });
    expect(last().images.pictureOf(layer!.src)).toBeTruthy(); // decoded into the on-screen map
    expect(screen.getByRole('group', { name: /Selected picture/ })).toBeTruthy(); // selected afterwards
    expect(screen.queryByRole('dialog', { name: 'Remove the background' })).toBeNull();
    await waitFor(() => expect([...store.data.keys()].some((k) => k.startsWith('photo:page:'))).toBe(true)); // saved after a short delay
    const id = [...store.data.keys()].find((k) => k.startsWith('photo:obj:'));
    expect(id).toBe(`photo:obj:${[...store.data.keys()].find((k) => k.startsWith('photo:page:'))!.split(':')[2]}:${layer!.src}`);
    await waitFor(() => expect((store.data.get([...store.data.keys()].find((k) => k.startsWith('photo:page:'))!) as PageRecord | undefined)?.layerFiles).toContain(layer!.src));
    await click('Undo');
    expect(images()).toHaveLength(0);
    expect(undoDisabled()).toBe(true); // one step
    await click('Redo');
    expect(images()).toHaveLength(1);
  });

  it('scales the box when the dialog\'s working picture differs slightly from the page\'s', async () => {
    h.out = { ...h.out!, box: { x: 50, y: 25, w: 100, h: 150 }, picture: { w: 400, h: 300 } }; // half the page's size
    await open();
    await openDialog();
    await choose('stub keep');
    await waitFor(() => expect(images()).toHaveLength(1));
    expect(images()[0]).toMatchObject({ x: 100, y: 50, w: 200, h: 300 });
  });
});

describe('Replace the background', () => {
  it('sets base.background, draws the cut-out instead of the original, and keeps the original file', async () => {
    const store = memoryPhotoStore();
    await open(store);
    await openDialog();
    await choose('stub replace');
    const id = last().doc.base.background!;
    expect(id).toBeTruthy();
    await waitFor(() => expect(nameOfBase()).toBe('background.png'));
    expect(last().doc.layers).toHaveLength(0);
    expect([...store.data.keys()].some((k) => k.startsWith('photo:file:'))).toBe(true);
    expect([...store.data.keys()].some((k) => k.endsWith(`:${id}`))).toBe(true);
    // undo is one step and shows the original pixels again
    await click('Undo');
    expect(last().doc.base.background).toBeUndefined();
    expect(nameOfBase()).toBeUndefined();
    expect(undoDisabled()).toBe(true);
    await click('Redo');
    await waitFor(() => expect(nameOfBase()).toBe('background.png'));
  });

  it('"Restore the background" clears it in one undoable step', async () => {
    await open();
    await openDialog();
    await choose('stub replace');
    await waitFor(() => expect(nameOfBase()).toBe('background.png'));
    await click('Restore the background');
    expect(last().doc.base.background).toBeUndefined();
    expect(nameOfBase()).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Restore the background' })).toBeNull();
    await click('Undo'); // brings the replacement back: the restore was one step
    expect(last().doc.base.background).toBeTruthy();
    await waitFor(() => expect(nameOfBase()).toBe('background.png'));
    expect(undoDisabled()).toBe(false);
    await click('Undo');
    expect(undoDisabled()).toBe(true);
  });

  it('the export draws the replaced base, and the original again after a restore', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const drawn = () => (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as { name?: string }).name);
    const exportOnce = async () => {
      await act(() => new Promise((r) => setTimeout(r, 320))); // the page's thumbnail is drawn a moment after a change: let it finish first
      (ctx.drawImage as ReturnType<typeof vi.fn>).mockClear();
      await click('Save picture');
      await click('Download');
      await waitFor(() => expect(drawn().length).toBeGreaterThan(0));
    };
    await open();
    await openDialog();
    await choose('stub replace');
    await waitFor(() => expect(nameOfBase()).toBe('background.png'));
    await exportOnce();
    expect(drawn()).toContain('background.png');
    await click('Restore the background');
    await exportOnce();
    expect(drawn()).not.toContain('background.png');
  });
});

describe('a page with a replaced background, reopened', () => {
  it('loads the stored cut-out as the base', async () => {
    const store = await seed({ base: { background: 'bg1' } }, true);
    await open(store);
    await waitFor(() => expect(nameOfBase()).toBe('background.png'));
    expect(screen.queryByTestId('background-missing')).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore the background' })).toBeTruthy();
  });

  it('shows a notice and falls back to the original pixels when the file is gone', async () => {
    const store = await seed({ base: { background: 'bg1' } }, false);
    await open(store);
    await waitFor(() => expect(screen.getByTestId('background-missing')).toBeTruthy());
    expect(nameOfBase()).toBeUndefined();
    expect(last().doc.base.background).toBe('bg1'); // still recorded, so Restore (or a new replace) is the person's choice
  });
});
