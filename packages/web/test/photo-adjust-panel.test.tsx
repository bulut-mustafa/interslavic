// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdjustPanel } from '../src/photo/AdjustPanel.tsx';
import { PRESETS } from '../src/photo/presets.ts';
import type { Adjust } from '../src/video/project.ts';
import { screen } from './live-screen.ts';

afterEach(cleanup);

function setup(p: { adjust?: Adjust; preset?: string; presetAmount?: number } = {}) {
  const fns = { onChange: vi.fn(), onAuto: vi.fn(), onReset: vi.fn(), onCompare: vi.fn() };
  render(<AdjustPanel adjust={p.adjust ?? {}} preset={p.preset} presetAmount={p.presetAmount} {...fns} />);
  return fns;
}

describe('AdjustPanel', () => {
  it('shows three basic sliders first and the others after More adjustments', () => {
    setup();
    for (const l of ['Brightness', 'Contrast', 'Saturation']) expect(screen.getByLabelText(l)).toBeTruthy();
    expect(screen.queryByLabelText('Temperature')).toBeNull();
    const more = screen.getByRole('button', { name: 'More adjustments' });
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    for (const l of ['Temperature', 'Tint', 'Hue', 'Fade', 'Sharpen', 'Vignette', 'Blur']) expect(screen.getByLabelText(l)).toBeTruthy();
  });

  it('a slider drag previews on input and ends ONCE on release, keeping other values', () => {
    const { onChange } = setup({ adjust: { contrast: 10 } });
    const s = screen.getByLabelText('Brightness');
    fireEvent.change(s, { target: { value: '20' } });
    fireEvent.change(s, { target: { value: '25' } });
    expect(onChange.mock.calls.map((c) => c[1])).toEqual(['preview', 'preview']);
    fireEvent.pointerUp(s);
    fireEvent.pointerUp(s);
    expect(onChange.mock.calls.map((c) => c[1])).toEqual(['preview', 'preview', 'end']);
    expect(onChange).toHaveBeenLastCalledWith({ adjust: { contrast: 10, brightness: 25 } }, 'end');
  });

  it('ends on keyboard release', () => {
    const { onChange } = setup();
    const s = screen.getByLabelText('Saturation');
    fireEvent.change(s, { target: { value: '5' } });
    fireEvent.keyUp(s, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ adjust: { saturation: 5 } }, 'end');
  });

  it('double click puts a slider back to 0', () => {
    const { onChange } = setup({ adjust: { brightness: 30 } });
    fireEvent.doubleClick(screen.getByLabelText('Brightness'));
    expect(onChange).toHaveBeenLastCalledWith({ adjust: { brightness: 0 } }, 'end');
  });

  it('offers a look per preset plus None, and picking one ends at once', () => {
    const { onChange } = setup({ presetAmount: 0.6 });
    expect(screen.getAllByRole('button', { name: / look$/ }).length).toBe(PRESETS.length + 1);
    fireEvent.click(screen.getByRole('button', { name: 'Noir look' }));
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'noir', presetAmount: 0.6 }, 'end');
    fireEvent.click(screen.getByRole('button', { name: 'No look' }));
    expect(onChange).toHaveBeenLastCalledWith({ preset: undefined }, 'end');
  });

  it('marks the chosen look and shows its strength slider only then', () => {
    setup({ preset: 'warm', presetAmount: 0.5 });
    expect(screen.getByRole('button', { name: 'Warm look' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Look strength') as HTMLInputElement).value).toBe('50');
  });

  it('no strength slider without a look', () => {
    setup();
    expect(screen.queryByLabelText('Look strength')).toBeNull();
  });

  it('strength previews then ends once, as a 0..1 amount', () => {
    const { onChange } = setup({ preset: 'warm', presetAmount: 1 });
    const s = screen.getByLabelText('Look strength');
    fireEvent.change(s, { target: { value: '40' } });
    fireEvent.pointerUp(s);
    expect(onChange.mock.calls).toEqual([[{ presetAmount: 0.4 }, 'preview'], [{ presetAmount: 0.4 }, 'end']]);
  });

  it('Auto and Reset call their handlers', () => {
    const { onAuto, onReset } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onAuto).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('Compare reports true while held and false on release, once each', () => {
    const { onCompare } = setup();
    const b = screen.getByRole('button', { name: /Compare/ });
    fireEvent.pointerDown(b);
    fireEvent.pointerDown(b);
    fireEvent.pointerUp(b);
    fireEvent.pointerLeave(b);
    expect(onCompare.mock.calls).toEqual([[true], [false]]);
  });

  it('Compare also works from the keyboard and lets go on blur', () => {
    const { onCompare } = setup();
    const b = screen.getByRole('button', { name: /Compare/ });
    fireEvent.keyDown(b, { key: ' ' });
    fireEvent.blur(b);
    expect(onCompare.mock.calls).toEqual([[true], [false]]);
  });
});
