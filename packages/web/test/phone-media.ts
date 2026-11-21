/** A matchMedia stand-in for phone tests: `setWidthRem` flips (max-width: Nrem) queries and notifies listeners. */
type Listener = () => void;
export function installMatchMedia(widthRem: number) {
  let width = widthRem;
  const listeners = new Set<{ q: string; fn: Listener }>();
  const matches = (q: string) => {
    const m = /max-width:\s*([\d.]+)rem/.exec(q);
    return m ? width <= Number(m[1]) : false;
  };
  (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
    get matches() {
      return matches(q);
    },
    media: q,
    addEventListener: (_: string, fn: Listener) => listeners.add({ q, fn }),
    removeEventListener: (_: string, fn: Listener) => {
      for (const l of listeners) if (l.fn === fn) listeners.delete(l);
    },
  });
  return {
    setWidthRem(w: number) {
      width = w;
      for (const l of [...listeners]) l.fn();
    },
    uninstall() {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    },
  };
}

import { act } from '@testing-library/react';

/** jsdom's PointerEvent drops coordinates, so a pointer event is a mouse event of the same name with a pointerId. */
let clock = 0;
export function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', pointerId: number, x: number, y: number): void {
  act(() => {
    const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'pointerId', { value: pointerId });
    clock += 50; // a steady 50 ms between events, so release velocity is deterministic
    Object.defineProperty(e, 'timeStamp', { value: clock });
    el.dispatchEvent(e);
  });
}
