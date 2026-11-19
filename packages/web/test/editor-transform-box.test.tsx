// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TransformBox, cursorFor } from '../src/editor/TransformBox.tsx';
import { extents } from '../src/editor/transform-math.ts';
import type { LayerBox } from '../src/video/contracts.ts';

afterEach(cleanup);

/** jsdom has no PointerEvent, so a pointer event is sent as a mouse event of the same name. */
const pointer = (el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', x = 0, y = 0, mods: { shiftKey?: boolean; altKey?: boolean } = {}) =>
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0, ...mods }));
  });

const box: LayerBox = { id: 'a', cx: 400, cy: 300, w: 200, h: 100, rotation: 0 };
const frame = { w: 800, h: 600 };

function setup(over: Partial<LayerBox> = {}, k = 1) {
  const onChange = vi.fn();
  const onCancel = vi.fn();
  const b = { ...box, ...over };
  const view = render(<TransformBox box={b} view={{ left: 0, top: 0, k }} frame={frame} onChange={onChange} onCancel={onCancel} />);
  const h = (name: string) => view.container.querySelector(`[data-handle="${name}"]`)!;
  return { onChange, onCancel, view, h, outline: view.container.querySelector('.tbox')!, body: view.container.querySelector('[data-part="body"]')! };
}

describe('TransformBox', () => {
  it('draws eight resize handles and a rotate handle for a normal box', () => {
    const { view } = setup();
    expect(view.container.querySelectorAll('[data-handle]').length).toBe(9);
  });

  it('a corner drag is proportional: previews on every move, ends once', () => {
    const { onChange, h } = setup();
    const se = h('se');
    pointer(se, 'pointerdown', 500, 350);
    pointer(se, 'pointermove', 600, 400);
    pointer(se, 'pointermove', 700, 450);
    pointer(se, 'pointerup', 700, 450);
    const modes = onChange.mock.calls.map((c) => c[1]);
    expect(modes).toEqual(['preview', 'preview', 'end']);
    const last = onChange.mock.calls[2]![0] as LayerBox;
    // Top-left stays at 300,250; the pointer is 200 right and 100 down of the old corner -> ratio 2:1 kept.
    expect(last.w / last.h).toBeCloseTo(2, 9);
    expect(last.cx - last.w / 2).toBeCloseTo(300, 9);
    expect(last.cy - last.h / 2).toBeCloseTo(250, 9);
    expect(last.w).toBeCloseTo(400, 9);
  });

  it('Shift frees a corner', () => {
    const { onChange, h } = setup();
    pointer(h('se'), 'pointerdown', 500, 350);
    pointer(h('se'), 'pointermove', 700, 350, { shiftKey: true });
    const b = onChange.mock.calls[0]![0] as LayerBox;
    expect(b.w).toBeCloseTo(400, 9);
    expect(b.h).toBeCloseTo(100, 9);
  });

  it('an edge changes one side; Shift makes it proportional', () => {
    const a = setup();
    pointer(a.h('e'), 'pointerdown', 500, 300);
    pointer(a.h('e'), 'pointermove', 600, 300);
    expect((a.onChange.mock.calls[0]![0] as LayerBox).h).toBeCloseTo(100, 9);
    expect((a.onChange.mock.calls[0]![0] as LayerBox).w).toBeCloseTo(300, 9);
    cleanup();
    const b = setup();
    pointer(b.h('e'), 'pointerdown', 500, 300);
    pointer(b.h('e'), 'pointermove', 600, 300, { shiftKey: true });
    expect((b.onChange.mock.calls[0]![0] as LayerBox).h).toBeCloseTo(150, 9);
  });

  it('does not jump when the handle is grabbed off its centre', () => {
    const { onChange, h } = setup();
    pointer(h('e'), 'pointerdown', 505, 310);
    pointer(h('e'), 'pointermove', 505, 310);
    expect((onChange.mock.calls[0]![0] as LayerBox).w).toBeCloseTo(200, 9);
  });

  it('Alt resizes from the centre', () => {
    const { onChange, h } = setup();
    pointer(h('e'), 'pointerdown', 500, 300);
    pointer(h('e'), 'pointermove', 600, 300, { altKey: true });
    const b = onChange.mock.calls[0]![0] as LayerBox;
    expect(b.cx).toBeCloseTo(400, 9);
    expect(b.w).toBeCloseTo(400, 9);
  });

  it('works through the scale k from frame to CSS pixels', () => {
    const { onChange, h } = setup({}, 0.8);
    pointer(h('e'), 'pointerdown', 400, 240);
    pointer(h('e'), 'pointermove', 440, 240);
    expect((onChange.mock.calls[0]![0] as LayerBox).w).toBeCloseTo(250, 9);
  });

  it('the body moves the box', () => {
    const { onChange, body } = setup();
    pointer(body, 'pointerdown', 400, 300);
    pointer(body, 'pointermove', 430, 280);
    pointer(body, 'pointerup', 430, 280);
    const last = onChange.mock.calls.at(-1)!;
    expect(last[1]).toBe('end');
    expect(last[0]).toMatchObject({ cx: 430, cy: 280 });
  });

  it('the rotate handle turns by the swept angle, Shift snaps to 15', () => {
    const { onChange, h } = setup();
    pointer(h('rotate'), 'pointerdown', 400, 222);
    // Straight to the right of the centre is 90 degrees.
    pointer(h('rotate'), 'pointermove', 600, 300);
    expect((onChange.mock.calls[0]![0] as LayerBox).rotation).toBeCloseTo(90, 9);
    const r = (38 * Math.PI) / 180;
    pointer(h('rotate'), 'pointermove', 400 + 100 * Math.sin(r), 300 - 100 * Math.cos(r), { shiftKey: true });
    expect((onChange.mock.calls[1]![0] as LayerBox).rotation).toBeCloseTo(45, 9);
  });

  it('resizes a rotated box with the opposite corner fixed', () => {
    const { onChange, h } = setup({ rotation: 90 });
    // At 90 degrees the "se" handle is at the bottom-left of the frame picture: (350, 400).
    pointer(h('se'), 'pointerdown', 350, 400);
    pointer(h('se'), 'pointermove', 350, 500, { shiftKey: true });
    const b = onChange.mock.calls[0]![0] as LayerBox;
    const e = extents(b);
    // The nw corner (top-right after the turn, at 450,200) must not have moved.
    expect(e.y).toBeCloseTo(200, 9);
    expect(e.x + e.w).toBeCloseTo(450, 9);
  });

  it('Escape puts the box back and calls onCancel, with no end', () => {
    const { onChange, onCancel, h } = setup();
    pointer(h('se'), 'pointerdown', 500, 350);
    pointer(h('se'), 'pointermove', 600, 400);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onChange.mock.calls.at(-1)).toEqual([box, 'preview']);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls.some((c) => c[1] === 'end')).toBe(false);
    // The drag is over: further moves and the release do nothing.
    const n = onChange.mock.calls.length;
    pointer(h('se'), 'pointermove', 650, 420);
    pointer(h('se'), 'pointerup', 650, 420);
    expect(onChange.mock.calls.length).toBe(n);
  });

  it('Escape without onCancel ends with the starting box', () => {
    const onChange = vi.fn();
    const v = render(<TransformBox box={box} view={{ left: 0, top: 0, k: 1 }} frame={frame} onChange={onChange} />);
    const se = v.container.querySelector('[data-handle="se"]')!;
    pointer(se, 'pointerdown', 500, 350);
    pointer(se, 'pointermove', 600, 400);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onChange.mock.calls.at(-1)).toEqual([box, 'end']);
  });

  it('a press without movement sends nothing', () => {
    const { onChange, body } = setup();
    pointer(body, 'pointerdown', 400, 300);
    pointer(body, 'pointerup', 400, 300);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('arrow keys nudge 1px, Shift 10px, each as one finished change', () => {
    const { onChange, outline } = setup();
    fireEvent.keyDown(outline, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ ...box, cx: 401 }, 'end');
    fireEvent.keyDown(outline, { key: 'ArrowUp', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith({ ...box, cy: 290 }, 'end');
  });

  it('gives every handle a role and a name', () => {
    const { view, h } = setup();
    expect(h('nw').getAttribute('role')).toBe('button');
    expect(h('nw').getAttribute('aria-label')).toBe('Resize from top left');
    expect(h('rotate').getAttribute('aria-label')).toBe('Rotate');
    expect(view.container.querySelectorAll('[data-handle][aria-label]').length).toBe(9);
  });

  it('arrow keys on a handle resize (Shift: 10) and do not nudge the body', () => {
    const { onChange, h } = setup();
    fireEvent.keyDown(h('e'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledTimes(1);
    let last = onChange.mock.calls[0]![0] as LayerBox;
    expect(onChange.mock.calls[0]![1]).toBe('end');
    expect(last.w).toBeCloseTo(201, 9);
    expect(last.cx - last.w / 2).toBeCloseTo(300, 9);
    fireEvent.keyDown(h('s'), { key: 'ArrowDown', shiftKey: true });
    last = onChange.mock.calls[1]![0] as LayerBox;
    expect(last.h).toBeCloseTo(110, 9);
    fireEvent.keyDown(h('e'), { key: 'ArrowLeft', shiftKey: true });
    expect((onChange.mock.calls[2]![0] as LayerBox).w).toBeCloseTo(190, 9);
  });

  it('arrow keys on the rotate handle turn the box', () => {
    const { onChange, h } = setup();
    fireEvent.keyDown(h('rotate'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ ...box, rotation: 1 }, 'end');
    fireEvent.keyDown(h('rotate'), { key: 'ArrowLeft', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith({ ...box, rotation: -15 }, 'end');
  });

  it('keeps handles reachable on a tiny box: corners pushed out, short-side middles dropped', () => {
    const { view, h } = setup({ w: 20, h: 20 });
    expect(view.container.querySelectorAll('[data-handle]').length).toBe(5);
    expect(h('nw').getAttribute('style')).toContain('-14px');
  });

  it('picks the resize cursor from the handle and the turn', () => {
    expect(cursorFor('e', 0)).toBe('ew-resize');
    expect(cursorFor('se', 0)).toBe('nwse-resize');
    expect(cursorFor('e', 90)).toBe('ns-resize');
    expect(cursorFor('se', 45)).toBe('ns-resize');
    expect(cursorFor('ne', 0)).toBe('nesw-resize');
  });
});
