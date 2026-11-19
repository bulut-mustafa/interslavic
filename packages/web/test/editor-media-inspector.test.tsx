// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaInspector } from '../src/editor/MediaInspector.tsx';
import { stepOrder } from '../src/editor/layers.ts';
import type { MediaLayer, Source } from '../src/video/project.ts';
import { screen } from './live-screen.ts';

afterEach(cleanup);

const layer: MediaLayer = { id: 'm', kind: 'media', srcId: 's1', in: 0, start: 2, end: 7, track: 1, x: 100, y: 50, w: 400, h: 200, rotation: 30, opacity: 0.8, blend: 'normal' };
const video: Source = { id: 's1', kind: 'video', name: 'Clip.mp4' };
const image: Source = { id: 's1', kind: 'image', name: 'Pic.png' };

function setup(over: Partial<MediaLayer> = {}, source: Source = video) {
  const p = { onChange: vi.fn(), onOrder: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() };
  render(<MediaInspector layer={{ ...layer, ...over }} source={source} frame={{ w: 1280, h: 720 }} {...p} />);
  return p;
}
const type = (label: string, v: number) => fireEvent.change(screen.getByLabelText(label), { target: { value: String(v) } });

describe('MediaInspector', () => {
  it('sets opacity', () => {
    const p = setup();
    type('Opacity', 0.5);
    expect(p.onChange).toHaveBeenLastCalledWith({ opacity: 0.5 });
  });

  it('has no volume slider (the sound is in the speed and sound panel), for video or picture', () => {
    setup();
    expect(screen.queryByLabelText('Volume')).toBeNull();
    cleanup();
    setup({}, image);
    expect(screen.queryByLabelText('Volume')).toBeNull();
  });

  it('labels the paired fields', () => {
    setup();
    for (const t of ['Starts (s)', 'Length (s)', 'Width', 'Height', 'X', 'Y']) expect(screen.getByText(t)).toBeTruthy();
  });

  it('changes the width with the ratio locked and keeps the centre', () => {
    const p = setup();
    type('Size width', 200);
    expect(p.onChange).toHaveBeenLastCalledWith({ w: 200, h: 100, x: 200, y: 100 });
  });

  it('changes one side only when the lock is off', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Keep the ratio' }));
    type('Size height', 100);
    expect(p.onChange).toHaveBeenLastCalledWith({ w: 400, h: 100, x: 100, y: 100 });
  });

  it('sets the position', () => {
    const p = setup();
    type('Position x', 10);
    expect(p.onChange).toHaveBeenLastCalledWith({ x: 10 });
    type('Position y', 20);
    expect(p.onChange).toHaveBeenLastCalledWith({ y: 20 });
  });

  it('sets and resets the rotation', () => {
    const p = setup();
    type('Rotation in degrees', 45);
    expect(p.onChange).toHaveBeenLastCalledWith({ rotation: 45 });
    fireEvent.click(screen.getByRole('button', { name: 'Reset the turn' }));
    expect(p.onChange).toHaveBeenLastCalledWith({ rotation: 0 });
  });

  it('sets the blend mode', () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText('Blend mode'), { target: { value: 'multiply' } });
    expect(p.onChange).toHaveBeenLastCalledWith({ blend: 'multiply' });
  });

  it('moves the start keeping the length, and sets the duration', () => {
    const p = setup();
    type('Time start', 4);
    expect(p.onChange).toHaveBeenLastCalledWith({ start: 4, end: 9 });
    type('Time duration', 1.5);
    expect(p.onChange).toHaveBeenLastCalledWith({ end: 3.5 });
  });

  it('ignores an empty field', () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText('Position x'), { target: { value: '' } });
    expect(p.onChange).not.toHaveBeenCalled();
  });

  it('wires the order, duplicate and delete buttons', () => {
    const p = setup();
    for (const [name, kind] of [['Bring to front', 'front'], ['Bring forward', 'forward'], ['Send backward', 'backward'], ['Send to back', 'back']] as const) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(p.onOrder).toHaveBeenLastCalledWith(kind);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(p.onDuplicate).toHaveBeenCalledTimes(1);
    expect(p.onDelete).toHaveBeenCalledTimes(1);
  });

  it('puts tooltips above, right-aligned, so the scrolling panel does not cut them', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Delete' }).getAttribute('data-side')).toBe('top-end');
  });
});

describe('stepOrder', () => {
  const l = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const ids = (x: { id: string }[]) => x.map((i) => i.id).join('');
  it('steps one place or goes to an end', () => {
    expect(ids(stepOrder(l, 'a', 'forward'))).toBe('bac');
    expect(ids(stepOrder(l, 'c', 'backward'))).toBe('acb');
    expect(ids(stepOrder(l, 'a', 'front'))).toBe('bca');
    expect(ids(stepOrder(l, 'c', 'back'))).toBe('cab');
  });
  it('returns the same list when nothing would move or the id is unknown', () => {
    expect(stepOrder(l, 'c', 'front')).toBe(l);
    expect(stepOrder(l, 'a', 'backward')).toBe(l);
    expect(stepOrder(l, 'z', 'front')).toBe(l);
  });
});
