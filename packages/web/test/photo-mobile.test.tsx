// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PhotoEditor from '../src/photo/PhotoEditor.tsx';
import type { Recognizer } from '../src/photo/ocr.ts';
import { screen } from './live-screen.ts';
import { fakeContext } from './photo-canvas.ts';

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

const ocr: Recognizer = {
  recognize: async (_b, _l, onProgress) => {
    onProgress(1, 'done');
    return { text: 'Hello world', confidence: 90, lines: [{ text: 'Hello world', confidence: 90, bbox: { x0: 50, y0: 50, x1: 450, y1: 110 } }] };
  },
};

async function open() {
  render(<PhotoEditor recognizer={ocr} />);
  fireEvent.change(screen.getByLabelText('Photo'), { target: { files: [new File(['x'], 'sign.png', { type: 'image/png' })] } });
  await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Photo tools' })).toBeTruthy());
  await act(async () => {});
}
const pane = () => document.querySelector('.photo-page:not([hidden])') as HTMLElement;
const bar = () => pane().querySelector('[aria-label="Selection actions"]') as HTMLElement;
const btn = (name: string) => [...bar().querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name || b.textContent?.trim() === name) as HTMLButtonElement;

describe('photo editor on touch', () => {
  it('has a visible control for every keyboard-only action', async () => {
    await open();
    for (const n of ['Select all', 'Deselect', 'Duplicate selection', 'Delete selection', 'Nudge left', 'Nudge up', 'Nudge down', 'Nudge right']) expect(btn(n), n).toBeTruthy();
    expect(btn('Delete selection').disabled).toBe(true);
  });

  it('Select all picks the found words and Deselect clears them', async () => {
    await open();
    await act(async () => fireEvent.click(btn('Select all')));
    expect(pane().querySelectorAll('.live-band').length).toBeGreaterThan(0);
    expect(btn('Deselect').disabled).toBe(false);
    await act(async () => fireEvent.click(btn('Deselect')));
    expect(pane().querySelectorAll('.live-band').length).toBe(0);
  });

  it('a tap with a finger on found text picks the word, with no drag', async () => {
    await open();
    const line = pane().querySelector('.live-line') as HTMLElement;
    const ev = (type: string) => { const e = new MouseEvent(type, { clientX: 100, clientY: 80, bubbles: true }); Object.defineProperty(e, 'pointerType', { value: 'touch' }); line.dispatchEvent(e); };
    ev('pointerdown');
    await act(async () => { fireEvent.click(line, { clientX: 100, clientY: 80, detail: 1 }); });
    expect(pane().querySelectorAll('.live-band').length).toBeGreaterThan(0);
  });

  it('zoom buttons step the picture size and Fit returns', async () => {
    await open();
    const zoomIn = pane().querySelector('[aria-label="Zoom in"]') as HTMLButtonElement;
    await act(async () => fireEvent.click(zoomIn));
    expect(pane().querySelector('.canvas-scroll.is-zoomed')).toBeTruthy();
    await act(async () => fireEvent.click(pane().querySelector('[aria-label="Fit the picture to the screen"]')!));
    expect(pane().querySelector('.canvas-scroll.is-zoomed')).toBeNull();
  });
});

describe('mobile-photo.css', () => {
  const css = readFileSync(resolve(__dirname, '../src/photo/mobile-photo.css'), 'utf8');
  it('gives handles a 44px hit area on coarse pointers and keeps the crop sheet actions sticky', () => {
    expect(css).toMatch(/any-pointer: coarse[\s\S]*\.tbox-h[\s\S]*width: 44px/);
    expect(css).toMatch(/crop-row:last-child[\s\S]*position: sticky/);
  });
});
