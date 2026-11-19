// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import App from '../src/App.tsx';
import { screen } from './live-screen.ts';
import { notesTsv } from '../src/player/notes-anki.ts';
import type { TextAnalysis } from '../../lexicon/src/analyze.ts';

const ISV = '1\n00:00:01,000 --> 00:00:03,000\nOtec kupil knigaa.\n\n2\n00:00:04,000 --> 00:00:06,000\nHvala.\n';
const ORIG = '1\n00:00:01,000 --> 00:00:03,000\nFather bought a book.\n\n2\n00:00:04,000 --> 00:00:06,000\nThanks.\n';

const analysisFor = (text: string): TextAnalysis => ({
  tokens: text.split(/(\W+)/).filter(Boolean).map((t) =>
    /\w/.test(t)
      ? {
          kind: 'word' as const, text: t, script: 'latin' as const, normal: t.toLowerCase(), foreignLetters: false, totalReadings: 0, suggestions: t === 'knigaa' ? ['kniga'] : [],
          status: t === 'knigaa' ? ('unknown' as const) : ('known' as const),
          readings: t === 'knigaa' ? [] : [{ lemma: t.toLowerCase(), pos: 'n.', featSets: [], en: ['a word'], ru: [] }],
        }
      : { kind: 'gap' as const, text: t },
  ),
  words: text.split(/\W+/).filter(Boolean).length,
  notFound: text.includes('knigaa') ? 1 : 0,
});

let video: HTMLVideoElement;
const blobs: Blob[] = [];
const played = vi.fn();
const paused = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/studio/watch');
  blobs.length = 0;
  URL.createObjectURL = (b: Blob | MediaSource) => (blobs.push(b as Blob), 'blob:video');
  URL.revokeObjectURL = () => {};
  HTMLMediaElement.prototype.play = (() => (played(), Promise.resolve())) as never;
  HTMLMediaElement.prototype.pause = (() => paused()) as never;
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => ({ ok: true, status: 200, json: async () => analysisFor((JSON.parse(init.body) as { text: string }).text) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  played.mockClear();
  paused.mockClear();
});

async function open() {
  render(<App />);
  const file = (name: string, text = 'x', type = '') => new File([text], name, { type });
  // a video and both subtitle files, dropped together, in no particular order
  fireEvent.change(screen.getByLabelText('Video and subtitle files'), { target: { files: [file('en.srt', ORIG), file('film.mp4', 'x', 'video/mp4'), file('isv.srt', ISV)] } });
  await waitFor(() => expect(document.querySelector('video')).toBeTruthy());
  video = document.querySelector('video')!;
  let t = 0;
  Object.defineProperty(video, 'currentTime', { configurable: true, get: () => t, set: (v: number) => void (t = v) });
  Object.defineProperty(video, 'playbackRate', { configurable: true, writable: true, value: 1 });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30)); // the subtitle files are read
  });
}

const at = async (seconds: number) => {
  await act(async () => {
    video.currentTime = seconds;
    video.dispatchEvent(new Event('timeupdate'));
    await new Promise((r) => setTimeout(r, 10));
  });
};

describe('the Watch page', () => {
  it('is in the navigation', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Watch' }).getAttribute('aria-current')).toBe('page');
  });

  it('shows the subtitle for the moment in the video, with its original beneath', async () => {
    await open();
    await at(1.5);
    expect(screen.getByRole('button', { name: 'Otec' })).toBeTruthy();
    expect(screen.getByText('Father bought a book.')).toBeTruthy();
    await at(4.5);
    expect(screen.getByRole('button', { name: 'Hvala' })).toBeTruthy();
    expect(screen.getByText('Thanks.')).toBeTruthy();
  });

  it('pauses on a tapped word and shows what the dictionary says about it', async () => {
    await open();
    await at(1.5);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Otec' }));
    });
    expect(paused).toHaveBeenCalled();
    expect(screen.getByLabelText('About Otec')).toBeTruthy();
    expect(screen.getByText('a word')).toBeTruthy();
  });

  it('marks a word that is not found, and lists nearest forms without a replace button', async () => {
    await open();
    await at(1.5);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'knigaa' }));
    });
    const card = screen.getByLabelText('About knigaa');
    expect(card.textContent).toContain('Not found among the dictionary’s forms');
    expect(card.textContent).toContain('kniga');
    expect(card.querySelectorAll('button')).toHaveLength(0);
  });

  it('jumps to the next subtitle and plays', async () => {
    await open();
    await at(1.5);
    fireEvent.click(screen.getByRole('button', { name: 'Next line' }));
    expect(video.currentTime).toBe(4);
    expect(played).toHaveBeenCalled();
  });

  it('repeats a line: when the video runs past its end, it goes back to its start', async () => {
    await open();
    await at(1.5);
    fireEvent.click(screen.getByRole('button', { name: 'Repeat this line' }));
    expect(screen.getByRole('button', { name: 'Stop repeating' })).toBeTruthy();
    await at(3.05);
    expect(video.currentTime).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Stop repeating' }));
    await at(3.05);
    expect(video.currentTime).toBe(3.05);
  });

  it('changes the playback speed', async () => {
    await open();
    await at(1.5);
    fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '0.5' } });
    expect(video.playbackRate).toBe(0.5);
  });

  it('saves a sentence with where it came from, and exports exactly what the exporter writes', async () => {
    await open();
    await at(1.5);
    fireEvent.click(screen.getByRole('button', { name: 'Save sentence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save sentence' })); // twice: still one note
    expect(screen.getByText('Saved sentences (1)')).toBeTruthy();
    const saved = JSON.parse(window.localStorage.getItem('interslavic-notes-v1')!);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ isv: 'Otec kupil knigaa.', original: 'Father bought a book.', video: 'film.mp4', at: 1 });

    let name = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download for Anki: Interslavic first' }));
    expect(name).toBe('interslavic-video-sentences-anki.txt');
    const text = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsText(blobs.at(-1)!);
    });
    expect(text).toBe(notesTsv(saved, 'isv-en'));
  });

  it('starts with a single place to drop a video and its subtitles together', () => {
    render(<App />);
    expect(screen.getAllByLabelText('Video and subtitle files')).toHaveLength(1);
    expect(document.querySelector('video')).toBeNull();
  });

  it('works out which subtitle file is the Interslavic and which the original, and can swap them', async () => {
    await open();
    expect(screen.getByTitle('Interslavic subtitles').textContent).toContain('isv.srt');
    await at(1.5);
    expect(screen.getByText('Father bought a book.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Swap the Interslavic and original subtitles/ }));
    expect(screen.getByTitle('Interslavic subtitles').textContent).toContain('en.srt');
  });

  it('takes the files one at a time too, with the video before or after its subtitles', async () => {
    render(<App />);
    const add = async (f: File) => {
      await act(async () => {
        fireEvent.change(screen.getAllByLabelText('Video and subtitle files')[0]!, { target: { files: [f] } });
        await new Promise((r) => setTimeout(r, 30));
      });
    };
    await add(new File([ISV], 'isv.srt'));
    expect(screen.getByText(/Add the video/)).toBeTruthy();
    await add(new File(['x'], 'film.mp4', { type: 'video/mp4' }));
    expect(document.querySelector('video')).toBeTruthy();
  });
});
