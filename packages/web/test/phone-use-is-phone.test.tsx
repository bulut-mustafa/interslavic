// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { isPhoneNow, useIsPhone } from '../src/phone/useIsPhone.ts';
import { installMatchMedia } from './phone-media.ts';
import { screen } from './live-screen.ts';

function Probe() {
  return <p>{useIsPhone() ? 'phone' : 'desktop'}</p>;
}

let mm: ReturnType<typeof installMatchMedia> | undefined;
afterEach(() => {
  cleanup();
  mm?.uninstall();
  mm = undefined;
});

describe('useIsPhone', () => {
  it('is false without matchMedia', () => {
    expect(isPhoneNow()).toBe(false);
    render(<Probe />);
    expect(screen.getByText('desktop')).toBeTruthy();
  });

  it('follows the 40rem query as the window changes', () => {
    mm = installMatchMedia(24);
    render(<Probe />);
    expect(screen.getByText('phone')).toBeTruthy();
    expect(isPhoneNow()).toBe(true);
    act(() => mm!.setWidthRem(60));
    expect(screen.getByText('desktop')).toBeTruthy();
    act(() => mm!.setWidthRem(30));
    expect(screen.getByText('phone')).toBeTruthy();
  });

  it('renders the desktop answer on the server, even where the screen is a phone', () => {
    mm = installMatchMedia(24);
    expect(renderToString(<Probe />)).toContain('desktop');
  });
});
