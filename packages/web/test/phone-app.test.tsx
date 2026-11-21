// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import App from '../src/App.tsx';
import { TOOLS } from '../src/studio/tools.tsx';
import { installMatchMedia } from './phone-media.ts';
import { screen } from './live-screen.ts';

let mm: ReturnType<typeof installMatchMedia> | undefined;
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, parser: true }) })));
});
afterEach(() => {
  cleanup();
  mm?.uninstall();
  mm = undefined;
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('ph-locked');
});

describe('the phone shell', () => {
  it('renders the four tabs and a top bar with a menu, and locks the page scroll', () => {
    mm = installMatchMedia(24);
    window.history.replaceState({}, '', '/phrasebook');
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Site' });
    expect(nav.className).toBe('ph-tabbar');
    for (const name of ['Translate', 'Learn', 'Phrasebook', 'Studio']) expect(screen.getByRole('link', { name: new RegExp(name) })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Phrasebook/ }).getAttribute('aria-current')).toBe('page');
    expect(document.querySelector('.shell')).toBeNull();
    expect(document.documentElement.classList.contains('ph-locked')).toBe(true);
    expect(document.querySelector('.ph-content')).toBeTruthy();
  });

  it('puts the footer in the menu sheet', async () => {
    mm = installMatchMedia(24);
    window.history.replaceState({}, '', '/phrasebook');
    render(<App />);
    expect(document.querySelector('.site-footer')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    });
    expect(screen.getByRole('dialog', { name: /About|Menu/ }).textContent).toContain('Made with love');
  });

  it('shows the Studio home: a card per tool, no left rail, an uploads row', () => {
    mm = installMatchMedia(24);
    window.history.replaceState({}, '', '/studio');
    render(<App />);
    for (const t of TOOLS) expect(screen.getByRole('link', { name: `Open ${t.label}` }).getAttribute('href')).toBe(`/studio/${t.slug}`);
    expect(document.querySelector('.studio-rail')).toBeNull();
    expect(screen.getByRole('region', { name: 'Your uploads' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Studio/ , current: 'page' } as never)).toBeTruthy();
  });

  it('opens a tool full screen with a back arrow and no tab bar, and goes back to the home', async () => {
    mm = installMatchMedia(24);
    window.history.replaceState({}, '', '/studio');
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Open Subtitles' }));
    });
    expect(window.location.pathname).toBe('/studio/subtitles');
    expect(document.querySelector('.ph-tool-frame')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Site' })).toBeNull();
    expect(document.querySelector('.ph-tool')!.textContent).toMatch(/subtitle/i);
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Back to Studio' }));
    });
    expect(window.location.pathname).toBe('/studio');
    expect(screen.getByRole('link', { name: 'Open Video' })).toBeTruthy();
  });

  it('leaves the desktop shell alone on a wide screen', () => {
    mm = installMatchMedia(80);
    window.history.replaceState({}, '', '/phrasebook');
    render(<App />);
    expect(document.querySelector('.shell')).toBeTruthy();
    expect(document.querySelector('.sitenav')).toBeTruthy();
    expect(document.querySelector('.ph-app')).toBeNull();
    cleanup();
    window.history.replaceState({}, '', '/studio');
    render(<App />);
    expect(document.querySelector('.studio-rail')).toBeTruthy();
    expect(document.querySelector('.ph-app')).toBeNull();
  });

  it('switches layout when the window crosses 40rem', () => {
    mm = installMatchMedia(80);
    window.history.replaceState({}, '', '/phrasebook');
    render(<App />);
    expect(document.querySelector('.shell')).toBeTruthy();
    act(() => mm!.setWidthRem(30));
    expect(document.querySelector('.ph-app')).toBeTruthy();
    expect(document.querySelector('.shell')).toBeNull();
  });
});
