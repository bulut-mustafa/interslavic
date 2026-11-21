// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import type { RenderRequest } from '../src/photo/render.ts';
import { isText } from '../src/photo/doc.ts';
import type { Recognizer } from '../src/photo/ocr.ts';
import PhotoEditor from '../src/photo/PhotoEditor.tsx';
import { setRenderProbe } from '../src/photo/render-probe.ts';
import { emptyTextToRemove, holdInPlace, resetScroll } from '../src/phone/photo/typing.ts';
import { screen } from './live-screen.ts';
import { fakeContext } from './photo-canvas.ts';

const calls: RenderRequest[] = [];
const ctx = fakeContext();
beforeEach(() => {
  calls.length = 0;
  setRenderProbe((r) => calls.push(r));
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
    cb(new Blob(['x'], { type: 'image/png' }));
  } as never;
  HTMLCanvasElement.prototype.toDataURL = (() => 'data:image/jpeg;base64,AAAA') as never;
  URL.createObjectURL = () => 'blob:pic';
  URL.revokeObjectURL = () => {};
  vi.stubGlobal('Image', class { onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 800; naturalHeight = 600; set src(_v: string) { queueMicrotask(() => this.onload?.()); } });
  vi.stubGlobal('createImageBitmap', async () => ({ width: 200, height: 100, close: vi.fn() }));
});
afterEach(() => {
  setRenderProbe(null);
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ocr: Recognizer = { recognize: async (_b, _l, p) => (p(1, 'done'), { text: '', confidence: 0, lines: [] }) };
const layers = () => calls[calls.length - 1]!.doc.layers;
const tap = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};
async function open() {
  render(<PhotoEditor phone recognizer={ocr} store={null} />);
  fireEvent.change(await screen.findByLabelText('Photo'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
  await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Photo tools' })).toBeTruthy());
  await act(async () => {});
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
}
async function startTyping() {
  await open();
  await tap('Add');
  await tap('Text');
  await tap('Edit');
  return (await screen.findByLabelText('Type on the picture')) as HTMLTextAreaElement;
}

describe('typing helpers', () => {
  it('resetScroll zeroes only boxes that moved', () => {
    const a = { scrollTop: 40, scrollLeft: 0 };
    const b = { scrollTop: 0, scrollLeft: 0 };
    expect(resetScroll([a, b, null])).toBe(true);
    expect(a.scrollTop).toBe(0);
    expect(resetScroll([a, b])).toBe(false);
  });
  it('holdInPlace puts a scrolled box back and stops after cleanup', () => {
    const box = document.createElement('div');
    const stop = holdInPlace([box]);
    box.scrollTop = 30;
    box.dispatchEvent(new Event('scroll'));
    expect(box.scrollTop).toBe(0);
    stop();
    box.scrollTop = 30;
    box.dispatchEvent(new Event('scroll'));
    expect(box.scrollTop).toBe(30);
  });
  it('only a real text left empty is removed', () => {
    expect(emptyTextToRemove({ text: '  ' }, false)).toBe(true);
    expect(emptyTextToRemove({ text: 'a' }, false)).toBe(false);
    expect(emptyTextToRemove({ text: '' }, true)).toBe(false);
    expect(emptyTextToRemove(null, false)).toBe(false);
  });
});

describe('phone photo: typing on the picture', () => {
  it('focuses the box without scrolling, in at least 16px text, and adds no style to the editor root', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const box = await startTyping();
    await waitFor(() => expect(focus.mock.instances).toContain(box));
    const call = focus.mock.calls[focus.mock.instances.indexOf(box)]!;
    expect(call[0]).toEqual({ preventScroll: true });
    expect(parseFloat(box.style.fontSize)).toBeGreaterThanOrEqual(16);
    expect(document.querySelector<HTMLElement>('.pp')!.getAttribute('style') ?? '').not.toMatch(/padding|transform|top/);
  });

  it('puts the editor back when the browser scrolls it to reveal the box', async () => {
    const box = await startTyping();
    const pp = document.querySelector<HTMLElement>('.pp')!;
    const stage = document.querySelector<HTMLElement>('.pp-stage')!;
    pp.scrollTop = 120;
    stage.scrollTop = 60;
    fireEvent.scroll(pp);
    fireEvent.scroll(stage);
    expect(pp.scrollTop).toBe(0);
    expect(stage.scrollTop).toBe(0);
    expect(box.isConnected).toBe(true);
  });

  it('deleting every letter and finishing removes the empty text instead of leaving an invisible layer', async () => {
    const box = await startTyping();
    expect(layers().filter(isText)).toHaveLength(1);
    await act(async () => {
      fireEvent.change(box, { target: { value: '' } });
    });
    await act(async () => {
      fireEvent.blur(box);
    });
    expect(layers().filter(isText)).toHaveLength(0);
    expect(screen.queryByLabelText('Type on the picture')).toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Photo tools' }).dataset.mode).toBe('idle');
  });

  it('keeps a text that still has letters', async () => {
    const box = await startTyping();
    await act(async () => {
      fireEvent.change(box, { target: { value: 'Hi' } });
    });
    await act(async () => {
      fireEvent.blur(box);
    });
    expect(layers().filter(isText).map((l) => l.text)).toEqual(['Hi']);
  });
});

describe('phone photo: deleting', () => {
  it('the floating bar deletes the selection, leaves nothing selected and undo brings it back', async () => {
    await open();
    await tap('Add');
    await tap('Text');
    await tap('Delete');
    expect(layers()).toHaveLength(0);
    expect(screen.getByRole('toolbar', { name: 'Photo tools' }).dataset.mode).toBe('idle');
    await tap('Undo');
    expect(layers()).toHaveLength(1);
  });

  it('the Layers sheet can delete a layer, including a hidden one that cannot be picked on the picture', async () => {
    await open();
    await tap('Add');
    await tap('Text');
    await tap('Layers');
    const sheet = screen.getByRole('dialog', { name: 'Layers' });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: /^Hide / }));
    });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: /^Delete / }));
    });
    expect(layers()).toHaveLength(0);
    expect(within(screen.getByRole('dialog', { name: 'Layers' })).getByText(/No layers yet/)).toBeTruthy();
  });

  it('More > Delete removes the layer and closes the sheet', async () => {
    await open();
    await tap('Add');
    await tap('Text');
    await act(async () => {
      fireEvent.click(within(screen.getByRole('toolbar', { name: 'Photo tools' })).getByRole('button', { name: 'More' }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole('list', { name: 'More' })).getByRole('button', { name: 'Delete' }));
    });
    expect(layers()).toHaveLength(0);
  });
});
