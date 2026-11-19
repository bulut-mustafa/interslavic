// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { LayerCanvas } from '../src/editor/LayerCanvas.tsx';
import { newLayer } from '../src/editor/layers.ts';

const ctx = new Proxy({ measureText: (s: string) => ({ width: s.length * 10 }) } as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : () => {}), set: () => true });
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  HTMLCanvasElement.prototype.setPointerCapture = (() => {}) as never;
});
afterEach(cleanup);

const fire = (el: Element, type: string, x = 0, y = 0) => act(() => void el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })));
const hello = newLayer({ x: 100, y: 100, text: 'hello' });

function setup() {
  const p = { select: vi.fn(), drag: vi.fn(), end: vi.fn() };
  const view = render(<LayerCanvas width={800} height={600} layers={[hello]} selectedId={hello.id} onSelect={p.select} onDrag={p.drag} onDragEnd={p.end} />);
  return { ...p, canvas: view.container.querySelector('canvas')! };
}

describe('LayerCanvas pointer cancel', () => {
  it('ends a moved drag once, and a later pointer move does nothing', () => {
    const { canvas, drag, end } = setup();
    fire(canvas, 'pointerdown', 120, 110);
    fire(canvas, 'pointermove', 220, 160);
    fire(canvas, 'pointercancel');
    expect(end).toHaveBeenCalledTimes(1);
    drag.mockClear();
    fire(canvas, 'pointermove', 300, 300);
    expect(drag).not.toHaveBeenCalled();
    fire(canvas, 'pointerup');
    expect(end).toHaveBeenCalledTimes(1);
  });
  it('does not report a drag that never moved', () => {
    const { canvas, end } = setup();
    fire(canvas, 'pointerdown', 120, 110);
    fire(canvas, 'pointercancel');
    expect(end).not.toHaveBeenCalled();
  });
});
