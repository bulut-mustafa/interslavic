// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import type { RenderRequest } from '../src/photo/render.ts';
import { isShape, isText, type ShapeLayer } from '../src/photo/doc.ts';
import type { Recognizer } from '../src/photo/ocr.ts';
import { memoryPhotoStore } from '../src/photo/store.ts';
import PhotoEditor from '../src/photo/PhotoEditor.tsx';
import { setRenderProbe } from '../src/photo/render-probe.ts';
import { PHONE_TOOLS } from '../src/phone/registry.ts';
import { screen } from './live-screen.ts';
import { fakeContext } from './photo-canvas.ts';
import { pointer } from './phone-media.ts';

const calls: RenderRequest[] = [];
const ctx = fakeContext();

beforeEach(() => {
  calls.length = 0;
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
  vi.stubGlobal('createImageBitmap', async () => ({ width: 200, height: 100, close: vi.fn() }));
});
afterEach(() => {
  setRenderProbe(null);
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window as unknown as { visualViewport?: unknown }).visualViewport;
});

const ocr: Recognizer = {
  recognize: async (_b, _l, onProgress) => {
    onProgress(1, 'done');
    return { text: 'Hello world', confidence: 90, lines: [{ text: 'Hello world', confidence: 90, bbox: { x0: 50, y0: 50, x1: 450, y1: 110 } }] };
  },
};

const file = (name = 'sign.png') => new File(['x'], name, { type: 'image/png' });
const last = () => calls[calls.length - 1]!;
const layers = () => last().doc.layers;
const surface = () => screen.getByTestId('photo-surface');
const strip = () => screen.getByRole('toolbar', { name: 'Photo tools' });
const stripLabels = () => [...strip().querySelectorAll('.ph-strip-label')].map((n) => n.textContent);
const dialogs = () => screen.queryAllByRole('dialog');
const tap = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

/** In jsdom the stage has no size, so the phone view uses 360 x 480; an 800 x 600 page then draws at k = 0.42, at left 12, top 114. */
const K = (360 - 24) / 800;
const at = (px: number, py: number): [number, number] => [12 + px * K, (480 - 600 * K) / 2 + py * K];

async function open(store: ReturnType<typeof memoryPhotoStore> | null = null) {
  render(<PhotoEditor phone recognizer={ocr} store={store} />);
  fireEvent.change(await screen.findByLabelText('Photo'), { target: { files: [file()] } });
  await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Photo tools' })).toBeTruthy());
  await act(async () => {});
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
}

const touch = {
  tap(x: number, y: number) {
    pointer(surface(), 'pointerdown', 1, x, y);
    pointer(surface(), 'pointerup', 1, x, y);
  },
  drag(from: [number, number], to: [number, number]) {
    pointer(surface(), 'pointerdown', 1, ...from);
    pointer(surface(), 'pointermove', 1, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
    pointer(surface(), 'pointermove', 1, ...to);
    pointer(surface(), 'pointerup', 1, ...to);
  },
};

async function addRectangle() {
  await tap('Add');
  await tap('Add rectangle');
}

describe('phone photo editor: shell', () => {
  it('is what the registry gives the photo tool on a phone', () => {
    expect(PHONE_TOOLS.photo).toBeTypeOf('function');
  });

  it('starts with a picker, then shows the bar, the page row and the idle tool strip', async () => {
    render(<PhotoEditor phone recognizer={ocr} store={null} />);
    expect(screen.getByLabelText('Photo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try a sample picture' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Photo'), { target: { files: [file()] } });
    await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Photo tools' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Pages: 1 of 1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pages (1)' })).toBeTruthy();
    expect(stripLabels()).toEqual(['Add', 'Background', 'Crop', 'Adjust', 'Text', 'Layers']);
    expect(strip().dataset.mode).toBe('idle');
    expect(document.querySelector('.editor-bar')).toBeNull(); // not the desktop layout
  });

  it('the desktop component is unchanged: no phone prop, no phone parts', async () => {
    render(<PhotoEditor recognizer={ocr} store={null} />);
    fireEvent.change(screen.getByLabelText('Photo'), { target: { files: [file()] } });
    await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Photo tools' })).toBeTruthy());
    expect(document.querySelector('.pp')).toBeNull();
    expect(document.querySelector('.ph-strip')).toBeNull();
    expect(document.querySelector('.editor-bar')).toBeTruthy();
  });
});

describe('phone photo editor: the strip follows the selection', () => {
  it('swaps to the text tools when text is selected and back when it is gone', async () => {
    await open();
    await tap('Add');
    await tap('Text');
    expect(strip().dataset.mode).toBe('text');
    expect(stripLabels()).toEqual(['Edit', 'Font', 'Size', 'Colour', 'Effects', 'Position', 'Layers', 'More']);
    expect(layers().filter(isText)).toHaveLength(1);
    await act(async () => touch.tap(2, 2)); // empty space beside the picture
    expect(strip().dataset.mode).toBe('idle');
  });

  it('shows picture tools for a picture and shape tools for a shape', async () => {
    await open();
    await addRectangle();
    expect(strip().dataset.mode).toBe('shape');
    expect(stripLabels()).toEqual(['Colour', 'Effects', 'Position', 'Layers', 'More']);
    // Pictures have Adjust and Frame, not Colour.
    await act(async () => touch.tap(2, 2));
    await tap('Add');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add pictures'), { target: { files: [file('logo.png')] } });
    });
    await waitFor(() => expect(strip().dataset.mode).toBe('image'));
    expect(stripLabels()).toEqual(['Adjust', 'Effects', 'Frame', 'Position', 'Layers', 'More']);
  });

  it('tapping a layer selects it and tapping empty space deselects', async () => {
    await open();
    await addRectangle();
    await act(async () => touch.tap(2, 2));
    expect(strip().dataset.mode).toBe('idle');
    await act(async () => touch.tap(...at(400, 300)));
    expect(strip().dataset.mode).toBe('shape');
  });
});

describe('phone photo editor: one sheet per tool', () => {
  it('opens one sheet for each idle tool, titled for it, and closes with Done', async () => {
    await open();
    for (const [item, title] of [['Add', 'Add'], ['Adjust', 'Adjust'], ['Text', 'Text'], ['Layers', 'Layers']] as const) {
      await tap(item);
      expect(dialogs()).toHaveLength(1);
      expect(screen.getByRole('dialog', { name: title })).toBeTruthy();
      await tap('Done');
      await waitFor(() => expect(dialogs()).toHaveLength(0));
    }
  });

  it('shrinks the picture area by the sheet height and gives the strip back after', async () => {
    await open();
    await tap('Add');
    const root = document.querySelector('.pp') as HTMLElement;
    expect(parseFloat(root.style.getPropertyValue('--sheet-h'))).toBeGreaterThan(100);
    expect(document.querySelector('.ph-strip')).toBeNull(); // the sheet is over the strip
    await tap('Done');
    await waitFor(() => expect(document.querySelector('.ph-strip')).toBeTruthy());
  });

  it('closing a selection tool when the selection goes', async () => {
    await open();
    await addRectangle();
    await tap('Position');
    expect(screen.getByRole('dialog', { name: 'Position' })).toBeTruthy();
    await act(async () => touch.tap(2, 2));
    await waitFor(() => expect(dialogs()).toHaveLength(0));
  });

  it('Add: text, shapes and stickers go on the page and close the sheet', async () => {
    await open();
    await tap('Add');
    expect(screen.getByRole('button', { name: 'Add rectangle' })).toBeTruthy();
    await tap('Add sticker 🎉');
    await waitFor(() => expect(dialogs()).toHaveLength(0));
    expect(layers().length).toBe(1);
  });

  it('Adjust has the looks row and sliders; a slider changes the picture and is one undo step', async () => {
    await open();
    await tap('Adjust');
    const sheet = screen.getByRole('dialog', { name: 'Adjust' });
    expect(within(sheet).getByRole('button', { name: 'No look' })).toBeTruthy();
    const slider = within(sheet).getByLabelText('Brightness') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(slider, { target: { value: '30' } });
      fireEvent.pointerUp(slider);
    });
    expect(last().doc.base.adjust?.brightness).toBe(30);
    await tap('Undo');
    expect(last().doc.base.adjust?.brightness ?? 0).toBe(0);
  });

  it('Crop: ratio chips, turn and flip are in the sheet, Apply and Cancel in its header', async () => {
    await open();
    await tap('Crop');
    const sheet = screen.getByRole('dialog', { name: 'Crop and rotate' });
    expect(within(sheet).getByRole('button', { name: '1:1' })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Rotate right' })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Flip horizontal' })).toBeTruthy();
    expect(within(sheet).getAllByRole('button', { name: 'Apply' })).toHaveLength(1);
    expect(within(sheet).getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
    expect(document.querySelectorAll('.crop-h').length).toBe(8); // the handles are on the picture
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: '1:1' }));
    });
    await act(async () => {
      fireEvent.click(within(sheet).getAllByRole('button', { name: 'Apply' })[0]!);
    });
    await waitFor(() => expect(dialogs()).toHaveLength(0));
    expect(last().doc.base.crop).toBeTruthy();
    expect(last().doc.base.crop!.w).toBeCloseTo(last().doc.base.crop!.h);
  });

  it('Crop: Cancel leaves the picture as it was', async () => {
    await open();
    await tap('Crop');
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Crop and rotate' })).getAllByRole('button', { name: 'Cancel' })[0]!);
    });
    await waitFor(() => expect(dialogs()).toHaveLength(0));
    expect(last().doc.base.crop).toBeUndefined();
  });

  it('Background opens the remove-background sheet (full height) with its own buttons', async () => {
    await open();
    await tap('Background');
    const sheet = await screen.findByRole('dialog', { name: 'Remove background' });
    expect(sheet.dataset.detent).toBe('0');
    expect(await within(sheet).findByRole('button', { name: /Download and remove the background/ })).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Not now' }));
    });
    await waitFor(() => expect(dialogs()).toHaveLength(0));
  });

  it('Layers: tap selects, buttons move up and down, eye hides, padlock locks', async () => {
    await open();
    await addRectangle();
    await act(async () => touch.tap(2, 2));
    await tap('Add');
    await tap('Add ellipse');
    await tap('Layers');
    const sheet = screen.getByRole('dialog', { name: 'Layers' });
    expect(within(sheet).getByRole('list', { name: 'Layer list, front first' })).toBeTruthy();
    // One bar of actions, for the one layer tapped: not a row of buttons on every layer.
    expect(within(sheet).queryAllByRole('button', { name: /^(Move|Hide|Lock|Delete) / }).filter((b) => b.getAttribute('aria-label')?.includes('Ellipse'))).toHaveLength(5);
    expect(within(sheet).queryAllByRole('button', { name: /^Delete / })).toHaveLength(1);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Rectangle' }));
    });
    expect(within(sheet).queryAllByRole('button', { name: /^Delete / })).toHaveLength(1);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Move Rectangle up' }));
    });
    expect(layers().map((l) => (isShape(l) ? l.shape : ''))).toEqual(['ellipse', 'rect']);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Hide Rectangle' }));
    });
    expect((layers().find((l) => isShape(l) && l.shape === 'rect') as ShapeLayer & { hidden?: boolean }).hidden).toBe(true);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Ellipse' }));
    });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Lock Ellipse' }));
    });
    expect((layers().find((l) => isShape(l) && l.shape === 'ellipse') as ShapeLayer & { locked?: boolean }).locked).toBe(true);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Rectangle' }));
    });
    expect(within(sheet).getByRole('button', { name: 'Rectangle' }).getAttribute('aria-pressed')).toBe('true');
    // Delete removes the tapped layer only and hands the bar to the next one.
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Delete Rectangle' }));
    });
    expect(layers()).toHaveLength(1);
    expect(within(sheet).queryAllByRole('button', { name: /^Delete / })).toHaveLength(1);
  });

  it('Position: align, arrange, nudge and rotation act on the selection', async () => {
    await open();
    await addRectangle();
    const x0 = (layers()[0] as ShapeLayer).x;
    await tap('Position');
    const sheet = screen.getByRole('dialog', { name: 'Position' });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Nudge right' }));
    });
    expect((layers()[0] as ShapeLayer).x).toBe(x0 + 5);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Align left' }));
    });
    expect((layers()[0] as ShapeLayer).x).toBe(0);
    const rot = sheet.querySelector('input[type=range]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(rot, { target: { value: '45' } });
      fireEvent.pointerUp(rot);
    });
    expect((layers()[0] as ShapeLayer).rotation).toBe(45);
    expect(within(sheet).getByRole('button', { name: 'Bring to front' })).toBeTruthy();
  });

  it('Font, Size, Colour and Effects reuse the shared text controls', async () => {
    await open();
    await tap('Add');
    await tap('Text');
    await tap('Font');
    expect(within(screen.getByRole('dialog', { name: 'Font' })).getByLabelText('Font')).toBeTruthy();
    await tap('Done');
    await tap('Size');
    const size = within(screen.getByRole('dialog', { name: 'Size' })).getByRole('button', { name: 'Larger text' });
    const before = (layers().find(isText))!.style.size;
    await act(async () => {
      fireEvent.click(size);
    });
    expect((layers().find(isText))!.style.size).toBeGreaterThan(before);
    await tap('Done');
    await tap('Colour');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Colour #e0245e' }));
    });
    expect((layers().find(isText))!.style.color).toBe('#e0245e');
    await tap('Done');
    await tap('Effects');
    expect(screen.getByRole('dialog', { name: 'Effects' })).toBeTruthy();
  });

  it('a picture gets Frame and Adjust sheets built from the object controls', async () => {
    await open();
    await tap('Add');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add pictures'), { target: { files: [file('logo.png')] } });
    });
    await waitFor(() => expect(strip().dataset.mode).toBe('image'));
    await tap('Frame');
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Frame' })).getByRole('button', { name: 'Ellipse frame' }));
    });
    expect((layers()[0] as { frame?: string }).frame).toBe('ellipse');
  });
});

describe('phone photo editor: undo, redo and download', () => {
  it('Undo and Redo walk the history', async () => {
    await open();
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
    await addRectangle();
    expect(layers()).toHaveLength(1);
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(false);
    await tap('Undo');
    expect(layers()).toHaveLength(0);
    expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(false);
    await tap('Redo');
    expect(layers()).toHaveLength(1);
  });

  it('Download opens the Download sheet and its button saves the file', async () => {
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await open();
    await tap('Download');
    const sheet = screen.getByRole('dialog', { name: 'Download' });
    expect(sheet.dataset.detent).toBe('0');
    expect(within(sheet).getByRole('radiogroup', { name: 'Format' })).toBeTruthy();
    expect(document.querySelector('.export-backdrop')).toBeNull(); // no second dialog over the sheet
    await act(async () => {
      fireEvent.click(within(sheet).getAllByRole('button', { name: 'Download' }).at(-1)!);
    });
    await waitFor(() => expect(clicked).toHaveBeenCalled());
    await waitFor(() => expect(dialogs()).toHaveLength(0));
  });

  it('Cancel in the Download sheet closes it', async () => {
    await open();
    await tap('Download');
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Download' })).getByRole('button', { name: 'Cancel' }));
    });
    await waitFor(() => expect(dialogs()).toHaveLength(0));
  });
});

describe('phone photo editor: gestures call the editor actions', () => {
  it('a drag moves the selected layer and is one undo step', async () => {
    await open();
    await addRectangle();
    const x0 = (layers()[0] as ShapeLayer).x;
    const from = at(400, 300);
    await act(async () => touch.drag(from, [from[0] + 42, from[1] + 21]));
    const moved = layers()[0] as ShapeLayer;
    expect(moved.x).toBeGreaterThan(x0 + 50);
    await tap('Undo');
    expect((layers()[0] as ShapeLayer).x).toBe(x0);
  });

  it('a drag on an unselected layer selects it first', async () => {
    await open();
    await addRectangle();
    await act(async () => touch.tap(2, 2));
    const from = at(400, 300);
    await act(async () => touch.drag(from, [from[0] + 21, from[1]]));
    expect(strip().dataset.mode).toBe('shape');
  });

  it('two fingers on the selected layer resize and turn it', async () => {
    await open();
    await addRectangle();
    const before = layers()[0] as ShapeLayer;
    const c = at(400, 300);
    await act(async () => {
      pointer(surface(), 'pointerdown', 1, c[0] - 30, c[1]);
      pointer(surface(), 'pointerdown', 2, c[0] + 30, c[1]);
      pointer(surface(), 'pointermove', 1, c[0] - 60, c[1] + 0);
      pointer(surface(), 'pointermove', 2, c[0] + 60, c[1] + 0);
      pointer(surface(), 'pointermove', 2, c[0] + 60 * Math.cos(Math.PI / 4), c[1] + 60 * Math.sin(Math.PI / 4));
      pointer(surface(), 'pointermove', 1, c[0] - 60 * Math.cos(Math.PI / 4), c[1] - 60 * Math.sin(Math.PI / 4));
      pointer(surface(), 'pointerup', 1, c[0], c[1]);
      pointer(surface(), 'pointerup', 2, c[0], c[1]);
    });
    const after = layers()[0] as ShapeLayer;
    expect(after.w).toBeCloseTo(before.w * 2, 0);
    expect(after.rotation).toBeGreaterThan(30);
    await tap('Undo');
    expect((layers()[0] as ShapeLayer).w).toBe(before.w);
  });

  it('two fingers on empty canvas zoom the picture, not the layer', async () => {
    await open();
    await addRectangle();
    const before = layers()[0] as ShapeLayer;
    await act(async () => touch.tap(2, 2));
    const wrap = document.querySelector('.pp-wrap') as HTMLElement;
    const w0 = parseFloat(wrap.style.width);
    await act(async () => {
      pointer(surface(), 'pointerdown', 1, 150, 300);
      pointer(surface(), 'pointerdown', 2, 210, 300);
      pointer(surface(), 'pointermove', 1, 120, 300);
      pointer(surface(), 'pointermove', 2, 240, 300);
      pointer(surface(), 'pointerup', 1, 120, 300);
      pointer(surface(), 'pointerup', 2, 240, 300);
    });
    expect(parseFloat(wrap.style.width)).toBeGreaterThan(w0 * 1.5);
    expect(layers()[0]).toEqual(before);
  });

  it('with a layer selected, two fingers away from it still zoom the picture', async () => {
    await open();
    await addRectangle();
    const wrap = document.querySelector('.pp-wrap') as HTMLElement;
    const w0 = parseFloat(wrap.style.width);
    await act(async () => {
      pointer(surface(), 'pointerdown', 1, 20, 440);
      pointer(surface(), 'pointerdown', 2, 70, 440);
      pointer(surface(), 'pointermove', 2, 170, 440);
      pointer(surface(), 'pointerup', 1, 20, 440);
      pointer(surface(), 'pointerup', 2, 170, 440);
    });
    expect(parseFloat(wrap.style.width)).toBeGreaterThan(w0);
  });

  it('double-tap on text edits it, with the keyboard bar above the keyboard', async () => {
    (window as unknown as { visualViewport: unknown }).visualViewport = { height: 400, offsetTop: 0, scale: 1, addEventListener() {}, removeEventListener() {} };
    await open();
    await tap('Add');
    await tap('Text');
    await act(async () => touch.tap(2, 2));
    const t = layers().find(isText)!;
    const p = at(t.x + 20, t.y + 20);
    await act(async () => {
      touch.tap(...p);
      touch.tap(...p);
    });
    expect(screen.getByLabelText('Type on the picture')).toBeTruthy();
    const bar = screen.getByRole('toolbar', { name: 'Text tools' });
    expect(within(bar).getByRole('button', { name: 'Font' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Size' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Colour' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: 'Colour' }));
    });
    expect(screen.queryByLabelText('Type on the picture')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Colour' })).toBeTruthy();
  });

  it('Done on the keyboard bar ends typing', async () => {
    (window as unknown as { visualViewport: unknown }).visualViewport = { height: 400, offsetTop: 0, scale: 1, addEventListener() {}, removeEventListener() {} };
    await open();
    await tap('Add');
    await tap('Text');
    await tap('Edit');
    expect(screen.getByLabelText('Type on the picture')).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(screen.getByRole('toolbar', { name: 'Text tools' })).getByRole('button', { name: 'Done' }));
    });
    expect(screen.queryByLabelText('Type on the picture')).toBeNull();
  });

  it('a long press on a layer selects it and opens More', async () => {
    await open();
    await addRectangle();
    await act(async () => touch.tap(2, 2));
    vi.useFakeTimers();
    const p = at(400, 300);
    await act(async () => {
      pointer(surface(), 'pointerdown', 1, ...p);
      vi.advanceTimersByTime(500);
    });
    vi.useRealTimers();
    const more = screen.getByRole('dialog', { name: 'More' });
    expect(within(more).getByRole('button', { name: 'Duplicate' })).toBeTruthy();
    expect(within(more).getByRole('button', { name: 'Delete' })).toBeTruthy();
  });

  it('the floating bar duplicates and deletes the selection', async () => {
    await open();
    await addRectangle();
    const bar = screen.getByRole('toolbar', { name: 'Selection' });
    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: 'Duplicate' }));
    });
    expect(layers()).toHaveLength(2);
    await act(async () => {
      fireEvent.click(within(screen.getByRole('toolbar', { name: 'Selection' })).getByRole('button', { name: 'Delete' }));
    });
    expect(layers()).toHaveLength(1);
    expect(screen.queryByRole('toolbar', { name: 'Selection' })).toBeNull(); // nothing is selected after a delete
    await act(async () => touch.tap(...at(400, 300)));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('toolbar', { name: 'Selection' })).getByRole('button', { name: 'More' }));
    });
    expect(screen.getByRole('dialog', { name: 'More' })).toBeTruthy();
  });
});

describe('phone photo editor: Live Text', () => {
  it('tap selects the word, the next tap the line, and the bar offers Translate, Edit and Copy', async () => {
    await open();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    await act(async () => {});
    const p = at(100, 80);
    await act(async () => touch.tap(...p));
    const bands = () => [...document.querySelectorAll<HTMLElement>('.live-band')].map((b) => parseFloat(b.style.width));
    expect(bands().length).toBe(1);
    const word = bands()[0]!;
    const bar = screen.getByRole('toolbar', { name: 'Selected text' });
    expect(within(bar).getByRole('button', { name: /Translate/ })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: /Edit/ })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Copy the text' })).toBeTruthy();
    expect(strip().dataset.mode).toBe('text');
    await act(async () => touch.tap(...p));
    expect(bands()[0]!).toBeGreaterThan(word);
    await act(async () => touch.tap(2, 2));
    expect(document.querySelectorAll('.live-band').length).toBe(0);
    expect(strip().dataset.mode).toBe('idle');
  });

  it('Select all text in the Text sheet picks everything found', async () => {
    await open();
    await tap('Text');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Select all text' }));
    });
    await waitFor(() => expect(document.querySelectorAll('.live-band').length).toBeGreaterThan(0));
  });
});

describe('phone photo editor: pages and the saved copy', () => {
  it('the page sheet adds, duplicates, reorders and deletes pages', async () => {
    await open();
    await tap(/^Pages: 1 of 1/);
    const sheet = screen.getByRole('dialog', { name: 'Pages' });
    await act(async () => {
      fireEvent.change(within(sheet).getByLabelText('Add pages'), { target: { files: [file('second.png')] } });
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Pages: 2 of 2/ })).toBeTruthy());
    const grid = screen.getByRole('dialog', { name: 'Pages' });
    expect(within(grid).getAllByRole('button', { name: /^Page \d/ })).toHaveLength(2);
    // The actions are one bar for the chosen page, not four buttons on every tile (they overlapped and the trash could not be tapped).
    expect(within(grid).getAllByRole('button', { name: /^Delete page/ })).toHaveLength(1);
    expect(within(grid).getAllByRole('button', { name: /^Duplicate page/ })).toHaveLength(1);
    await act(async () => {
      fireEvent.click(within(grid).getByRole('button', { name: 'Duplicate page 2' }));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Pages: 3 of 3/ })).toBeTruthy());
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Pages' })).getByRole('button', { name: 'Move page 3 earlier' }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Pages' })).getByRole('button', { name: /^Delete page \d/ }));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Pages: \d of 2/ })).toBeTruthy());
  });

  it('a duplicated page keeps the edits of the original', async () => {
    await open();
    await addRectangle();
    await act(async () => new Promise((r) => setTimeout(r, 400))); // the page tells its parent how it looks a moment after a change
    await tap(/^Pages: 1 of 1/);
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Pages' })).getByRole('button', { name: 'Duplicate page 1' }));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Pages: 2 of 2/ })).toBeTruthy());
    await act(async () => {});
    await waitFor(() => expect(layers()).toHaveLength(1));
  });

  it('keeps work under the same keys as the desktop: a phone page opens in the desktop editor', async () => {
    const store = memoryPhotoStore();
    await open(store);
    await addRectangle();
    await act(async () => new Promise((r) => setTimeout(r, 500)));
    await waitFor(async () => expect((await store.load())?.pages[0]?.hist.present.layers.length).toBe(1));
    cleanup();
    calls.length = 0;
    render(<PhotoEditor recognizer={ocr} store={store} />);
    await waitFor(() => expect(document.querySelector('.photo-page:not([hidden])')).toBeTruthy());
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    await waitFor(() => expect(layers().filter(isShape)).toHaveLength(1));
  });

  it('and a page saved by the desktop opens on the phone', async () => {
    const store = memoryPhotoStore();
    render(<PhotoEditor recognizer={ocr} store={store} />);
    fireEvent.change(await screen.findByLabelText('Photo'), { target: { files: [file()] } });
    await waitFor(() => expect(document.querySelector('.photo-page')).toBeTruthy());
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Add' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }));
    });
    await act(async () => new Promise((r) => setTimeout(r, 500)));
    await waitFor(async () => expect((await store.load())?.pages[0]?.hist.present.layers.length).toBe(1));
    cleanup();
    calls.length = 0;
    render(<PhotoEditor phone recognizer={ocr} store={store} />);
    await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Photo tools' })).toBeTruthy());
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    await waitFor(() => expect(layers().filter(isShape)).toHaveLength(1));
  });
});
