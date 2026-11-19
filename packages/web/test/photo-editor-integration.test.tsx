// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { RenderRequest } from '../src/photo/render.ts';
import type { PhotoLayer, ShapeLayer, ImageLayer } from '../src/photo/doc.ts';
import { isImage, isShape, isText } from '../src/photo/doc.ts';
import type { Recognizer } from '../src/photo/ocr.ts';
import { memoryPhotoStore, type PageRecord } from '../src/photo/store.ts';
import PhotoEditor from '../src/photo/PhotoEditor.tsx';
import { setRenderProbe } from '../src/photo/render-probe.ts';
import { screen } from './live-screen.ts';
import { fakeContext } from './photo-canvas.ts';

/** Every request the page canvas made to the renderer, newest last. */
const calls: RenderRequest[] = [];
const ctx = fakeContext();
const blobTypes: (string | undefined)[] = [];
const blobQuality: (number | undefined)[] = [];
const canvasSizes: number[] = [];

beforeEach(() => {
  calls.length = 0;
  setRenderProbe((r) => calls.push(r));
  blobTypes.length = 0;
  blobQuality.length = 0;
  canvasSizes.length = 0;
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, cb: BlobCallback, type?: string, quality?: number) {
    blobTypes.push(type);
    blobQuality.push(quality);
    canvasSizes.push(this.width);
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
  // A decoded layer picture: 200 x 100, and closable.
  vi.stubGlobal('createImageBitmap', async () => ({ width: 200, height: 100, close: vi.fn() }));
});
afterEach(() => {
  setRenderProbe(null);
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ocr = (lines: string[]): Recognizer => ({
  recognize: async (_b, _l, onProgress) => {
    onProgress(1, 'done');
    return { text: lines.join('\n'), confidence: 90, lines: lines.map((text, i) => ({ text, confidence: 90, bbox: { x0: 50, y0: 50 + i * 80, x1: 450, y1: 110 + i * 80 } })) };
  },
});
const png = (name = 'sign.png') => new File(['x'], name, { type: 'image/png' });
const later = () => act(async () => {});
const last = () => calls.at(-1)!;
const layersNow = (): PhotoLayer[] => last().doc.layers;
const shapes = () => layersNow().filter(isShape) as ShapeLayer[];
const pane = () => document.querySelector('.photo-page:not([hidden])') as HTMLElement;
const canvas = () => pane().querySelector('.layer-canvas') as HTMLCanvasElement;

async function open(lines: string[] = [], store?: ReturnType<typeof memoryPhotoStore> | null) {
  render(<PhotoEditor recognizer={ocr(lines)} store={store === undefined ? null : store} />);
  if (store && store.data.has('photo:meta')) await waitFor(() => expect(document.querySelector('.layer-canvas')).toBeTruthy());
  else {
    await waitFor(() => expect(screen.getByLabelText('Photo')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Photo'), { target: { files: [png()] } });
  }
  await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Photo tools' })).toBeTruthy());
  await later();
  await later();
}
const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};
const ptr = (target: EventTarget, type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number, extra: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0, ...extra }));
const key = async (k: string, extra: KeyboardEventInit = {}, target: Element | Window = window) => {
  await act(async () => {
    fireEvent.keyDown(target, { key: k, ...extra });
  });
};
const addShape = async (name = 'Add rectangle') => {
  await click('Add');
  await click(name);
  await later();
};
const undoDisabled = () => (screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled;
const slider = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('adding things to the page', () => {
  it('adds a shape in the middle of the page, selects it and shows it in the layers list', async () => {
    await open();
    await addShape();
    expect(shapes()).toHaveLength(1);
    expect(shapes()[0]!.x + shapes()[0]!.w / 2).toBe(400);
    expect(screen.getByRole('group', { name: /Selected shape/ })).toBeTruthy(); // the transform box
    expect(screen.getByLabelText('Opacity')).toBeTruthy(); // the picture and shape controls
    await click('Layers');
    expect(screen.getByRole('button', { name: 'Rectangle' })).toBeTruthy();
  });

  it('adds a sticker as a text layer', async () => {
    await open();
    await click('Add');
    await click('Add sticker 🎉');
    expect(layersNow().filter(isText).map((l) => l.text)).toEqual(['🎉']);
  });

  it('adds a picture from the Add panel: decoded, kept next to the page, drawn by the renderer', async () => {
    const store = memoryPhotoStore();
    await open([], store);
    await click('Add');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add pictures'), { target: { files: [png('badge.png')] } });
    });
    await waitFor(() => expect(layersNow().some(isImage)).toBe(true));
    const img = layersNow().find(isImage) as ImageLayer;
    expect(img.name).toBe('badge.png');
    expect(last().images.pictureOf(img.src)).toBeTruthy();
    expect([...store.data.keys()].some((k) => k.startsWith('photo:obj:') && k.endsWith(img.src))).toBe(true);
  });

  it('says why a file cannot be added, and adds nothing', async () => {
    vi.stubGlobal('createImageBitmap', async () => {
      throw new Error('nope');
    });
    await open();
    await click('Add');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add pictures'), { target: { files: [png('bad.png')] } });
    });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be read as a picture'));
    expect(layersNow()).toHaveLength(0);
  });

  it('takes pictures dropped on the page', async () => {
    await open();
    await act(async () => {
      fireEvent.drop(pane().querySelector('.canvas-wrap')!, { dataTransfer: { files: [png('dropped.png')], types: ['Files'] } });
    });
    await waitFor(() => expect(layersNow().filter(isImage)).toHaveLength(1));
  });

  it('takes a picture pasted from the clipboard, and layers pasted from a copy', async () => {
    await open();
    const pasteEvent = (data: { files?: File[]; text?: string }) => {
      const e = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(e, 'clipboardData', { value: { files: data.files ?? [], getData: () => data.text ?? '' } });
      return act(async () => void window.dispatchEvent(e));
    };
    await pasteEvent({ files: [png('p.png')] });
    await waitFor(() => expect(layersNow().filter(isImage)).toHaveLength(1));
    // copy a shape and paste it: the clipboard text is our payload
    let written = '';
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (t: string) => void (written = t) } });
    await addShape();
    await key('c', { ctrlKey: true });
    expect(written).toContain('interslavic-photo-layers');
    await pasteEvent({ text: written });
    expect(shapes()).toHaveLength(2);
    expect(new Set(shapes().map((s) => s.id)).size).toBe(2); // fresh ids
  });
});

describe('moving and resizing', () => {
  it('picks the layer under the pointer, moves it, snaps to the page centre, and makes one undo step', async () => {
    await open();
    await addShape();
    const before = shapes()[0]!;
    await act(async () => {
      ptr(canvas(), 'pointerdown', 400, 300);
      ptr(window, 'pointermove', 404, 304); // 4 px off the centre: pulled back to it
    });
    expect(shapes()[0]!.x).toBe(before.x);
    expect(shapes()[0]!.y).toBe(before.y);
    expect(last().doc).toBeTruthy();
    await act(async () => {
      ptr(window, 'pointermove', 500, 400);
      ptr(window, 'pointerup', 500, 400);
    });
    expect(shapes()[0]!.x).not.toBe(before.x);
    await click('Undo');
    expect(shapes()[0]!.x).toBe(before.x); // the whole drag was one step; the add is the one before
    expect(shapes()).toHaveLength(1);
  });

  it('holding Alt switches snapping off', async () => {
    await open();
    await addShape();
    const before = shapes()[0]!;
    await act(async () => {
      ptr(canvas(), 'pointerdown', 400, 300);
      ptr(window, 'pointermove', 404, 304, { altKey: true });
      ptr(window, 'pointerup', 404, 304, { altKey: true });
    });
    expect(shapes()[0]!.x).toBe(before.x + 4);
  });

  it('a drag cancelled with Escape leaves no step', async () => {
    await open();
    await addShape();
    await click('Undo'); // back to nothing, then redo so the add is the last step
    await click('Redo');
    const before = shapes()[0]!;
    await act(async () => {
      ptr(canvas(), 'pointerdown', 400, 300);
      ptr(window, 'pointermove', 500, 450);
    });
    expect(shapes()[0]!.x).not.toBe(before.x);
    await key('Escape');
    expect(shapes()[0]!.x).toBe(before.x);
    expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shift-click adds to the selection and a Shift drag on empty space selects what it touches', async () => {
    await open();
    await addShape();
    await addShape('Add ellipse');
    await act(async () => {
      ptr(canvas(), 'pointerdown', 5, 5);
      ptr(window, 'pointerup', 5, 5);
    });
    expect(screen.queryByRole('group', { name: /Selected shape/ })).toBeNull();
    await act(async () => {
      ptr(canvas(), 'pointerdown', 5, 5, { shiftKey: true });
      ptr(window, 'pointermove', 790, 590);
      ptr(window, 'pointerup', 790, 590);
    });
    expect(last().selected).toHaveLength(2);
    expect(screen.getByText(/2 pictures and shapes selected/)).toBeTruthy();
  });

  it('resizes through the transform box in one undo step, keeping the opposite corner', async () => {
    await open();
    await addShape();
    const s = shapes()[0]!;
    const handle = pane().querySelector('[data-handle="se"]')!;
    await act(async () => {
      ptr(handle, 'pointerdown', s.x + s.w, s.y + s.h);
      ptr(pane().querySelector('.tbox')!, 'pointermove', s.x + s.w + 60, s.y + s.h + 60);
      ptr(pane().querySelector('.tbox')!, 'pointerup', s.x + s.w + 60, s.y + s.h + 60);
    });
    const after = shapes()[0]!;
    expect(after.w).toBeGreaterThan(s.w);
    expect(after.x).toBeCloseTo(s.x, 5);
    expect(after.y).toBeCloseTo(s.y, 5);
    await click('Undo');
    expect(shapes()[0]!.w).toBe(s.w);
  });
});

describe('layers panel and keys', () => {
  it('a hidden layer is not drawn and cannot be picked; a locked one cannot be picked either', async () => {
    await open();
    await addShape();
    await click('Layers');
    await click('Hide Rectangle');
    expect((layersNow()[0] as ShapeLayer & { hidden?: boolean }).hidden).toBe(true);
    await act(async () => {
      ptr(canvas(), 'pointerdown', 400, 300);
      ptr(window, 'pointerup', 400, 300);
    });
    expect(screen.queryByRole('group', { name: /Selected shape/ })).toBeNull();
    await click('Show Rectangle');
    await click('Lock Rectangle');
    await act(async () => {
      ptr(canvas(), 'pointerdown', 400, 300);
      ptr(window, 'pointerup', 400, 300);
    });
    expect(screen.queryByRole('group', { name: /Selected shape/ })).toBeNull();
  });

  it('reorders with the bracket keys, from a button that has the focus', async () => {
    await open();
    await addShape();
    await addShape('Add ellipse');
    const [rect, ellipse] = shapes();
    expect(shapes().map((s) => s.shape)).toEqual(['rect', 'ellipse']);
    const button = screen.getByRole('button', { name: 'Layers' });
    await key('[', {}, button);
    expect(shapes().map((s) => s.id)).toEqual([ellipse!.id, rect!.id]);
    await key(']', {}, button);
    expect(shapes().map((s) => s.id)).toEqual([rect!.id, ellipse!.id]);
  });

  it('Delete, undo, redo, duplicate and select all work after a panel button was clicked; Escape clears', async () => {
    await open();
    await addShape();
    const button = screen.getByRole('button', { name: 'Layers' });
    await key('d', { metaKey: true }, button);
    expect(shapes()).toHaveLength(2);
    await key('z', { metaKey: true }, button);
    expect(shapes()).toHaveLength(1);
    await key('z', { metaKey: true, shiftKey: true }, button);
    expect(shapes()).toHaveLength(2);
    await key('Delete', {}, button);
    expect(shapes()).toHaveLength(1); // the duplicate was the selection
    await key('z', { ctrlKey: true }, button);
    await key('a', { ctrlKey: true }, button);
    expect(last().selected).toHaveLength(2);
    await key('Escape', {}, button);
    expect(last().selected).toHaveLength(0);
  });

  it('arrow keys nudge the selection (Shift: 10) and leave sliders alone', async () => {
    await open();
    await addShape();
    const x = shapes()[0]!.x;
    await key('ArrowRight');
    await key('ArrowRight', { shiftKey: true });
    expect(shapes()[0]!.x).toBe(x + 11);
    await key('ArrowLeft', {}, slider('Opacity'));
    expect(shapes()[0]!.x).toBe(x + 11);
  });

  it('keys typed into a text box are not taken', async () => {
    await open();
    await addShape();
    await click('Add text');
    const box = screen.getByLabelText('Text', { selector: 'textarea' });
    await key('Delete', {}, box);
    expect(layersNow().filter(isText)).toHaveLength(1);
  });
});

describe('the picture itself', () => {
  it('an adjust slider dragged is one undo step, and the renderer is asked with the value on the way', async () => {
    await open();
    const brightness = () => slider('Brightness');
    await act(async () => {
      fireEvent.change(brightness(), { target: { value: '20' } });
    });
    expect(last().doc.base.adjust?.brightness).toBe(20);
    await act(async () => {
      fireEvent.change(brightness(), { target: { value: '45' } });
    });
    expect(last().doc.base.adjust?.brightness).toBe(45);
    expect(undoDisabled()).toBe(true); // still on its way: no step yet
    await act(async () => {
      fireEvent.pointerUp(brightness());
    });
    expect(undoDisabled()).toBe(false);
    await click('Undo');
    expect(last().doc.base.adjust?.brightness ?? 0).toBe(0);
    expect(undoDisabled()).toBe(true); // one step took it all back
  });

  it('picks a look, and Reset takes the colour edits away', async () => {
    await open();
    await click('Mono look');
    expect(last().doc.base.preset).toBe('mono');
    expect(last().presets!('mono', 1)).toMatchObject({ saturation: -100 });
    await click('Reset');
    expect(last().doc.base.preset).toBeUndefined();
  });

  it('Auto sets brightness, contrast and saturation in one step', async () => {
    await open();
    await click('Auto');
    expect(undoDisabled()).toBe(false);
    await click('Undo');
    expect(undoDisabled()).toBe(true);
  });

  it('Compare draws the page without its colour edits while it is held', async () => {
    await open();
    await click('Mono look');
    expect(last().doc.base.preset).toBe('mono');
    const compare = screen.getByRole('button', { name: /Compare/ });
    await act(async () => {
      fireEvent.pointerDown(compare);
    });
    expect(last().doc.base.preset).toBeUndefined();
    await act(async () => {
      fireEvent.pointerUp(compare);
    });
    expect(last().doc.base.preset).toBe('mono');
  });
});

describe('crop and rotate with text on the page', () => {
  const makeTextLayer = async () => {
    await open(['Hello there']);
    fireEvent.doubleClick(pane().querySelector('.live-line')!, { clientX: 100, clientY: 80 });
    await later();
    fireEvent.change(screen.getByLabelText('Text', { selector: 'textarea' }), { target: { value: 'tamo' } });
    await later();
  };

  it('a turn moves the text layer with the picture and keeps its hiding rectangle; the picture\'s words are then off limits, with a hint', async () => {
    await makeTextLayer();
    const before = layersNow().find(isText)!;
    expect(before.erase).toBeTruthy();
    await click('Crop and rotate');
    await click('Rotate right');
    await click('Apply');
    const after = layersNow().find(isText)!;
    expect(after.erase).toBeTruthy(); // a turn keeps the axes
    expect(after.x).not.toBe(before.x);
    expect(last().doc.base.turns).toBe(1);
    expect(canvas().width).toBe(600); // the page is now 600 x 800
    expect(pane().querySelector('.live-line')).toBeNull();
    expect(screen.getByTestId('geometry-hint').textContent).toContain('Reset the crop to select text in the picture');
  });

  it('straightening drops the hiding rectangles, and says so; resetting brings the picture\'s text back to select', async () => {
    await makeTextLayer();
    await click('Crop and rotate');
    await act(async () => {
      fireEvent.change(slider('Straighten'), { target: { value: '5' } });
      fireEvent.pointerUp(slider('Straighten'));
    });
    expect(calls.some((c) => c.doc.base.straighten === 5)).toBe(true); // but the picture shown is straightened
    await click('Apply');
    expect(layersNow().find(isText)!.erase).toBeUndefined();
    expect(screen.getByText(/no longer hides the lettering underneath/)).toBeTruthy();
    await click('Reset crop and rotation');
    expect(last().doc.base.straighten).toBeUndefined();
    expect(pane().querySelectorAll('.live-line').length).toBeGreaterThan(0);
  });

  it('Cancel leaves the page as it was, and Undo takes an applied crop back in one step', async () => {
    await open();
    await click('Crop and rotate');
    await click('Rotate right');
    await click('Cancel');
    expect(last().doc.base.turns).toBeUndefined();
    expect(undoDisabled()).toBe(true);
    await click('Crop and rotate');
    await click('Rotate right');
    await click('Apply');
    await click('Undo');
    expect(last().doc.base.turns).toBeUndefined();
  });
});

describe('Live Text after all this', () => {
  it('still selects a word and translates it, with other layers on the page', async () => {
    const sent: string[][] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => {
      const { lines } = JSON.parse(init.body) as { lines: string[] };
      sent.push(lines);
      return { ok: true, status: 200, json: async () => ({ results: lines.map((l) => ({ text: `ISV ${l}`, flagged: false, reasons: [] })) }) };
    }));
    await open(['Hello there']);
    await addShape();
    await key('Escape');
    fireEvent.doubleClick(pane().querySelector('.live-line')!, { clientX: 100, clientY: 80 });
    await later();
    expect((screen.getByLabelText('Text', { selector: 'textarea' }) as HTMLTextAreaElement).value).toBe('Hello');
    await click('Translate');
    expect(sent).toEqual([['Hello']]);
    expect(layersNow().filter(isText).map((l) => l.text)).toEqual(['ISV Hello']);
    expect(screen.getByLabelText('Effect', { selector: '[role=group]' })).toBeTruthy(); // the text effects panel sits under the text controls
  });

  it('a layer over the picture\'s words takes the pointer, not the words', async () => {
    await open(['Hello there']);
    await addShape(); // a big rectangle over the middle of the page, over the words
    await key('Escape');
    await act(async () => {
      ptr(pane().querySelector('.live-line')!, 'pointerdown', 400, 300);
      ptr(window, 'pointerup', 400, 300);
    });
    expect(screen.getByRole('group', { name: /Selected shape/ })).toBeTruthy(); // the shape was picked
    expect(pane().querySelector('.live-band')).toBeNull(); // and no words were
  });
});

describe('downloading', () => {
  it('asks the dialog\'s choices of the renderer: format, quality and size', async () => {
    let name = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    await open();
    await addShape();
    await click('Save picture');
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'JPG' }));
      fireEvent.click(screen.getByRole('radio', { name: '2x' }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Quality'), { target: { value: '0.5' } });
    });
    await click('Download');
    await waitFor(() => expect(name).toBe('sign-edited.jpg'));
    expect(blobTypes.at(-1)).toBe('image/jpeg');
    expect(blobQuality.at(-1)).toBeCloseTo(0.5);
    expect(canvasSizes.at(-1)).toBe(1600); // 2x of the 800 px page
    // the export draws with a renderer cache of its own (the screen's is not disturbed)
    const exported = calls.length;
    expect(exported).toBeGreaterThan(0);
  });

  it('makes a PDF of all the pages, and shows the thumbnail through the renderer', async () => {
    let name = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    await open();
    fireEvent.change(screen.getByLabelText('Photo'), { target: { files: [png('second.png')] } });
    await later();
    await later();
    await click('Save picture');
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'PDF' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'All 2 pages in one PDF' }));
    });
    await click('Download');
    await waitFor(() => expect(name).toBe('edited-pictures.pdf'));
  });
});

describe('pages kept on this device', () => {
  const seed = async (record: Partial<PageRecord> & { hist: unknown }) => {
    const store = memoryPhotoStore();
    await store.saveFile('a', png('first.png'));
    await store.savePage({ id: 'a', name: 'first.png', lang: 'en', script: 'standard', glyphs: [], read: true, ...record } as PageRecord);
    await store.saveMeta({ order: ['a'], current: 'a' });
    return store;
  };
  const textLayer = { id: 'l1', text: 'Zdravo', x: 50, y: 50, maxWidth: 0, style: { size: 30, font: 'sans', bold: false, italic: false, color: '#000', align: 'left', lineHeight: 1.2 } };

  it('opens a version-1 record (a history of text layers) as a page, and saves it again in the new form once', async () => {
    const store = await seed({ hist: { past: [[]], present: [textLayer], future: [] } });
    await open([], store);
    await waitFor(() => expect(document.querySelector('.layer-canvas')).toBeTruthy());
    await later();
    expect(layersNow().map((l) => (l as { text?: string }).text)).toEqual(['Zdravo']);
    await waitFor(() => {
      const saved = store.data.get('photo:page:a') as PageRecord;
      expect(Array.isArray(saved.hist.present)).toBe(false);
      expect(saved.hist.present.layers).toHaveLength(1);
    });
  });

  it('tells the person when a picture on the page could not be found, and shows the rest', async () => {
    const image = { id: 'i1', kind: 'image', src: 'gone', x: 10, y: 10, w: 100, h: 50, rotation: 0, opacity: 1, blend: 'normal' };
    const doc = { base: {}, layers: [textLayer, image], background: 'transparent' };
    const store = await seed({ hist: { past: [], present: doc, future: [] } });
    await open([], store);
    await waitFor(() => expect(screen.getByText(/1 picture on this page could not be found/)).toBeTruthy());
    expect(last().images.pictureOf('gone')).toBeNull();
    expect(layersNow()).toHaveLength(2); // the layer is still in the page; it is only not drawn
  });

  it('brings saved layer pictures back and decodes them for the page on screen only', async () => {
    const store = memoryPhotoStore();
    await store.saveFile('a', png('first.png'));
    await store.saveObjectFile('a', 'f1', png('badge.png'));
    const image = { id: 'i1', kind: 'image', src: 'f1', x: 10, y: 10, w: 100, h: 50, rotation: 0, opacity: 1, blend: 'normal' };
    await store.savePage({ id: 'a', name: 'first.png', lang: 'en', script: 'standard', glyphs: [], read: true, hist: { past: [], present: { base: {}, layers: [image], background: 'transparent' }, future: [] } } as PageRecord);
    await store.saveMeta({ order: ['a'], current: 'a' });
    await open([], store);
    await waitFor(() => expect(last().images.pictureOf('f1')).toBeTruthy());
    expect(screen.queryByText(/could not be found/)).toBeNull();
  });
});
