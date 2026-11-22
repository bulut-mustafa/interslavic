// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import type { RenderRequest } from '../src/photo/render.ts';
import { isText } from '../src/photo/doc.ts';
import type { Recognizer } from '../src/photo/ocr.ts';
import PhotoEditor from '../src/photo/PhotoEditor.tsx';
import { setRenderProbe } from '../src/photo/render-probe.ts';
import { guessLang, plainTranslateError } from '../src/phone/translate-lang.ts';
import { screen } from './live-screen.ts';
import { fakeContext } from './photo-canvas.ts';

const calls: RenderRequest[] = [];
const ctx = fakeContext();
let requests: { lines: string[]; lang: string; orthography: string }[] = [];
let reply: (lines: string[]) => Response | Promise<Response>;

beforeEach(() => {
  calls.length = 0;
  requests = [];
  reply = (lines) => new Response(JSON.stringify({ results: lines.map((t, i) => ({ text: `ISV ${t}`, flagged: i === 0 && /doubt/.test(t), reasons: [] })) }), { status: 200 });
  vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => {
    const b = JSON.parse(init.body);
    requests.push(b);
    return reply(b.lines);
  });
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
const texts = () => layers().filter(isText).map((l) => l.text);
const strip = () => screen.getByRole('toolbar', { name: 'Photo tools' });
const stripLabels = () => [...strip().querySelectorAll('.ph-strip-label')].map((n) => n.textContent);
const tap = async (name: string | RegExp, scope: { getByRole: typeof screen.getByRole } = screen) => {
  await act(async () => {
    fireEvent.click(scope.getByRole('button', { name }));
  });
};
async function open() {
  render(<PhotoEditor phone recognizer={ocr} store={null} />);
  fireEvent.change(await screen.findByLabelText('Photo'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
  await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Photo tools' })).toBeTruthy());
  await act(async () => {});
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
}
async function textWith(words: string) {
  await open();
  await tap('Add');
  await tap('Text');
  await tap('Edit');
  const box = (await screen.findByLabelText('Type on the picture')) as HTMLTextAreaElement;
  await act(async () => {
    fireEvent.change(box, { target: { value: words } });
  });
  await act(async () => {
    fireEvent.blur(box);
  });
}
const sheet = () => screen.getByRole('dialog', { name: 'Translate to Interslavic' });

describe('phone photo: Translate as a tool', () => {
  it('the strip offers Translate for a text, and not for a picture or a shape', async () => {
    await open();
    expect(stripLabels()).not.toContain('Translate');
    await tap('Add');
    await tap('Add rectangle');
    await tap('Done', within(screen.getByRole('dialog')));
    expect(stripLabels()).not.toContain('Translate');
    await tap('More', within(strip()));
    await tap('Deselect');
    await tap('Add');
    await tap('Text');
    expect(stripLabels()).toContain('Translate');
  });

  it('opens a sheet whose Translate button sends the chosen language and script, and changes the text', async () => {
    await textWith('Hello there');
    await tap('Translate', within(strip()));
    const s = within(sheet());
    expect(s.getByRole('radio', { name: 'English' }).getAttribute('aria-checked')).toBe('true');
    await act(async () => {
      fireEvent.click(s.getByRole('radio', { name: 'Ukrainian' }));
      fireEvent.click(s.getByRole('radio', { name: 'Cyrillic' }));
    });
    await tap('Translate', s);
    await waitFor(() => expect(texts()).toContain('ISV Hello there'));
    expect(requests.at(-1)).toMatchObject({ lines: ['Hello there'], lang: 'uk', orthography: 'cyrillic' });
  });

  it('defaults a hand-typed English text to English and translates again from the original', async () => {
    await textWith('Hello there');
    await tap('Translate', within(strip()));
    await tap('Translate', within(sheet()));
    await waitFor(() => expect(texts()).toContain('ISV Hello there'));
    expect(requests[0]!.lang).toBe('en');
    await tap('Translate', within(sheet()));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]!.lines).toEqual(['Hello there']);
  });

  it('Restore original brings the typed words back; a doubtful line is reported', async () => {
    await textWith('doubt me');
    await tap('Translate', within(strip()));
    await tap('Translate', within(sheet()));
    await waitFor(() => expect(texts()).toContain('ISV doubt me'));
    expect(within(sheet()).getByText(/1 may be wrong - read it before you save/)).toBeTruthy();
    await tap('Restore original', within(sheet()));
    await waitFor(() => expect(texts()).toContain('doubt me'));
    expect(within(sheet()).queryByRole('button', { name: 'Restore original' })).toBeNull();
  });

  it('says in plain words when the translator cannot be reached', async () => {
    await textWith('Hello there');
    reply = () => Promise.reject(new TypeError('Load failed'));
    await tap('Translate', within(strip()));
    await tap('Translate', within(sheet()));
    await waitFor(() => expect(within(sheet()).getByRole('alert').textContent).toMatch(/Could not reach the translator/));
    expect(texts()).toContain('Hello there');
  });

  it('the Text sheet offers Translate all text once the page has text', async () => {
    await textWith('Hello there');
    await tap('More', within(strip()));
    await tap('Deselect');
    expect(stripLabels()).not.toContain('Translate');
    await tap('Text', within(strip()));
    await tap('Translate all text');
    expect(sheet()).toBeTruthy();
    await tap('Translate', within(sheet()));
    await waitFor(() => expect(texts()).toContain('ISV Hello there'));
  });
});

describe('translate language helpers', () => {
  it('keeps the page language unless the characters clearly say otherwise', () => {
    expect(guessLang(['Hello'], 'en')).toBe('en');
    expect(guessLang(['Hello'], 'ru')).toBe('en');
    expect(guessLang(['Привет'], 'en')).toBe('ru');
    expect(guessLang(['Привіт, їжак'], 'ru')).toBe('uk');
    expect(guessLang(['Привет'], 'uk')).toBe('uk');
    expect(guessLang(['123'], 'ru')).toBe('ru');
  });
  it('words a dead network plainly and leaves other messages alone', () => {
    expect(plainTranslateError('Load failed')).toMatch(/Could not reach/);
    expect(plainTranslateError('the parser says no')).toBe('the parser says no');
  });
});
