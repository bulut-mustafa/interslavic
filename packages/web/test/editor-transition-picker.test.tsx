// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { screen } from './live-screen.ts';
import { TransitionPicker } from '../src/editor/TransitionPicker.tsx';
import { DEFAULT_TRANSITION, TRANSITION_KINDS } from '../src/video/transitions.ts';

afterEach(cleanup);

describe('TransitionPicker', () => {
  it('offers None and every kind as radios, with the current one checked', () => {
    render(<TransitionPicker value={{ kind: 'zoom', duration: 1 }} max={3} onChange={() => {}} />);
    expect(screen.getAllByRole('radio').length).toBe(TRANSITION_KINDS.length + 1);
    expect(screen.getByRole('radio', { name: 'Zoom' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'None' }).getAttribute('aria-checked')).toBe('false');
  });
  it('checks None when there is no value', () => {
    render(<TransitionPicker value={undefined} max={3} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'None' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('slider')).toBeNull();
  });
  it('choosing a kind with none set starts at the default duration, clamped to max', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TransitionPicker value={undefined} max={3} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dissolve' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'fade', duration: DEFAULT_TRANSITION });
    rerender(<TransitionPicker value={undefined} max={0.3} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dissolve' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'fade', duration: 0.3 });
  });
  it('choosing another kind keeps the duration', () => {
    const onChange = vi.fn();
    render(<TransitionPicker value={{ kind: 'fade', duration: 1.2 }} max={3} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Wipe left' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'wipe-left', duration: 1.2 });
  });
  it('None clears it', () => {
    const onChange = vi.fn();
    render(<TransitionPicker value={{ kind: 'fade', duration: 1 }} max={3} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'None' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
  it('the slider is limited by max and changes the duration', () => {
    const onChange = vi.fn();
    render(<TransitionPicker value={{ kind: 'fade', duration: 1 }} max={2.5} onChange={onChange} />);
    const s = screen.getByRole('slider', { name: 'Duration' }) as HTMLInputElement;
    expect(s.max).toBe('2.5');
    fireEvent.change(s, { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'fade', duration: 2 });
    expect(screen.getByText('1.0 s')).toBeTruthy();
  });
  it('shows a stored duration above max as max, and says why when the clips are too short', () => {
    const { rerender } = render(<TransitionPicker value={{ kind: 'fade', duration: 9 }} max={2} onChange={() => {}} />);
    expect((screen.getByRole('slider', { name: 'Duration' }) as HTMLInputElement).value).toBe('2');
    rerender(<TransitionPicker value={undefined} max={0.05} onChange={() => {}} />);
    expect(screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-label') !== 'None').every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByText(/too short/i)).toBeTruthy();
  });
  it('arrow keys move between options', () => {
    const onChange = vi.fn();
    render(<TransitionPicker value={{ kind: 'fade', duration: 1 }} max={3} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Dissolve' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith({ kind: 'dip', duration: 1 });
  });
});
