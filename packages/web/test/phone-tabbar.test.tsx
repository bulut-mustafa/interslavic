// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { TabBar } from '../src/phone/TabBar.tsx';
import { TopBar } from '../src/phone/TopBar.tsx';
import { PHONE_TABS } from '../src/phone/PhoneApp.tsx';
import { usePath } from '../src/router.tsx';
import { screen } from './live-screen.ts';

afterEach(cleanup);

function Host() {
  const path = usePath();
  return <TabBar items={PHONE_TABS} path={path} />;
}

describe('TabBar', () => {
  it('marks the current tab and navigates without a reload', async () => {
    window.history.replaceState({}, '', '/');
    render(<Host />);
    expect(screen.getByRole('link', { name: /Translate/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: /Studio/ }).getAttribute('aria-current')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: /Phrasebook/ }));
    });
    expect(window.location.pathname).toBe('/phrasebook');
    expect(screen.getByRole('link', { name: /Phrasebook/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: /Translate/ }).getAttribute('aria-current')).toBeNull();
  });

  it('keeps Studio current under a tool path', () => {
    window.history.replaceState({}, '', '/studio/photo');
    render(<Host />);
    expect(screen.getByRole('link', { name: /Studio/ }).getAttribute('aria-current')).toBe('page');
  });
});

describe('TopBar', () => {
  it('has a back link when given backHref', () => {
    render(<TopBar title="Photo" backHref="/studio" backLabel="Back to Studio" right={<button>Go</button>} />);
    expect(screen.getByRole('link', { name: 'Back to Studio' }).getAttribute('href')).toBe('/studio');
    expect(screen.getByText('Photo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy();
  });
});
