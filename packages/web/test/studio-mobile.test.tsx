// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import App from '../src/App.tsx';
import { screen } from './live-screen.ts';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, parser: true }) })));
  window.history.replaceState({}, '', '/studio/photo');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Studio on a phone: the Uploads bottom sheet', () => {
  it('opens from the tab bar, and closes by the close button, the backdrop or Escape', async () => {
    render(<App />);
    const open = async () => {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Uploads/ }));
      });
    };
    await open();
    expect(document.getElementById('uploads-sheet')).toBeTruthy();
    expect(document.querySelector('.uploads-backdrop')).toBeTruthy();
    // the picker takes pictures, videos and sounds (the phone's own picker offers its camera for these)
    expect(document.querySelector('#uploads-sheet input[type=file]')!.getAttribute('accept')).toBe('image/*,video/*,audio/*');

    fireEvent.click(screen.getByRole('button', { name: 'Close uploads'}));
    expect(document.getElementById('uploads-sheet')).toBeNull();

    await open();
    fireEvent.click(document.querySelector('.uploads-backdrop')!);
    expect(document.getElementById('uploads-sheet')).toBeNull();

    await open();
    fireEvent.keyDown(document.getElementById('uploads-sheet')!, { key: 'Escape' });
    expect(document.getElementById('uploads-sheet')).toBeNull();
  });

  it('gives the top bar a way back to the translator, since the rail footer is hidden on phones', () => {
    render(<App />);
    const back = document.querySelector('.studio-bar-back') as HTMLAnchorElement;
    expect(back.getAttribute('href')).toBe('/');
  });
});
