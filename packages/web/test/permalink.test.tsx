// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import App from '../src/App.tsx';
import { permalink } from '../src/permalink.ts';
import { screen } from './live-screen.ts';

const written: string[] = [];

beforeEach(() => {
  written.length = 0;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t: string) => void written.push(t) },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes('/api/analyze')
          ? { tokens: [{ kind: 'gap', text: 'x' }], words: 0, notFound: 0 }
          : { sentences: [{ source: 's', lang: 'ru', text: 'Dobry denj.', validationRate: 1, words: [], dropped: [], unknown: [], citations: {} }] },
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('permalink', () => {
  it('puts the parameters in the address, encoded, and leaves out empty ones', () => {
    const url = new URL(permalink('/', { lang: 'ru', script: '', text: 'Привет, мир & Ко' }));
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('text')).toBe('Привет, мир & Ко');
    expect(url.searchParams.get('lang')).toBe('ru');
    expect(url.searchParams.has('script')).toBe(false);
  });
});

describe('sharing a translation', () => {
  it('opens a shared link with its text, language and script, and copies the same link back', async () => {
    window.history.replaceState({}, '', '/?lang=ru&script=cyrillic&text=%D0%94%D0%BE%D0%B1%D1%80%D1%8B%D0%B9%20%D0%B4%D0%B5%D0%BD%D1%8C');
    render(<App />);
    expect((screen.getByLabelText('Text to translate') as HTMLTextAreaElement).value).toBe('Добрый день');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await act(async () => {});
    const link = new URL(written[0]!);
    expect(link.pathname).toBe('/');
    expect(link.searchParams.get('lang')).toBe('ru');
    expect(link.searchParams.get('script')).toBe('cyrillic');
    expect(link.searchParams.get('text')).toBe('Добрый день');
  });
});
