// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import App from '../src/App.tsx';
import { screen } from './live-screen.ts';
import { ankiTsv } from '../src/learn/anki.ts';
import { PHRASEBOOK } from '../src/learn/phrasebook.ts';

const blobs: Blob[] = [];
let downloadName = '';

beforeEach(() => {
  window.history.replaceState({}, '', '/phrasebook');
  blobs.length = 0;
  downloadName = '';
  URL.createObjectURL = (b: Blob | MediaSource) => (blobs.push(b as Blob), 'blob:test');
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloadName = this.download;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const read = (b: Blob): Promise<string> =>
  new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });

describe('the phrasebook Anki export', () => {
  it('downloads exactly the file the exporter writes, in the chosen direction', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Card shows'), { target: { value: 'en-isv' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download for Anki' }));
    expect(downloadName).toBe('interslavic-phrasebook-anki.txt');
    expect(blobs).toHaveLength(1);
    expect(await read(blobs[0]!)).toBe(ankiTsv(PHRASEBOOK, 'en-isv'));
  });
});
