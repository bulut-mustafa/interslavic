// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STYLE } from '../src/editor/text-style.ts';
import type { PhotoLayer } from '../src/photo/doc.ts';
import { LayersPanel, dropOrder } from '../src/photo/LayersPanel.tsx';
import { screen } from './live-screen.ts';

afterEach(cleanup);

const img = (id: string, over: object = {}): PhotoLayer => ({ id, kind: 'image', src: 's', x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, blend: 'normal', ...over }) as PhotoLayer;
const shp = (id: string): PhotoLayer => ({ id, kind: 'shape', shape: 'star', x: 0, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, blend: 'normal' });
const txt = (id: string): PhotoLayer => ({ id, text: 'Hello world', x: 0, y: 0, maxWidth: 0, style: { ...DEFAULT_STYLE } });
const layers = [img('a'), shp('b'), txt('c')]; // c is in front

function setup(over: Partial<Parameters<typeof LayersPanel>[0]> = {}) {
  const p = { onSelect: vi.fn(), onChange: vi.fn() };
  render(<LayersPanel layers={layers} selected={['b']} {...p} {...over} />);
  return p;
}
// jsdom's PointerEvent drops clientY, so the pointer events are sent as mouse events of the same name (React listens by name).
const ptr = (el: Element, type: string, clientY: number) => fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, clientY }));
const ids = (call: unknown[]) => (call[0] as PhotoLayer[]).map((l) => l.id);

describe('LayersPanel', () => {
  it('lists layers front first with names', () => {
    setup();
    const rows = [...document.querySelectorAll('li[data-id]')].map((r) => r.getAttribute('data-id'));
    expect(rows).toEqual(['c', 'b', 'a']);
    expect(screen.getByText('Hello world')).toBeTruthy();
    expect(screen.getByText('Star')).toBeTruthy();
    expect(screen.getByText('Picture')).toBeTruthy();
  });
  it('marks the selected rows', () => {
    setup({ selected: ['a', 'b'] });
    expect(screen.getByLabelText('Star').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Picture').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Hello world').getAttribute('aria-pressed')).toBe('false');
  });
  it('selects on click, additive with shift', () => {
    const p = setup();
    fireEvent.click(screen.getByLabelText('Picture'));
    expect(p.onSelect).toHaveBeenLastCalledWith(['a'], false);
    fireEvent.click(screen.getByLabelText('Picture'), { shiftKey: true });
    expect(p.onSelect).toHaveBeenLastCalledWith(['a'], true);
  });
  it('hides and locks', () => {
    const p = setup();
    fireEvent.click(screen.getByLabelText('Hide Picture'));
    expect((p.onChange.mock.calls.at(-1)![0] as PhotoLayer[]).find((l) => l.id === 'a')).toMatchObject({ hidden: true });
    expect(p.onChange.mock.calls.at(-1)![1]).toBe('commit');
    fireEvent.click(screen.getByLabelText('Lock Star'));
    expect((p.onChange.mock.calls.at(-1)![0] as PhotoLayer[]).find((l) => l.id === 'b')).toMatchObject({ locked: true });
  });
  it('shows the state of hidden and locked layers', () => {
    setup({ layers: [img('a', { hidden: true, locked: true })] });
    expect(screen.getByLabelText('Show Picture').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Unlock Picture')).toBeTruthy();
  });
  it('renames on double-click and Enter', () => {
    const p = setup();
    fireEvent.doubleClick(screen.getByLabelText('Picture'));
    const input = screen.getByLabelText('Layer name');
    fireEvent.change(input, { target: { value: 'Logo' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((p.onChange.mock.calls.at(-1)![0] as PhotoLayer[]).find((l) => l.id === 'a')).toMatchObject({ name: 'Logo' });
  });
  it('Escape cancels a rename', () => {
    const p = setup();
    fireEvent.doubleClick(screen.getByLabelText('Picture'));
    const input = screen.getByLabelText('Layer name');
    fireEvent.change(input, { target: { value: 'Logo' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(p.onChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Layer name')).toBeNull();
  });
  it('Alt+ArrowUp brings the layer forward, Alt+ArrowDown sends it back', () => {
    const p = setup();
    fireEvent.keyDown(screen.getByLabelText('Picture'), { key: 'ArrowUp', altKey: true });
    expect(ids(p.onChange.mock.calls.at(-1)!)).toEqual(['b', 'a', 'c']);
    fireEvent.keyDown(screen.getByLabelText('Hello world'), { key: 'ArrowDown', altKey: true });
    expect(ids(p.onChange.mock.calls.at(-1)!)).toEqual(['a', 'c', 'b']);
  });
  it('does nothing for Alt+ArrowUp on the front layer', () => {
    const p = setup();
    fireEvent.keyDown(screen.getByLabelText('Hello world'), { key: 'ArrowUp', altKey: true });
    expect(p.onChange).not.toHaveBeenCalled();
  });
  it('reorders by dragging the grip, with an insertion marker', () => {
    const p = setup();
    // rows are 40px tall, front row at y 0..40
    document.querySelectorAll('li[data-id]').forEach((r, i) => {
      r.getBoundingClientRect = () => ({ top: i * 40, height: 40, bottom: i * 40 + 40, left: 0, right: 100, width: 100, x: 0, y: i * 40, toJSON: () => ({}) });
    });
    const grip = screen.getByLabelText('Reorder Hello world'); // front row
    ptr(grip, 'pointerdown', 10);
    ptr(grip, 'pointermove', 110); // below the last row's middle: gap 3
    expect(document.querySelector('.is-drop-after')).toBeTruthy();
    ptr(grip, 'pointerup', 110);
    expect(ids(p.onChange.mock.calls.at(-1)!)).toEqual(['c', 'a', 'b']);
    expect(document.querySelector('.is-drop-after')).toBeNull();
  });
  it('a cancelled drag changes nothing', () => {
    const p = setup();
    const grip = screen.getByLabelText('Reorder Picture');
    fireEvent.pointerDown(grip, { clientY: 0, pointerId: 1, button: 0, pointerType: 'touch' });
    fireEvent.pointerCancel(grip, { pointerId: 1 });
    expect(p.onChange).not.toHaveBeenCalled();
  });
  it('says so when there are no layers', () => {
    setup({ layers: [], selected: [] });
    expect(screen.getByText(/No layers yet/)).toBeTruthy();
  });
});

describe('dropOrder', () => {
  const l = [img('a'), img('b'), img('c'), img('d')]; // shown d c b a
  const run = (id: string, gap: number) => dropOrder(l, id, gap).map((x) => x.id).join('');
  it('moves a layer to a gap of the displayed list', () => {
    expect(run('a', 0)).toBe('bcda'); // to the very front
    expect(run('d', 4)).toBe('dabc'); // to the very back
    expect(run('c', 3)).toBe('acbd'); // shown d c b a: gap 3 is between b and a
  });
  it('keeps order when dropped in place', () => {
    expect(run('c', 1)).toBe('abcd');
    expect(run('c', 2)).toBe('abcd');
  });
});
