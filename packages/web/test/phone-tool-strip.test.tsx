// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ToolStrip, type StripItem } from '../src/phone/ToolStrip.tsx';
import { screen } from './live-screen.ts';

afterEach(cleanup);

const project: StripItem[] = [
  { id: 'add', label: 'Add', icon: <i /> },
  { id: 'crop', label: 'Crop', icon: <i />, badge: 2 },
  { id: 'off', label: 'Off', icon: <i />, disabled: true },
];
const selection: StripItem[] = [{ id: 'font', label: 'Font', icon: <i /> }];

describe('ToolStrip', () => {
  it('shows items, marks the selected one and reports taps', () => {
    const onSelect = vi.fn();
    render(<ToolStrip items={project} selected="crop" onSelect={onSelect} />);
    expect(screen.getByRole('toolbar', { name: 'Tools' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Crop/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Add/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('2')).toBeTruthy(); // badge
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    expect(onSelect).toHaveBeenCalledWith('add');
    fireEvent.click(screen.getByRole('button', { name: /Off/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('swaps the whole strip (a fresh element, so it animates in) when the mode changes', () => {
    const { rerender } = render(<ToolStrip items={project} onSelect={() => {}} mode="project" />);
    const before = document.querySelector('.ph-strip')!;
    expect(before.getAttribute('data-mode')).toBe('project');
    rerender(<ToolStrip items={selection} onSelect={() => {}} mode="text" />);
    const after = document.querySelector('.ph-strip')!;
    expect(after).not.toBe(before);
    expect(after.getAttribute('data-mode')).toBe('text');
    expect(screen.queryByRole('button', { name: /Add/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Font/ })).toBeTruthy();
  });

  it('fades only the side with more content', () => {
    render(<ToolStrip items={project} onSelect={() => {}} />);
    const strip = document.querySelector('.ph-strip') as HTMLElement;
    const wrap = strip.parentElement!;
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 100 });
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 300 });
    strip.scrollLeft = 0;
    fireEvent.scroll(strip);
    expect(wrap.className).toContain('fade-right');
    expect(wrap.className).not.toContain('fade-left');
    strip.scrollLeft = 200;
    fireEvent.scroll(strip);
    expect(wrap.className).toContain('fade-left');
    expect(wrap.className).not.toContain('fade-right');
  });
});
