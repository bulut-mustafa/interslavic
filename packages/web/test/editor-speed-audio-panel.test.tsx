// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpeedAudioPanel } from '../src/editor/SpeedAudioPanel.tsx';
import { screen } from './live-screen.ts';

afterEach(cleanup);

function setup(over: Partial<Parameters<typeof SpeedAudioPanel>[0]> = {}) {
  const onChange = vi.fn();
  render(<SpeedAudioPanel speed={1} volume={1} fadeIn={0} fadeOut={0} duration={10} onChange={onChange} {...over} />);
  return onChange;
}
const set = (label: string, v: number) => fireEvent.change(screen.getByLabelText(label), { target: { value: String(v) } });

describe('SpeedAudioPanel', () => {
  it('has a preset button per speed and marks the current one', () => {
    setup({ speed: 2 });
    expect(screen.getAllByRole('button', { name: /^\d(\.\d+)?x$/ })).toHaveLength(7);
    expect(screen.getByRole('button', { name: '2x' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '1x' }).getAttribute('aria-pressed')).toBe('false');
  });
  it('a preset sets the speed', () => {
    const c = setup();
    fireEvent.click(screen.getByRole('button', { name: '0.5x' }));
    expect(c).toHaveBeenLastCalledWith({ speed: 0.5 });
  });
  it('the slider is logarithmic and clamped', () => {
    const c = setup();
    set('Speed', 2);
    expect(c).toHaveBeenLastCalledWith({ speed: 4 });
    set('Speed', -2);
    expect(c).toHaveBeenLastCalledWith({ speed: 0.25 });
  });
  it('shortens fades when a faster speed makes the item shorter', () => {
    const c = setup({ fadeIn: 4, fadeOut: 4, duration: 10 });
    fireEvent.click(screen.getByRole('button', { name: '2x' }));
    expect(c).toHaveBeenLastCalledWith({ speed: 2, fadeIn: 4, fadeOut: 1 });
  });
  it('volume shows a dB readout', () => {
    const c = setup({ volume: 0.5 });
    expect(screen.getByText('-6.0 dB')).toBeTruthy();
    set('Volume', 0.25);
    expect(c).toHaveBeenLastCalledWith({ volume: 0.25 });
  });
  it('zero volume reads minus infinity', () => {
    setup({ volume: 0 });
    expect(screen.getByText('-∞ dB')).toBeTruthy();
  });
  it('fades never exceed the item together', () => {
    const c = setup({ fadeIn: 2, fadeOut: 3, duration: 10 });
    expect(screen.getByLabelText('Fade in').getAttribute('max')).toBe('7');
    expect(screen.getByLabelText('Fade out').getAttribute('max')).toBe('8');
    set('Fade in', 6);
    expect(c).toHaveBeenLastCalledWith({ fadeIn: 6 });
    set('Fade out', 8);
    expect(c).toHaveBeenLastCalledWith({ fadeOut: 8 });
  });
  it('extract audio only when asked for', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Extract audio' })).toBeNull();
    cleanup();
    const onExtract = vi.fn();
    setup({ onExtract });
    fireEvent.click(screen.getByRole('button', { name: 'Extract audio' }));
    expect(onExtract).toHaveBeenCalledTimes(1);
  });
});
