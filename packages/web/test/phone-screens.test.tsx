// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import App from '../src/App.tsx';
import Translator from '../src/pages/Translator.tsx';
import { LESSONS } from '../src/learn/lessons.ts';
import { PHRASEBOOK } from '../src/learn/phrasebook.ts';
import { TOOLS } from '../src/studio/tools.tsx';
import { putHandoff } from '../src/subtitles/handoff.ts';
import type { Translation } from '../../engine/src/pipeline.ts';
import type { TextAnalysis } from '../../lexicon/src/analyze.ts';
import { installMatchMedia } from './phone-media.ts';
import { screen } from './live-screen.ts';

let mm: ReturnType<typeof installMatchMedia> | undefined;
const phone = () => (mm = installMatchMedia(24));
const go = (path: string) => window.history.replaceState({}, '', path);
const menu = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  });
};

const sentence = (): Translation =>
  ({
    source: 'The woman read a book.',
    lang: 'en',
    text: 'Žena čitala knigu.',
    validationRate: 1,
    citations: {},
    dropped: [],
    unknown: [],
    words: ['Žena', 'čitala', 'knigu'].map((surface) => ({
      surface: surface.toLowerCase(),
      lemma: surface.toLowerCase(),
      sourceForm: 'x',
      pos: 'n.',
      validation: 'validated',
      notes: [],
      features: [],
    })),
  }) as unknown as Translation;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ sentences: [sentence()] }) })));
});
afterEach(() => {
  cleanup();
  mm?.uninstall();
  mm = undefined;
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('ph-locked');
});

describe('Translator on a phone', () => {
  it('has a big input, a language bar and a sticky Translate button that asks for the translation', async () => {
    phone();
    go('/');
    render(<App />);
    expect(document.querySelector('.langbar')).toBeNull();
    const box = screen.getByLabelText('Text to translate') as HTMLTextAreaElement;
    const button = screen.getByRole('button', { name: 'Translate' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.closest('.ph-sticky')).toBeTruthy();
    // The language bar: English from-dropdown, an arrow, Interslavic with its script dropdown.
    expect((screen.getByLabelText('Translate from') as HTMLSelectElement).value).toBe('en');
    expect((screen.getByLabelText('Script') as HTMLSelectElement).value).toBe('standard');
    expect(screen.getByRole('group', { name: 'Language and script' }).textContent).toContain('Interslavic');
    expect([...(screen.getByLabelText('Translate from') as HTMLSelectElement).options].map((o) => o.text)).toEqual(['English', 'Russian', 'Ukrainian']);
    expect([...(screen.getByLabelText('Script') as HTMLSelectElement).options].map((o) => o.text)).toEqual(['Latin', 'Etymological', 'Simplified', 'Cyrillic']);
    fireEvent.change(box, { target: { value: 'The woman read a book.' } });
    await new Promise((r) => setTimeout(r, 600));
    expect(fetch).not.toHaveBeenCalled(); // typing alone does not translate on a phone
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(document.querySelector('.pt-card')).toBeTruthy());
    expect(document.querySelector('.pt-out')?.textContent).toBe('Žena čitala knigu.');
    expect(screen.getByRole('button', { name: 'Copy translation' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
    expect(document.querySelector('.output-word')?.getAttribute('title')).toBeNull(); // no hover tooltips
  });

  it('opens a tapped word as a sheet, and steps through the words there', async () => {
    phone();
    go('/?text=The%20woman%20read%20a%20book.');
    render(<App />);
    await waitFor(() => expect(document.querySelector('.pt-card')).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'čitala' }));
    const dialog = await waitFor(() => screen.getByRole('dialog', { name: 'čitala' }));
    expect(dialog.textContent).toContain('2 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Next word' }));
    await waitFor(() => expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('knigu'));
  });

  it('keeps Report a problem and Copy link in the top-bar menu', async () => {
    phone();
    go('/?text=The%20woman%20read%20a%20book.');
    render(<App />);
    await waitFor(() => expect(document.querySelector('.pt-card')).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByRole('button', { name: 'Report a problem' })).toBeNull();
    await menu();
    expect(screen.getByRole('button', { name: /Copy link/ })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Report a problem/ }));
    });
    expect(await waitFor(() => screen.getByRole('dialog', { name: 'Report a problem' }))).toBeTruthy();
  });

  it('stays the desktop page on the server, whatever the screen', () => {
    phone();
    const html = renderToString(<Translator />);
    expect(html).toContain('tagline');
    expect(html).not.toContain('ph-primary');
  });
});

describe('Learn on a phone', () => {
  it('lists the lessons as cards, and a lesson has a sticky previous/next bar with progress', async () => {
    phone();
    go('/learn');
    render(<App />);
    const cards = document.querySelectorAll('.ph-lesson-card');
    expect(cards.length).toBe(LESSONS.length);
    expect(document.querySelector('.learn-nav')).toBeNull();
    await act(async () => {
      fireEvent.click(cards[0]!);
    });
    expect(window.location.pathname).toBe(`/learn/${LESSONS[0]!.slug}`);
    expect(screen.getByText(`Lesson 1 of ${LESSONS.length}`)).toBeTruthy();
    expect(document.querySelector('.ph-lesson-nav')?.className).toContain('ph-sticky');
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: new RegExp(`^Next: ${LESSONS[1]!.title}`) }));
    });
    expect(window.location.pathname).toBe(`/learn/${LESSONS[1]!.slug}`);
    expect(screen.getByText(`Lesson 2 of ${LESSONS.length}`)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: /^Previous:/ }));
    });
    expect(window.location.pathname).toBe(`/learn/${LESSONS[0]!.slug}`);
  });

  it('scrolls a table inside its own card with an edge fade, not the page', () => {
    phone();
    go('/learn/cases');
    render(<App />);
    const card = document.querySelector('.ph-scrollcard');
    expect(card).toBeTruthy();
    expect(card!.querySelector('table')).toBeTruthy();
    expect(card!.hasAttribute('data-more-right')).toBe(true);
  });

  it('moves Report a problem into the menu', async () => {
    phone();
    go('/learn/cases');
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Report a problem' })).toBeNull();
    await menu();
    expect(screen.getByRole('button', { name: /Report a problem/ })).toBeTruthy();
  });

  it('keeps the desktop lesson page on a wide screen', () => {
    mm = installMatchMedia(80);
    go('/learn/cases');
    render(<App />);
    expect(document.querySelector('.learn-nav')).toBeTruthy();
    expect(document.querySelector('.ph-scrollcard')).toBeNull();
  });
});

describe('Phrasebook on a phone', () => {
  it('has a search field, topic chips and tappable phrase cards that open a sheet', async () => {
    phone();
    go('/phrasebook');
    render(<App />);
    const search = screen.getByLabelText('Search phrases') as HTMLInputElement;
    expect(search.closest('.ph-search')).toBeTruthy();
    const first = PHRASEBOOK[0]!.phrases[0]!;
    fireEvent.change(search, { target: { value: first.en.slice(0, 8) } });
    const card = await waitFor(() => screen.getByRole('button', { name: `${first.isv}: ${first.en}` }));
    fireEvent.click(card);
    const dialog = await waitFor(() => screen.getByRole('dialog', { name: 'Phrase' }));
    expect(dialog.textContent).toContain(first.isv);
    expect(screen.getByRole('button', { name: /Save to Anki/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Copy/ })).toBeTruthy();
  });

  it('chooses a topic with the chips, and puts the Anki export in the menu', async () => {
    phone();
    go('/phrasebook');
    render(<App />);
    const all = document.querySelectorAll('.ph-phrase').length;
    fireEvent.click(screen.getByRole('button', { name: PHRASEBOOK[1]!.title }));
    expect(document.querySelectorAll('.ph-phrase').length).toBe(PHRASEBOOK[1]!.phrases.length);
    expect(all).toBeGreaterThan(PHRASEBOOK[1]!.phrases.length);
    expect(document.querySelector('.anki-export')).toBeNull();
    await menu();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Export all for Anki/ }));
    });
    expect(await waitFor(() => screen.getByRole('button', { name: 'Download for Anki' }))).toBeTruthy();
  });
});

describe('Subtitles on a phone', () => {
  const SRT = '1\n00:00:01,000 --> 00:00:03,000\nHello there.\n\n2\n00:00:04,000 --> 00:00:06,000\nThanks.\n';
  it('lists the rows, edits one in a sheet, and has Translate all as the primary', async () => {
    phone();
    go('/studio/subtitles');
    putHandoff({ srt: SRT, lang: 'en', name: 'film.srt' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: { body: string }) => ({
        ok: true,
        status: 200,
        json: async () => ({ results: (JSON.parse(init.body) as { lines: string[] }).lines.map((l) => ({ text: `ISV ${l}`, flagged: l === 'Thanks.', reasons: ['unsure'] })) }),
      })),
    );
    render(<App />);
    const row = await waitFor(() => screen.getByRole('button', { name: 'Edit subtitle 2' }), { timeout: 3000 });
    expect(row.className).toContain('is-flagged');
    expect(screen.getByRole('button', { name: /Translate all/ }).closest('.ph-tool-bar')).toBeTruthy();
    fireEvent.click(row);
    const area = await waitFor(() => screen.getByLabelText('Interslavic for subtitle 2') as HTMLTextAreaElement);
    fireEvent.change(area, { target: { value: 'Hvala.' } });
    expect(screen.getByRole('button', { name: 'Edit subtitle 2' }).textContent).toContain('Hvala.');
    fireEvent.click(screen.getByRole('button', { name: 'Previous subtitle' }));
    await waitFor(() => expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Subtitle 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import and export' }));
    expect(await waitFor(() => screen.getByRole('button', { name: /Download .srt/ }))).toBeTruthy();
  });
});

describe('Worksheets on a phone', () => {
  it('fills the screen with the paper, with Edit and Print as the actions', async () => {
    phone();
    go('/studio/worksheets');
    window.print = vi.fn();
    render(<App />);
    expect(screen.getByLabelText('Worksheet preview')).toBeTruthy();
    expect(document.querySelector('.worksheet-picks')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Print or save PDF/ }));
    expect(window.print).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    const dialog = await waitFor(() => screen.getByRole('dialog', { name: 'Edit worksheet' }));
    expect(dialog.querySelector('[aria-label="Move question 2 later"]') ?? dialog.querySelector('[aria-label="Move question 1 later"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sheet settings/ }));
    fireEvent.change(screen.getByLabelText('Worksheet title'), { target: { value: 'Quiz' } });
    expect(screen.getByLabelText('Worksheet preview').querySelector('h2')?.textContent).toBe('Quiz');
  });
});

describe('Watch on a phone', () => {
  const ISV = '1\n00:00:01,000 --> 00:00:03,000\nOtec kupil knigu.\n';
  const analysis = (text: string): TextAnalysis => ({
    tokens: text.split(/(\W+)/).filter(Boolean).map((t) =>
      /\w/.test(t)
        ? { kind: 'word' as const, text: t, script: 'latin' as const, normal: t.toLowerCase(), foreignLetters: false, totalReadings: 1, suggestions: [], status: 'known' as const, readings: [{ lemma: t.toLowerCase(), pos: 'n.', featSets: [], en: ['a word'], ru: [] }] }
        : { kind: 'gap' as const, text: t },
    ),
    words: 3,
    notFound: 0,
  });
  it('keeps the video on top, a sticky control bar, and opens a tapped word as a sheet', async () => {
    phone();
    go('/studio/watch');
    URL.createObjectURL = () => 'blob:v';
    URL.revokeObjectURL = () => {};
    HTMLMediaElement.prototype.pause = (() => undefined) as never;
    HTMLMediaElement.prototype.play = (() => Promise.resolve()) as never;
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => ({ ok: true, status: 200, json: async () => analysis((JSON.parse(init.body) as { text: string }).text) })));
    render(<App />);
    fireEvent.change(screen.getByLabelText('Video and subtitle files'), { target: { files: [new File(['x'], 'film.mp4', { type: 'video/mp4' }), new File([ISV], 'isv.srt')] } });
    await waitFor(() => expect(document.querySelector('.ph-watch-video video')).toBeTruthy());
    const video = document.querySelector('video')!;
    let t = 0;
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => t, set: (v: number) => void (t = v) });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    act(() => {
      t = 1.5;
      video.dispatchEvent(new Event('seeked'));
    });
    const word = await waitFor(() => screen.getByRole('button', { name: 'kupil' }));
    expect(screen.getByRole('toolbar', { name: 'Watch controls' })).toBeTruthy();
    fireEvent.click(word);
    expect(await waitFor(() => screen.getByRole('dialog', { name: 'kupil' }))).toBeTruthy();
  });
});

describe('Recording on a phone', () => {
  it('is one big button to choose a recording, then Transcribe is the primary', async () => {
    phone();
    go('/studio/recording');
    URL.createObjectURL = () => 'blob:a';
    URL.revokeObjectURL = () => {};
    render(<App />);
    expect(document.querySelector('.ph-rec-big')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Audio or video file'), { target: { files: [new File(['x'], 'talk.mp3', { type: 'audio/mpeg' })] } });
    const primary = await waitFor(() => screen.getByRole('button', { name: /Transcribe/ }));
    expect(primary.className).toContain('ph-primary');
    expect(screen.getByRole('button', { name: 'Ukrainian' })).toBeTruthy();
  });
});

describe('Studio home on a phone', () => {
  it('groups the tools into cards with one-line purposes, and shows an empty state for uploads', () => {
    phone();
    go('/studio');
    render(<App />);
    for (const t of TOOLS) expect(screen.getByRole('link', { name: `Open ${t.label}` })).toBeTruthy();
    expect(document.querySelectorAll('.ph-tool-group').length).toBeGreaterThan(1);
    expect(document.querySelector('.ph-card-purpose')?.textContent?.length).toBeLessThan(50);
    expect(document.querySelector('.ph-empty')).toBeTruthy();
  });
});
