// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { computeViewport, counterScroll, focusNoScroll, installViewportLock } from '../src/phone/viewportLock.ts';
import { centerScrollTop } from '../src/phone/sheetMath.ts';
import { BottomSheet } from '../src/phone/BottomSheet.tsx';
import { ToolStrip, type StripItem } from '../src/phone/ToolStrip.tsx';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('computeViewport', () => {
  it('reads the keyboard from the layout bottom edge, including a pan offset', () => {
    expect(computeViewport({ innerHeight: 800, vvHeight: 500, vvOffsetTop: 0, vvScale: 1 })).toEqual({ vvh: 500, top: 0, kb: 300 });
    expect(computeViewport({ innerHeight: 800, vvHeight: 500, vvOffsetTop: 120, vvScale: 1 })).toEqual({ vvh: 500, top: 120, kb: 180 });
  });
  it('ignores browser chrome and pinch-zoom', () => {
    expect(computeViewport({ innerHeight: 800, vvHeight: 760, vvOffsetTop: 0, vvScale: 1 }).kb).toBe(0);
    expect(computeViewport({ innerHeight: 800, vvHeight: 400, vvOffsetTop: 0, vvScale: 2 }).kb).toBe(0);
  });
});

describe('focusNoScroll', () => {
  it('focuses with preventScroll', () => {
    const input = document.createElement('input');
    document.body.append(input);
    const calls: unknown[] = [];
    const real = input.focus.bind(input);
    input.focus = (o?: FocusOptions) => {
      calls.push(o);
      real(o);
    };
    focusNoScroll(input);
    expect(calls).toEqual([{ preventScroll: true }]);
    expect(document.activeElement).toBe(input);
    expect(() => focusNoScroll(null)).not.toThrow();
  });
});

describe('counterScroll and the lock', () => {
  it('resets scrolled shell boxes', () => {
    document.body.innerHTML = '<div class="ph-app"></div>';
    const app = document.querySelector('.ph-app') as HTMLElement;
    app.scrollTop = 40;
    // jsdom has no layout, so scrollTop assignment sticks only if we define it
    let top = 40;
    Object.defineProperty(app, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => (top = v) });
    expect(counterScroll(document)).toBe(true);
    expect(top).toBe(0);
  });

  it('is a no-op without visualViewport and cleans up with it', () => {
    expect(installViewportLock(window)()).toBeUndefined();
    const listeners: Record<string, () => void> = {};
    const vv = { height: 500, offsetTop: 0, scale: 1, addEventListener: (t: string, f: () => void) => (listeners[t] = f), removeEventListener: () => {} };
    const fake = Object.create(window, { visualViewport: { value: vv }, innerHeight: { value: 800 } }) as Window;
    Object.defineProperty(fake, 'document', { value: document });
    const off = installViewportLock(fake);
    expect(document.documentElement.style.getPropertyValue('--kb')).toBe('300px');
    expect(document.documentElement.classList.contains('ph-kb-open')).toBe(true);
    off();
    expect(document.documentElement.classList.contains('ph-kb-open')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--kb')).toBe('');
  });
});

describe('sheet content', () => {
  it('centerScrollTop centres the field and never goes negative', () => {
    expect(centerScrollTop(100, { top: 0, height: 400 }, { top: 300, height: 40 })).toBe(220);
    expect(centerScrollTop(0, { top: 0, height: 400 }, { top: 10, height: 20 })).toBe(0);
  });
  it('the body is the scroller, held apart from the draggable head', () => {
    render(
      <BottomSheet open onClose={() => {}} title="T">
        <textarea aria-label="note" />
      </BottomSheet>,
    );
    const body = document.querySelector('.ph-sheet-body') as HTMLElement;
    expect(body.querySelector('textarea')).toBeTruthy();
    expect(body.closest('.ph-sheet-head')).toBeNull();
    expect(document.querySelector('.ph-sheet-head')!.contains(body)).toBe(false);
  });
});

describe('ToolStrip remount and events', () => {
  const a: StripItem[] = [{ id: 'a', label: 'A', icon: <i /> }, { id: 'b', label: 'B', icon: <i /> }];
  it('keeps the same scroller when only the selection changes', () => {
    const { rerender } = render(<ToolStrip items={a} selected={null} onSelect={() => {}} mode="m" />);
    const first = document.querySelector('.ph-strip');
    rerender(<ToolStrip items={[...a]} selected="a" onSelect={() => {}} mode="m" />);
    rerender(<ToolStrip items={[...a]} selected="b" onSelect={() => {}} mode="m" />);
    expect(document.querySelector('.ph-strip')).toBe(first);
  });
  it('does not stop unrelated events from reaching ancestors', () => {
    let seen = 0;
    render(
      <div onPointerDown={() => seen++} onTouchMove={() => seen++}>
        <ToolStrip items={a} onSelect={() => {}} />
      </div>,
    );
    const strip = document.querySelector('.ph-strip')!;
    fireEvent.pointerDown(strip);
    fireEvent.touchMove(strip);
    expect(seen).toBe(2);
  });
  it('scrolls itself, not its ancestors, to the selected tool', () => {
    const calls: unknown[] = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = () => calls.push('into-view');
    try {
      render(<ToolStrip items={a} selected="b" onSelect={() => {}} />);
    } finally {
      Element.prototype.scrollIntoView = orig;
    }
    expect(calls).toEqual([]);
  });
});
