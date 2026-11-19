// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextEffectsPanel } from '../src/editor/TextEffectsPanel.tsx';
import { DEFAULT_EFFECTS, type TextEffect } from '../src/editor/text-effects.ts';
import { DEFAULT_STYLE } from '../src/editor/text-style.ts';
import { screen } from './live-screen.ts';

afterEach(cleanup);

function setup(effect?: TextEffect) {
  const onChange = vi.fn();
  render(<TextEffectsPanel style={{ ...DEFAULT_STYLE, effect }} onChange={onChange} />);
  return onChange;
}

describe('TextEffectsPanel', () => {
  it('lists None and every kind, marking the current one', () => {
    setup(DEFAULT_EFFECTS.neon);
    for (const l of ['None', 'Lift', 'Hollow', 'Splice', 'Echo', 'Glitch', 'Neon', 'Curve']) expect(screen.getByRole('button', { name: l })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Neon' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'None' }).getAttribute('aria-pressed')).toBe('false');
  });
  it('picking a kind patches the effect with its defaults, as an end', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Echo' }));
    expect(onChange).toHaveBeenCalledWith({ effect: DEFAULT_EFFECTS.echo }, 'end');
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(onChange).toHaveBeenLastCalledWith({ effect: { kind: 'none' } }, 'end');
  });
  it('shows no parameters for None and the right ones per kind', () => {
    setup();
    expect(screen.queryByRole('slider')).toBeNull();
    cleanup();
    setup(DEFAULT_EFFECTS.glitch);
    expect(screen.getByLabelText('Offset')).toBeTruthy();
    expect(screen.getByLabelText('Direction')).toBeTruthy();
    expect(screen.getByLabelText('Glitch colour 1')).toBeTruthy();
    expect(screen.getByLabelText('Glitch colour 2')).toBeTruthy();
  });
  it('a slider previews while it moves and ends on release, keeping the other parameters', () => {
    const onChange = setup(DEFAULT_EFFECTS.curve);
    const s = screen.getByLabelText('Bend');
    fireEvent.change(s, { target: { value: '-30' } });
    expect(onChange).toHaveBeenLastCalledWith({ effect: { kind: 'curve', amount: -30 } }, 'preview');
    fireEvent.pointerUp(s);
    expect(onChange).toHaveBeenLastCalledWith({ effect: { kind: 'curve', amount: DEFAULT_EFFECTS.curve.amount } }, 'end');
  });
  it('a colour input patches only that colour', () => {
    const onChange = setup(DEFAULT_EFFECTS.echo);
    fireEvent.change(screen.getByLabelText('Echo colour'), { target: { value: '#00ff00' } });
    expect(onChange).toHaveBeenLastCalledWith({ effect: { ...DEFAULT_EFFECTS.echo, color: '#00ff00' } }, 'preview');
  });
  it('shows the value beside the slider', () => {
    setup({ kind: 'curve', amount: 25 });
    expect(screen.getByText('25%')).toBeTruthy();
  });
});
