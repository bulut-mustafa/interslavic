// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { bare, SLAVIC_LANGUAGES, WordLookup } from '../src/editor/WordLookup.tsx';
import { SLAVIC_COLUMNS } from '../../lexicon/src/cognates.ts';
import { screen } from './live-screen.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SLAVIC_LANGUAGES', () => {
  it('names exactly the languages the dictionary has columns for', () => {
    expect(SLAVIC_LANGUAGES.map((l) => l.code).sort()).toEqual([...SLAVIC_COLUMNS].sort());
  });
});

describe('bare', () => {
  it('drops the dictionary\'s note in brackets', () => {
    expect(bare('chlapec (hovor.)')).toBe('chlapec');
    expect(bare('kluk')).toBe('kluk');
  });
});

const entry = { isv: 'hlåpėc', pos: 'm.', en: 'boy', languages: { cs: { words: ['chlapec', 'kluk (hovor.)'], unconfirmed: false }, pl: { words: ['chłopiec'], unconfirmed: true } } };

async function search(text: string) {
  render(<WordLookup onInsert={onInsert} />);
  fireEvent.click(screen.getByText('Other Slavic languages'));
  fireEvent.change(screen.getByLabelText('Word'), { target: { value: text } });
  await waitFor(() => expect(fetch).toHaveBeenCalled(), { timeout: 2000 });
}
const onInsert = vi.fn();

describe('WordLookup', () => {
  it('says it does not translate, and shows the dictionary\'s words by language', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ entries: [entry] }) })));
    await search('boy');
    await waitFor(() => expect(screen.getByText('chlapec')).toBeTruthy());
    expect(document.body.textContent).toContain('translator writes Interslavic only');
    expect(screen.getByText('Czech')).toBeTruthy();
    expect(screen.getByText('Polish')).toBeTruthy();
  });

  it('asks for the word the user typed, encoded', async () => {
    const f = vi.fn(async () => ({ json: async () => ({ entries: [] }) }));
    vi.stubGlobal('fetch', f);
    await search('good day');
    expect(f).toHaveBeenCalledWith('/api/lookup?q=good%20day');
  });

  it('inserts the tapped word without its note, and marks an unconfirmed one', async () => {
    onInsert.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ entries: [entry] }) })));
    await search('boy');
    await waitFor(() => expect(screen.getByText('kluk (hovor.)')).toBeTruthy());
    fireEvent.click(screen.getByText('kluk (hovor.)'));
    expect(onInsert).toHaveBeenCalledWith('kluk');
    expect(screen.getByText('chłopiec').getAttribute('title')).toContain('unconfirmed');
  });

  it('says plainly when nothing was found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ entries: [] }) })));
    await search('qzxwv');
    await waitFor(() => expect(screen.getByText('Nothing found for that word.')).toBeTruthy());
  });

  it('says so when the dictionary does not answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    render(<WordLookup onInsert={onInsert} />);
    fireEvent.click(screen.getByText('Other Slavic languages'));
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Word'), { target: { value: 'boy' } });
      await new Promise((r) => setTimeout(r, 400));
    });
    await waitFor(() => expect(screen.getByText(/not answering/)).toBeTruthy());
  });

  it('does not ask for fewer than two letters', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    render(<WordLookup onInsert={onInsert} />);
    fireEvent.change(screen.getByLabelText('Word'), { target: { value: 'a' } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(f).not.toHaveBeenCalled();
  });
});
