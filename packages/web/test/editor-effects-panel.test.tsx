// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EffectsPanel, DEFAULT_CHROMA, DEFAULT_MASK } from '../src/editor/EffectsPanel.tsx';
import type { Chroma, FxAdjust, Mask } from '../src/video/effects.ts';
import { screen } from './live-screen.ts';

afterEach(cleanup);

function setup(p: { adjust?: FxAdjust; mask?: Mask; chroma?: Chroma } = {}) {
  const onChange = vi.fn();
  render(<EffectsPanel adjust={p.adjust ?? {}} mask={p.mask} chroma={p.chroma} onChange={onChange} />);
  return onChange;
}
const set = (label: string, v: number | string) => fireEvent.change(screen.getByLabelText(label), { target: { value: String(v) } });

describe('EffectsPanel: adjust', () => {
  it('has a slider for every adjustment and patches only adjust, keeping the other values', () => {
    const onChange = setup({ adjust: { contrast: 10 } });
    for (const l of ['Brightness', 'Contrast', 'Saturation', 'Hue', 'Blur', 'Temperature', 'Tint', 'Fade', 'Sharpen', 'Vignette']) expect(screen.getByLabelText(l)).toBeTruthy();
    set('Brightness', 25);
    expect(onChange).toHaveBeenLastCalledWith({ adjust: { contrast: 10, brightness: 25 } });
  });
  it('shows the value next to the slider', () => {
    setup({ adjust: { hue: 90 } });
    expect(screen.getByText('90°')).toBeTruthy();
  });
});

describe('EffectsPanel: mask', () => {
  it('is off until switched on, which adds the default mask', () => {
    const onChange = setup();
    expect(screen.queryByLabelText('Mask shape')).toBeNull();
    fireEvent.click(screen.getByLabelText('Mask'));
    expect(onChange).toHaveBeenLastCalledWith({ mask: DEFAULT_MASK });
  });
  it('switching it off clears the mask', () => {
    const onChange = setup({ mask: DEFAULT_MASK });
    fireEvent.click(screen.getByLabelText('Mask'));
    expect(onChange).toHaveBeenLastCalledWith({ mask: undefined });
  });
  it('edits shape, feather and invert', () => {
    const onChange = setup({ mask: DEFAULT_MASK });
    fireEvent.change(screen.getByLabelText('Mask shape'), { target: { value: 'heart' } });
    expect(onChange).toHaveBeenLastCalledWith({ mask: { ...DEFAULT_MASK, shape: 'heart' } });
    set('Feather', 12);
    expect(onChange).toHaveBeenLastCalledWith({ mask: { ...DEFAULT_MASK, feather: 12 } });
    fireEvent.click(screen.getByLabelText('Invert mask'));
    expect(onChange).toHaveBeenLastCalledWith({ mask: { ...DEFAULT_MASK, invert: true } });
  });
});

describe('EffectsPanel: chroma key', () => {
  it('is off until switched on', () => {
    const onChange = setup();
    expect(screen.queryByLabelText('Key colour')).toBeNull();
    fireEvent.click(screen.getByLabelText('Chroma key'));
    expect(onChange).toHaveBeenLastCalledWith({ chroma: DEFAULT_CHROMA });
  });
  it('edits colour, similarity and smoothness', () => {
    const onChange = setup({ chroma: DEFAULT_CHROMA });
    set('Key colour', '#112233');
    expect(onChange).toHaveBeenLastCalledWith({ chroma: { ...DEFAULT_CHROMA, color: '#112233' } });
    set('Similarity', 0.5);
    expect(onChange).toHaveBeenLastCalledWith({ chroma: { ...DEFAULT_CHROMA, similarity: 0.5 } });
    set('Smoothness', 0.2);
    expect(onChange).toHaveBeenLastCalledWith({ chroma: { ...DEFAULT_CHROMA, smoothness: 0.2 } });
  });
});

describe('EffectsPanel: reset', () => {
  it('clears adjust, mask and chroma at once, and its tooltip opens above, right-aligned', () => {
    const onChange = setup({ adjust: { hue: 5 }, mask: DEFAULT_MASK, chroma: DEFAULT_CHROMA });
    const b = screen.getByLabelText('Reset effects');
    expect(b.getAttribute('data-side')).toBe('top-end');
    fireEvent.click(b);
    expect(onChange).toHaveBeenLastCalledWith({ adjust: {}, mask: undefined, chroma: undefined });
  });
});
