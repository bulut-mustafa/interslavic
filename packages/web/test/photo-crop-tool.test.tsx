// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CropTool } from '../src/photo/CropTool.tsx';
import type { Geometry } from '../src/photo/doc.ts';
import { screen } from './live-screen.ts';

afterEach(cleanup);

/** jsdom has no PointerEvent, so a pointer event is sent as a mouse event of the same name. */
const pointer = (el: Element, type: string, x = 0, y = 0) =>
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 }));
  });

const src = { w: 400, h: 200 };
function setup(geometry: Geometry = {}, k = 1) {
  const onChange = vi.fn();
  const onApply = vi.fn();
  const onCancel = vi.fn();
  const view = render(<CropTool src={src} geometry={geometry} view={{ left: 10, top: 20, k }} onChange={onChange} onApply={onApply} onCancel={onCancel} />);
  const h = (n: string) => view.container.querySelector(`[data-handle="${n}"]`)!;
  return { onChange, onApply, onCancel, h, view };
}

describe('CropTool', () => {
  it('has eight named, focusable handles and a move area', () => {
    const { h, view } = setup();
    for (const n of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      expect(h(n).getAttribute('tabindex')).toBe('0');
      expect(h(n).getAttribute('aria-label')).toMatch(/^Crop: resize from /);
    }
    expect(screen.getByLabelText(/^Resize from|Crop: resize from bottom right/)).toBeTruthy();
    expect(view.container.querySelector('[data-part="body"]')).toBeTruthy();
  });

  it('a handle drag previews on every move and ends once with a crop in original pixels', () => {
    const { onChange, h } = setup({}, 1);
    const e = h('e');
    pointer(e, 'pointerdown', 400, 100);
    pointer(e, 'pointermove', 300, 100);
    pointer(e, 'pointermove', 200, 100);
    pointer(e, 'pointerup', 200, 100);
    expect(onChange.mock.calls.map((c) => c[1])).toEqual(['preview', 'preview', 'end']);
    expect(onChange.mock.calls[2]![0].crop).toEqual({ x: 0, y: 0, w: 200, h: 200 });
  });

  it('divides the pointer distance by the view scale', () => {
    const { onChange, h } = setup({}, 0.5);
    pointer(h('e'), 'pointerdown', 200, 50);
    pointer(h('e'), 'pointermove', 100, 50);
    pointer(h('e'), 'pointerup', 100, 50);
    expect(onChange.mock.calls.at(-1)![0].crop.w).toBe(200);
  });

  it('moves the box by its body', () => {
    const { onChange, view } = setup({ crop: { x: 0, y: 0, w: 100, h: 100 } });
    const body = view.container.querySelector('[data-part="body"]')!;
    pointer(body, 'pointerdown', 50, 50);
    pointer(body, 'pointermove', 90, 70);
    pointer(body, 'pointerup', 90, 70);
    expect(onChange.mock.calls.at(-1)![0].crop).toEqual({ x: 40, y: 20, w: 100, h: 100 });
  });

  it('a locked aspect keeps the ratio while dragging', () => {
    const { onChange, h } = setup({ crop: { x: 0, y: 0, w: 100, h: 100 } });
    fireEvent.click(screen.getByRole('button', { name: '16:9' }));
    onChange.mockClear();
    pointer(h('se'), 'pointerdown', 100, 100);
    pointer(h('se'), 'pointermove', 140, 100);
    pointer(h('se'), 'pointerup', 140, 100);
    const c = onChange.mock.calls.at(-1)![0].crop;
    expect(c.w / c.h).toBeCloseTo(16 / 9, 1);
  });

  it('picking an aspect ends with the largest box of that ratio', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: '1:1' }));
    const [g, mode] = onChange.mock.calls[0]!;
    expect(mode).toBe('end');
    expect(g.crop.w).toBe(g.crop.h);
    expect(g.crop.w).toBe(200);
  });

  it('arrow keys on a handle resize, Shift for larger steps', () => {
    const { onChange, h } = setup({ crop: { x: 0, y: 0, w: 100, h: 100 } });
    fireEvent.keyDown(h('e'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ crop: { x: 0, y: 0, w: 101, h: 100 } }), 'end');
    fireEvent.keyDown(h('e'), { key: 'ArrowRight', shiftKey: true });
    expect(onChange.mock.calls.at(-1)![0].crop.w).toBe(110);
  });

  it('straighten sends preview then one end; a double click resets', () => {
    const { onChange } = setup({ straighten: 10 });
    const s = screen.getByLabelText('Straighten');
    fireEvent.change(s, { target: { value: '12' } });
    fireEvent.pointerUp(s);
    expect(onChange.mock.calls.map((c) => [c[0].straighten, c[1]])).toEqual([[12, 'preview'], [12, 'end']]);
    onChange.mockClear();
    fireEvent.doubleClick(s);
    expect(onChange.mock.calls.at(-1)).toEqual([expect.not.objectContaining({ straighten: expect.anything() }), 'end']);
  });

  it('rotates and flips', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));
    expect(onChange.mock.calls.at(-1)![0].turns).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Rotate left' }));
    expect(onChange.mock.calls.at(-1)![0].turns).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'Flip horizontal' }));
    expect(onChange.mock.calls.at(-1)![0].flipX).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Flip vertical' }));
    expect(onChange.mock.calls.at(-1)![0].flipY).toBe(true);
  });

  it('shows the size in pixels', () => {
    setup({ crop: { x: 0, y: 0, w: 300, h: 120 } });
    expect(screen.getByText('300 × 120 px')).toBeTruthy();
  });

  it('Apply and Cancel buttons; Enter applies and Escape cancels', () => {
    const { onApply, onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onApply).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('icon-only buttons have tooltips opening on top', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Rotate left' }).getAttribute('data-side')).toBe('top');
  });
});
