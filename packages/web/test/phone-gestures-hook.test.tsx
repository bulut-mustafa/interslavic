// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { pointer } from './phone-media.ts';
import { useRef } from 'react';
import { useGestures, type GestureHandlers } from '../src/phone/useGestures.ts';

let handlers: GestureHandlers;
function Surface() {
  const ref = useRef<HTMLDivElement>(null);
  useGestures(ref, handlers);
  return <div ref={ref} data-testid="s" />;
}
const el = () => document.querySelector('[data-testid=s]') as HTMLElement;
const fireEvent = {
  pointerDown: (e: Element, a: [number, number, number]) => pointer(e, 'pointerdown', ...a),
  pointerMove: (e: Element, a: [number, number, number]) => pointer(e, 'pointermove', ...a),
  pointerUp: (e: Element, a: [number, number, number]) => pointer(e, 'pointerup', ...a),
  pointerCancel: (e: Element, a: [number, number, number]) => pointer(e, 'pointercancel', ...a),
};
const p = (id: number, x: number, y: number): [number, number, number] => [id, x, y];

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('useGestures', () => {
  it('tap and double tap', () => {
    handlers = { onTap: vi.fn(), onDoubleTap: vi.fn() };
    render(<Surface />);
    for (let n = 0; n < 2; n++) {
      fireEvent.pointerDown(el(), p(1, 10, 10));
      fireEvent.pointerUp(el(), p(1, 10, 10));
      vi.advanceTimersByTime(100);
    }
    expect(handlers.onTap).toHaveBeenCalledTimes(2);
    expect(handlers.onDoubleTap).toHaveBeenCalledTimes(1);
  });

  it('drag starts after 10px, reports steps, and is not a tap', () => {
    handlers = { onTap: vi.fn(), onDragStart: vi.fn(), onDrag: vi.fn(), onDragEnd: vi.fn() };
    render(<Surface />);
    fireEvent.pointerDown(el(), p(1, 0, 0));
    fireEvent.pointerMove(el(), p(1, 5, 0));
    expect(handlers.onDragStart).not.toHaveBeenCalled();
    fireEvent.pointerMove(el(), p(1, 20, 0));
    fireEvent.pointerMove(el(), p(1, 30, 5));
    fireEvent.pointerUp(el(), p(1, 30, 5));
    expect(handlers.onDragStart).toHaveBeenCalledTimes(1);
    expect(handlers.onDrag).toHaveBeenCalledWith(expect.objectContaining({ dx: 30, dy: 5, stepX: 10 }));
    expect(handlers.onDragEnd).toHaveBeenCalledTimes(1);
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('long press after 450ms; moving more than 10px cancels it', () => {
    handlers = { onLongPress: vi.fn(), onTap: vi.fn() };
    render(<Surface />);
    fireEvent.pointerDown(el(), p(1, 0, 0));
    vi.advanceTimersByTime(449);
    expect(handlers.onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(handlers.onLongPress).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(el(), p(1, 0, 0));
    expect(handlers.onTap).not.toHaveBeenCalled();

    fireEvent.pointerDown(el(), p(2, 0, 0));
    fireEvent.pointerMove(el(), p(2, 30, 0));
    vi.advanceTimersByTime(600);
    expect(handlers.onLongPress).toHaveBeenCalledTimes(1);
  });

  it('two pointers give scale, rotation and pan about the midpoint; cancel ends it', () => {
    handlers = { onTransformStart: vi.fn(), onTransform: vi.fn(), onTransformEnd: vi.fn(), onTap: vi.fn() };
    render(<Surface />);
    fireEvent.pointerDown(el(), p(1, 100, 100));
    fireEvent.pointerDown(el(), p(2, 200, 100));
    expect(handlers.onTransformStart).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(el(), p(2, 100, 300)); // distance 100 -> 200, pointing right -> pointing down
    const last = (handlers.onTransform as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(last.scale).toBeCloseTo(2);
    expect(last.rotation).toBeCloseTo(90);
    expect(last.cx).toBeCloseTo(100);
    expect(last.cy).toBeCloseTo(200);
    expect(last.dx).toBeCloseTo(-50);
    fireEvent.pointerCancel(el(), p(2, 100, 300));
    expect(handlers.onTransformEnd).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(el(), p(1, 100, 100));
    expect(handlers.onTap).not.toHaveBeenCalled();
  });

  it('blocks Safari gesturestart and sets user-select none', () => {
    handlers = {};
    render(<Surface />);
    const ev = new Event('gesturestart', { cancelable: true });
    el().dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(el().style.userSelect).toBe('none');
  });
});
