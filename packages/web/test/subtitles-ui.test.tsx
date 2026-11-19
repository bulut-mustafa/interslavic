// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import App from '../src/App.tsx';
import { screen } from './live-screen.ts';
import { buildSrt } from '../src/subtitles/translate.ts';
import { parseSrt } from '../src/subtitles/srt.ts';

const SRT = '1\n00:00:01,000 --> 00:00:02,000\nHello there.\n\n2\n00:00:03,000 --> 00:00:04,000\nBreak a leg!\n';
const blobs: Blob[] = [];
let downloadName = '';
const requests: { lang: string; lines: string[] }[] = [];

beforeEach(() => {
  window.history.replaceState({}, '', '/studio/subtitles');
  blobs.length = 0;
  requests.length = 0;
  URL.createObjectURL = (b: Blob | MediaSource) => (blobs.push(b as Blob), 'blob:test');
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloadName = this.download;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_u: string, init: { body: string }) => {
      const { lines, lang } = JSON.parse(init.body) as { lines: string[]; lang: string };
      requests.push({ lang, lines });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: lines.map((l) => ({
            text: `ISV(${l})`,
            flagged: l.startsWith('Break'),
            reasons: l.startsWith('Break') ? ['an English idiom'] : [],
          })),
        }),
      };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const read = (b: Blob): Promise<string> =>
  new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });

const file = (text: string, name = 'subtitles.srt') => new File([text], name, { type: 'application/x-subrip' });

/** Opens a subtitle file, the way a person would, and waits for the translation that starts by itself. */
async function open(text: string, name?: string) {
  render(<App />);
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Subtitle file (.srt)'), { target: { files: [file(text, name)] } });
  });
  await screen.findByText(/subtitles translated\./);
}

const box = (n: number) => screen.getByLabelText(`Interslavic for subtitle ${n}`) as HTMLTextAreaElement;

describe('the Subtitles page', () => {
  it('is in the navigation, and starts with a place to open a file and a way to paste', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Subtitles' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByLabelText('Subtitle file (.srt)')).toBeTruthy();
    expect(screen.getByLabelText('or paste it here')).toBeTruthy();
  });

  it('translates a file as soon as it is opened, with no button to press', async () => {
    await open(SRT);
    expect(screen.getByText(/2 subtitles found\./)).toBeTruthy();
    expect(box(1).value).toBe('ISV(Hello there.)');
    expect(screen.queryByRole('button', { name: 'Translate' })).toBeNull();
  });

  it('works out the language from the file, so the person does not have to say', async () => {
    await open('1\n00:00:01,000 --> 00:00:02,000\nДобро пожаловать в наш магазин.\n');
    expect(requests[0]!.lang).toBe('ru');
    expect((screen.getByLabelText('Translate from') as HTMLSelectElement).value).toBe('ru');
  });

  it('translates pasted text too, once the pasting has paused', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('or paste it here'), { target: { value: SRT } });
    expect(requests).toHaveLength(0); // not on every keystroke
    await screen.findByText(/subtitles translated\./, undefined, { timeout: 4000 });
    expect(box(2).value).toBe('ISV(Break a leg!)');
  });

  it('says so, instead of translating nothing, when the text is not subtitles', async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('or paste it here'), { target: { value: 'just some words' } });
    expect(screen.getByRole('alert').textContent).toContain('No subtitles found');
    await new Promise((r) => setTimeout(r, 900));
    expect(requests).toHaveLength(0);
  });

  it('marks the subtitle to check with its reason, and clears the mark when it is marked as checked', async () => {
    await open(SRT);
    expect(screen.getByText(/1 to check\./)).toBeTruthy();
    const row = screen.getByText('an English idiom').closest('[role="row"]') as HTMLElement;
    expect(row.className).toContain('is-flagged');
    fireEvent.click(screen.getByRole('button', { name: 'Mark subtitle 2 as checked' }));
    expect(screen.getByText(/None needs a second look/)).toBeTruthy();
    expect(row.className).not.toContain('is-flagged');
  });

  it('lets a translated line be corrected where it stands, which counts as looking at it, and downloads the corrected file', async () => {
    await open(SRT);
    fireEvent.change(box(2), { target: { value: 'Srečno!' } });
    expect(screen.getByText(/None needs a second look/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download .srt' }));
    expect(downloadName).toBe('subtitles.isv.srt');
    const out = await read(blobs[0]!);
    expect(out).toBe(
      buildSrt(
        parseSrt(SRT),
        [
          { lines: ['ISV(Hello there.)'], flagged: false, reasons: [] },
          { lines: ['Srečno!'], flagged: false, reasons: [] },
        ],
        'isv',
      ),
    );
  });

  it('shows only the subtitles to check when asked', async () => {
    await open(SRT);
    fireEvent.click(screen.getByLabelText('Show only the ones to check'));
    expect(screen.queryByLabelText('Interslavic for subtitle 1')).toBeNull();
    expect(box(2)).toBeTruthy();
  });

  it('translates again when the script is changed, but asks first if lines were corrected', async () => {
    await open(SRT);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Script'), { target: { value: 'cyrillic' } });
    });
    await waitFor(() => expect(requests).toHaveLength(2)); // nothing to lose: translated again by itself
    fireEvent.change(box(1), { target: { value: 'my own words' } });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Script'), { target: { value: 'simplified' } });
    });
    expect(screen.getByText(/would replace them/)).toBeTruthy();
    expect(requests).toHaveLength(2); // held back
    expect(box(1).value).toBe('my own words');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Translate again' }));
    });
    await waitFor(() => expect(box(1).value).toBe('ISV(Hello there.)'));
  });

  it('shows the translator\'s failure and no file when it stops, and can try again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 413, json: async () => ({ error: 'parser down' }) })));
    render(<App />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Subtitle file (.srt)'), { target: { files: [file(SRT)] } });
    });
    await screen.findByText('parser down');
    expect(screen.queryByRole('button', { name: 'Download .srt' })?.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
