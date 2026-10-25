// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App.tsx';

/** The Learn section, through the page as a learner uses it. */

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/learn/introduction');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a lesson page', () => {
  it('opens from its own address, with the lesson marked in the list', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Introduction' })).toBeTruthy();
    const current = screen.getAllByRole('link', { name: /Introduction/ }).find((a) => a.getAttribute('aria-current') === 'page');
    expect(current).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Learn' }).getAttribute('aria-current')).toBe('page');
  });

  it('/learn opens the first lesson', () => {
    window.history.replaceState({}, '', '/learn');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Introduction' })).toBeTruthy();
  });

  it('shows every example in Cyrillic too', () => {
    const { container } = render(<App />);
    const latin = [...container.querySelectorAll('.example-isv')].map((p) => p.textContent);
    const cyrillic = [...container.querySelectorAll('.example-cyr')].map((p) => p.textContent);
    expect(latin).toContain('Dobry denj!');
    expect(cyrillic).toContain('Добры дењ!');
  });

  it('links an example to the translator with its sentence', () => {
    render(<App />);
    const link = screen.getAllByRole('link', { name: 'Try it in the translator' })[0]!;
    expect(link.getAttribute('href')).toBe('/?lang=en&text=Interslavic%20is%20my%20new%20obsession.');
  });

  it('marks a wrong answer, shows the right one, and remembers it', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Only Latin' }));
    });
    expect(screen.getByRole('status').textContent).toMatch(/Not quite - it is Both, equally/);
    cleanup();
    render(<App />);
    expect(screen.getByText('You missed this one last time.')).toBeTruthy();
  });

  it('remembers a finished lesson in the list', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('I have finished this lesson'));
    });
    cleanup();
    render(<App />);
    expect((screen.getByLabelText('I have finished this lesson') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText('done')).toBeTruthy();
  });

  it('sends a report about the page', async () => {
    const calls = (fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls;
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
    });
    fireEvent.change(screen.getByLabelText('What is wrong?'), { target: { value: 'typo in the history' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    });
    const body = JSON.parse(calls.find(([url]) => url.endsWith('/api/feedback'))![1].body);
    expect(body).toMatchObject({ lang: 'lesson', source: '/learn/introduction', comment: 'typo in the history' });
  });

  it('says so when there is no such lesson', () => {
    window.history.replaceState({}, '', '/learn/no-such-page');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
  });
});

describe('the phrasebook', () => {
  it('lists phrases with their Cyrillic and their source', () => {
    window.history.replaceState({}, '', '/phrasebook');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Phrasebook' })).toBeTruthy();
    expect(screen.getByText('Do viděnja!')).toBeTruthy();
    expect(screen.getByText('До видєња!')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Tatoeba 12977828' }).length).toBe(1);
  });

  it('flips a flashcard and moves to the next one', async () => {
    window.history.replaceState({}, '', '/phrasebook');
    const { container } = render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
    });
    const first = container.querySelector('.card-isv')!.textContent;
    expect(screen.getByText('Tap to see the meaning')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show the meaning' }));
    });
    expect(screen.queryByText('Tap to see the meaning')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next ›' }));
    });
    expect(container.querySelector('.card-isv')!.textContent).not.toBe(first);
    expect(screen.getByText('Tap to see the meaning')).toBeTruthy();
  });
});
