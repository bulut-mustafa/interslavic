// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImageLayer, ShapeLayer } from '../src/photo/doc.ts';
import { ObjectInspector, type ObjectLayer } from '../src/photo/ObjectInspector.tsx';
import { screen } from './live-screen.ts';

afterEach(cleanup);

const image: ImageLayer = { id: 'i', kind: 'image', src: 's', x: 100, y: 50, w: 400, h: 200, rotation: 10, opacity: 0.8, blend: 'normal' };
const rect: ShapeLayer = { id: 's', kind: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 100, rotation: 0, opacity: 1, blend: 'normal', fill: '#112233' };
const arrow: ShapeLayer = { id: 'a', kind: 'shape', shape: 'arrow', x: 0, y: 0, w: 300, h: 12, rotation: 0, opacity: 1, blend: 'normal', stroke: { color: '#ff0000', width: 6 } };

function setup(layer: ObjectLayer = image) {
  const p = { onChange: vi.fn(), onOrder: vi.fn(), onAlign: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() };
  render(<ObjectInspector layer={layer} page={{ w: 1000, h: 600 }} {...p} />);
  return p;
}
const type = (label: string, v: number | string) => fireEvent.change(screen.getByLabelText(label), { target: { value: String(v) } });

describe('ObjectInspector', () => {
  it('previews opacity while the slider moves and ends it on release', () => {
    const p = setup();
    type('Opacity', 0.5);
    expect(p.onChange).toHaveBeenLastCalledWith({ opacity: 0.5 }, 'preview');
    fireEvent.pointerUp(screen.getByLabelText('Opacity'));
    expect(p.onChange).toHaveBeenLastCalledWith({ opacity: 0.5 }, 'end');
  });
  it('sets blend and flips', () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText('Blend mode'), { target: { value: 'multiply' } });
    expect(p.onChange).toHaveBeenLastCalledWith({ blend: 'multiply' }, 'commit');
    fireEvent.click(screen.getByLabelText('Flip horizontally'));
    expect(p.onChange).toHaveBeenLastCalledWith({ flipX: true }, 'commit');
    fireEvent.click(screen.getByLabelText('Flip vertically'));
    expect(p.onChange).toHaveBeenLastCalledWith({ flipY: true }, 'commit');
  });
  it('turns the border on and edits it', () => {
    const p = setup({ ...image, border: { color: '#000000', width: 4 } });
    type('Border width', 9);
    expect(p.onChange).toHaveBeenLastCalledWith({ border: { color: '#000000', width: 9 } }, 'commit');
    fireEvent.click(screen.getByLabelText('Border'));
    expect(p.onChange).toHaveBeenLastCalledWith({ border: undefined }, 'commit');
  });
  it('adds a border with defaults', () => {
    const p = setup();
    fireEvent.click(screen.getByLabelText('Border'));
    expect(p.onChange.mock.calls.at(-1)![0].border).toEqual({ color: '#000000', width: 4 });
  });
  it('edits the shadow', () => {
    const p = setup({ ...image, shadow: { color: '#000000', blur: 12, x: 4, y: 4, opacity: 0.4 } });
    type('Shadow X', -6);
    expect(p.onChange.mock.calls.at(-1)![0].shadow).toMatchObject({ x: -6, y: 4 });
    type('Shadow blur', 20);
    expect(p.onChange).toHaveBeenLastCalledWith({ shadow: expect.objectContaining({ blur: 20 }) }, 'preview');
    type('Shadow colour', '#ff0000');
    expect(p.onChange.mock.calls.at(-1)![0].shadow.color).toBe('#ff0000');
  });
  it('resizes keeping the ratio and the centre', () => {
    const p = setup();
    type('Width', 200);
    expect(p.onChange).toHaveBeenLastCalledWith({ w: 200, h: 100, x: 200, y: 100 }, 'commit');
    fireEvent.click(screen.getByLabelText('Unlock the ratio'));
    expect(screen.getByLabelText('Keep the ratio')).toBeTruthy();
  });
  it('resizes freely when the ratio is released', () => {
    const p = setup();
    fireEvent.click(screen.getByLabelText('Unlock the ratio'));
    type('Height', 100);
    expect(p.onChange).toHaveBeenLastCalledWith({ w: 400, h: 100, x: 100, y: 100 }, 'commit');
  });
  it('never goes below the smallest size', () => {
    const p = setup();
    fireEvent.click(screen.getByLabelText('Unlock the ratio'));
    type('Width', 1);
    expect(p.onChange.mock.calls.at(-1)![0].w).toBe(8);
  });
  it('sets position and rotation, and resets the turn', () => {
    const p = setup();
    type('X', 7);
    expect(p.onChange).toHaveBeenLastCalledWith({ x: 7 }, 'commit');
    type('Rotation in degrees', 45);
    expect(p.onChange).toHaveBeenLastCalledWith({ rotation: 45 }, 'commit');
    fireEvent.click(screen.getByLabelText('Reset the turn'));
    expect(p.onChange).toHaveBeenLastCalledWith({ rotation: 0 }, 'commit');
  });
  it('ignores an empty number field', () => {
    const p = setup();
    type('X', '');
    expect(p.onChange).not.toHaveBeenCalled();
  });
  it('calls the align buttons', () => {
    const p = setup();
    for (const [label, kind] of [['Align top', 'top'], ['Align middle', 'middle'], ['Align bottom', 'bottom'], ['Align left', 'left'], ['Align center', 'center'], ['Align right', 'right']] as const) {
      fireEvent.click(screen.getByLabelText(label));
      expect(p.onAlign).toHaveBeenLastCalledWith(kind);
    }
  });
  it('calls order, duplicate and delete', () => {
    const p = setup();
    fireEvent.click(screen.getByLabelText('Bring to front'));
    fireEvent.click(screen.getByLabelText('Bring forward'));
    fireEvent.click(screen.getByLabelText('Send backward'));
    fireEvent.click(screen.getByLabelText('Send to back'));
    expect(p.onOrder.mock.calls.map((c) => c[0])).toEqual(['front', 'forward', 'backward', 'back']);
    fireEvent.click(screen.getByLabelText('Duplicate'));
    fireEvent.click(screen.getByLabelText('Delete'));
    expect(p.onDuplicate).toHaveBeenCalled();
    expect(p.onDelete).toHaveBeenCalled();
  });
  it('locks', () => {
    const p = setup();
    fireEvent.click(screen.getByLabelText('Lock'));
    expect(p.onChange).toHaveBeenLastCalledWith({ locked: true }, 'commit');
  });
  it('a picture has frames, corner radius and the effects panel', () => {
    const p = setup();
    fireEvent.click(screen.getByLabelText('Heart frame'));
    expect(p.onChange).toHaveBeenLastCalledWith({ frame: 'heart' }, 'commit');
    fireEvent.click(screen.getByLabelText('No frame'));
    expect(p.onChange).toHaveBeenLastCalledWith({ frame: undefined }, 'commit');
    expect(screen.getByLabelText('Corner radius')).toBeTruthy();
    expect(screen.getByLabelText('Brightness')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Mask'));
    expect(p.onChange.mock.calls.at(-1)![0].mask).toBeTruthy();
  });
  it('effects changes become a patch of the picture', () => {
    const p = setup({ ...image, adjust: { brightness: 10 } });
    type('Brightness', 30);
    expect(p.onChange).toHaveBeenLastCalledWith({ adjust: { brightness: 30 } }, 'commit');
  });
  it('a shape has fill and stroke controls, no frames and no effects', () => {
    const p = setup(rect);
    expect(screen.queryByLabelText('Heart frame')).toBeNull();
    expect(screen.queryByLabelText('Brightness')).toBeNull();
    type('Fill colour', '#00ff00');
    expect(p.onChange).toHaveBeenLastCalledWith({ fill: '#00ff00' }, 'commit');
    fireEvent.click(screen.getByLabelText('Stroke'));
    expect(p.onChange.mock.calls.at(-1)![0].stroke).toMatchObject({ width: 6 });
    expect(screen.getByLabelText('Corner radius')).toBeTruthy();
  });
  it('an arrow has stroke width, dash and a line end, but no fill and no corners', () => {
    const p = setup(arrow);
    expect(screen.queryByLabelText('Fill')).toBeNull();
    expect(screen.queryByLabelText('Corner radius')).toBeNull();
    fireEvent.click(screen.getByLabelText('Dashed'));
    expect(p.onChange).toHaveBeenLastCalledWith({ stroke: { color: '#ff0000', width: 6, dash: true } }, 'commit');
    type('Stroke width', 10);
    expect(p.onChange.mock.calls.at(-1)![0].stroke.width).toBe(10);
    fireEvent.change(screen.getByLabelText('Line end'), { target: { value: 'line' } });
    expect(p.onChange).toHaveBeenLastCalledWith({ shape: 'line' }, 'commit');
  });
});
