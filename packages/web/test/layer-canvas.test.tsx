// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { LayerCanvas, renderScene } from '../src/editor/LayerCanvas.tsx';
import { newLayer } from '../src/editor/layers.ts';

const calls: string[] = [];
const ctx: Record<string, unknown> = new Proxy(
  { measureText: (s: string) => ({ width: s.length * 10 }) },
  { get: (t: Record<string, unknown>, k: string) => (k in t ? t[k] : (...a: unknown[]) => void calls.push(`${k}:${a[0] ?? ''}`)), set: () => true },
);

beforeEach(() => {
  calls.length = 0;
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.setPointerCapture = (() => {}) as never;
});
afterEach(cleanup);

/** jsdom has no PointerEvent, so a pointer event is sent as a mouse event of the same name. */
const pointer = (el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', x = 0, y = 0) =>
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
  });

const hello = newLayer({ x: 100, y: 100, text: 'hello' });

function setup(layers = [hello]) {
  const p = { select: vi.fn(), drag: vi.fn(), end: vi.fn(), base: vi.fn() };
  const view = render(<LayerCanvas width={800} height={600} drawBase={p.base} layers={layers} selectedId={layers[0]?.id ?? null} onSelect={p.select} onDrag={p.drag} onDragEnd={p.end} />);
  return { ...p, canvas: view.container.querySelector('canvas')! };
}

describe('renderScene', () => {
  it('draws the picture, then the erase patch, then the text, and marks the selected layer last', () => {
    const l = { ...hello, erase: { x: 1, y: 2, w: 3, h: 4, color: 'rgb(1, 2, 3)' } };
    const order: string[] = [];
    const c = { clearRect: () => order.push('clear'), fillRect: () => order.push('patch'), save: () => {}, restore: () => {}, beginPath: () => {}, roundRect: () => {}, fill: () => {}, strokeText: () => {}, fillText: () => order.push('text'), strokeRect: () => order.push('select'), setLineDash: () => {}, measureText: (s: string) => ({ width: s.length * 10 }) } as unknown as CanvasRenderingContext2D;
    renderScene(c, { w: 800, h: 600 }, () => order.push('base'), [l], l.id);
    expect(order[0]).toBe('clear');
    expect(order.indexOf('base')).toBeLessThan(order.indexOf('patch'));
    expect(order.indexOf('patch')).toBeLessThan(order.indexOf('text'));
    expect(order.at(-1)).toBe('select');
  });
  it('draws no selection mark when nothing is selected', () => {
    const order: string[] = [];
    const c = { clearRect: () => {}, save: () => {}, restore: () => {}, beginPath: () => {}, roundRect: () => {}, fill: () => {}, strokeText: () => {}, fillText: () => {}, strokeRect: () => order.push('select'), setLineDash: () => {}, measureText: (s: string) => ({ width: s.length * 10 }) } as unknown as CanvasRenderingContext2D;
    renderScene(c, { w: 800, h: 600 }, () => {}, [hello], null);
    expect(order).toEqual([]);
  });
});

describe('LayerCanvas', () => {
  it('calls the base drawing when it draws', () => {
    expect(setup().base).toHaveBeenCalled();
  });

  it('selects the text under the pointer, and nothing when it misses', () => {
    const { canvas, select } = setup();
    pointer(canvas, 'pointerdown', 120, 110);
    expect(select).toHaveBeenLastCalledWith(hello.id);
    pointer(canvas, 'pointerdown', 700, 500);
    expect(select).toHaveBeenLastCalledWith(null);
  });

  it('moves the text with the pointer, keeping the grab point, and reports the end of the drag once', () => {
    const { canvas, drag, end } = setup();
    pointer(canvas, 'pointerdown', 120, 110);
    pointer(canvas, 'pointermove', 220, 160);
    expect(drag).toHaveBeenLastCalledWith(hello.id, 200, 150);
    pointer(canvas, 'pointerup');
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('does not report a drag when the pointer did not move', () => {
    const { canvas, end } = setup();
    pointer(canvas, 'pointerdown', 120, 110);
    pointer(canvas, 'pointerup');
    expect(end).not.toHaveBeenCalled();
  });

  it('keeps the text from leaving the frame', () => {
    const { canvas, drag } = setup();
    pointer(canvas, 'pointerdown', 120, 110);
    pointer(canvas, 'pointermove', 9000, 9000);
    expect(drag).toHaveBeenLastCalledWith(hello.id, 776, 576);
  });

  it('nudges the selected text with the arrow keys, ten pixels with shift', () => {
    const { canvas, drag, end } = setup();
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    expect(drag).toHaveBeenLastCalledWith(hello.id, 101, 100);
    fireEvent.keyDown(canvas, { key: 'ArrowUp', shiftKey: true });
    expect(drag).toHaveBeenLastCalledWith(hello.id, 100, 90);
    expect(end).toHaveBeenCalledTimes(2);
  });

  it('ignores other keys', () => {
    const { canvas, drag } = setup();
    fireEvent.keyDown(canvas, { key: 'a' });
    expect(drag).not.toHaveBeenCalled();
  });
});
