// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyframePanel } from '../src/editor/KeyframePanel.tsx';
import { setKey, type Track } from '../src/video/keyframes.ts';
import type { Anims } from '../src/video/text-anim.ts';
import { screen } from './live-screen.ts';

afterEach(cleanup);

const layer = { x: 10, y: 20, w: 100, h: 50, rotation: 0, opacity: 1 };

function setup(tracks: Track[] = [], tLocal = 1, anims?: Anims, extra: Record<string, unknown> = {}) {
  const p = { onChange: vi.fn(), onSeekLocal: vi.fn() };
  render(<KeyframePanel layer={{ ...layer, ...extra }} tLocal={tLocal} tracks={tracks} anims={anims} {...p} />);
  return p;
}

describe('KeyframePanel', () => {
  it('adds a keyframe at the playhead with the current value', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'X: Add keyframe at the playhead' }));
    const patch = p.onChange.mock.calls[0][0];
    expect(patch.tracks).toEqual(setKey([], 'x', 1, 10));
  });
  it('shows the animated value and removes the key when the diamond is pressed again', () => {
    const tracks = setKey(setKey([], 'x', 0, 0), 'x', 2, 100);
    const p = setup(tracks, 1);
    expect(screen.getByLabelText('X value').textContent).toBe('50');
    // no key at 1: adds
    fireEvent.click(screen.getByRole('button', { name: 'X: Add keyframe at the playhead' }));
    expect(p.onChange.mock.calls[0][0].tracks[0].keys).toHaveLength(3);
  });
  it('removes when on a key', () => {
    const tracks = setKey(setKey([], 'x', 0, 0), 'x', 2, 100);
    const p = setup(tracks, 2);
    const b = screen.getByRole('button', { name: 'X: Remove keyframe' });
    expect(b.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(b);
    expect(p.onChange.mock.calls[0][0].tracks[0].keys.map((k: { t: number }) => k.t)).toEqual([0]);
  });
  it('jumps to the previous and next keyframes and disables where there are none', () => {
    const tracks = setKey(setKey([], 'x', 0.5, 0), 'x', 3, 100);
    const p = setup(tracks, 1);
    fireEvent.click(screen.getByRole('button', { name: 'X: Previous keyframe' }));
    expect(p.onSeekLocal).toHaveBeenLastCalledWith(0.5);
    fireEvent.click(screen.getByRole('button', { name: 'X: Next keyframe' }));
    expect(p.onSeekLocal).toHaveBeenLastCalledWith(3);
    expect((screen.getByRole('button', { name: 'Y: Next keyframe' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('changes the easing of the key at the playhead only', () => {
    const tracks = setKey([], 'x', 1, 5);
    const p = setup(tracks, 1);
    fireEvent.change(screen.getByLabelText('X easing'), { target: { value: 'easeOut' } });
    expect(p.onChange.mock.calls[0][0].tracks[0].keys[0].ease).toBe('easeOut');
    cleanup();
    setup(tracks, 2);
    expect((screen.getByLabelText('X easing') as HTMLSelectElement).disabled).toBe(true);
  });
  it('lists only the properties the layer has (plus rotation)', () => {
    setup([], 1, undefined, {});
    expect(screen.queryByLabelText('Volume value')).toBeNull();
    expect(screen.getByLabelText('Rotation value')).toBeTruthy();
  });
  it('is a card like the other inspector sections and never offers volume', () => {
    setup();
    const card = screen.getByRole('region', { name: 'Keyframes' });
    expect(card.classList.contains('inspector')).toBe(true);
    expect(screen.queryByLabelText('Volume value')).toBeNull();
  });
  it('opens its tooltips above, right-aligned', () => {
    setup();
    expect(screen.getByLabelText('X: Add keyframe at the playhead').getAttribute('data-side')).toBe('top-end');
  });
  it('sets animation presets and durations', () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText('In animation'), { target: { value: 'fade' } });
    expect(p.onChange).toHaveBeenLastCalledWith({ anims: { in: { preset: 'fade', dur: 0.5 } } });
  });
  it('edits a duration and clears a preset', () => {
    const anims: Anims = { in: { preset: 'pop', dur: 0.5 }, loop: { preset: 'fade', dur: 2 } };
    const p = setup([], 1, anims);
    fireEvent.change(screen.getByLabelText('In duration'), { target: { value: '1.2' } });
    expect(p.onChange).toHaveBeenLastCalledWith({ anims: { ...anims, in: { preset: 'pop', dur: 1.2 } } });
    fireEvent.change(screen.getByLabelText('In duration'), { target: { value: '' } });
    expect(p.onChange).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Loop animation'), { target: { value: 'none' } });
    expect(p.onChange).toHaveBeenLastCalledWith({ anims: { in: anims.in } });
  });
  it('has no duration box for an empty slot', () => {
    setup();
    expect(screen.queryByLabelText('Out duration')).toBeNull();
  });
});
