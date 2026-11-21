import { useEffect, useRef, type RefObject } from 'react';
import { angleDeg, angleDelta, distance, isDoubleTap, midpoint, movedBeyond, pinchScale, type Pt } from './gestureMath.ts';

/** A point in the element's own coordinates (CSS px from its top-left). */
export type GesturePoint = Pt;

export interface DragEvent {
  /** Where the finger is now. */
  x: number;
  y: number;
  /** Total movement since the finger went down. */
  dx: number;
  dy: number;
  /** Movement since the previous event (handy for moving something by hand). */
  stepX: number;
  stepY: number;
}

export interface TransformEvent {
  /** Midpoint of the two fingers now. Zoom about this point. */
  cx: number;
  cy: number;
  /** Finger distance now / when the pinch began (1 = unchanged). */
  scale: number;
  /** Turn since the pinch began, degrees, clockwise positive. */
  rotation: number;
  /** Midpoint movement since the pinch began (two-finger pan). */
  dx: number;
  dy: number;
}

/** Everything is optional; the editors decide what each gesture does. Callbacks are read fresh on every event, so inline functions are fine. */
export interface GestureHandlers {
  /** A finger went down and up without moving or waiting. Also fires for each tap of a double tap. */
  onTap?: (p: GesturePoint) => void;
  /** A second tap within 300 ms and 30 px of the first (after its onTap). */
  onDoubleTap?: (p: GesturePoint) => void;
  /** A finger stayed down 450 ms without moving more than 10 px. The rest of that touch is then ignored (no tap, no drag). */
  onLongPress?: (p: GesturePoint) => void;
  /** One finger moved more than 10 px. */
  onDragStart?: (e: DragEvent) => void;
  onDrag?: (e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
  /** A second finger arrived: pinch + rotate + two-finger pan in one stream. A running drag ends first. */
  onTransformStart?: (e: TransformEvent) => void;
  onTransform?: (e: TransformEvent) => void;
  onTransformEnd?: (e: TransformEvent) => void;
}

export const LONG_PRESS_MS = 450;
export const MOVE_THRESHOLD = 10;

type Mode = 'idle' | 'drag' | 'pinch' | 'ignore';

/**
 * Pointer gestures on one element. The element should have `touch-action: none`
 * in CSS (the browser must leave the gestures to us). Uses a Map of pointers
 * keyed by pointerId, deletes on pointercancel, blocks Safari's own page pinch
 * (`gesturestart`), and sets `user-select: none` so a long press selects nothing.
 *
 *   const ref = useRef<HTMLDivElement>(null);
 *   useGestures(ref, { onDrag: (e) => move(e.stepX, e.stepY), onTransform: (e) => zoom(e.scale, e.cx, e.cy) });
 *
 * `enabled = false` detaches everything.
 */
export function useGestures(ref: RefObject<HTMLElement | null>, handlers: GestureHandlers, enabled = true): void {
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const pointers = new Map<number, Pt>();
    let mode: Mode = 'idle';
    let start: Pt = { x: 0, y: 0 }; // first finger, where it went down
    let last: Pt = { x: 0, y: 0 };
    let moved = false;
    let longFired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastTap: { p: Pt; t: number } | null = null;
    let pinch = { dist: 0, angle: 0, mid: { x: 0, y: 0 } };

    const local = (e: PointerEvent): Pt => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const twoFingers = (): [Pt, Pt] => {
      const [a, b] = [...pointers.values()];
      return [a!, b!];
    };
    const dragEvent = (p: Pt): DragEvent => ({ x: p.x, y: p.y, dx: p.x - start.x, dy: p.y - start.y, stepX: p.x - last.x, stepY: p.y - last.y });
    const transformEvent = (): TransformEvent => {
      const [a, b] = twoFingers();
      const m = midpoint(a, b);
      return {
        cx: m.x,
        cy: m.y,
        scale: pinchScale(pinch.dist, distance(a, b)),
        rotation: angleDelta(pinch.angle, angleDeg(a, b)),
        dx: m.x - pinch.mid.x,
        dy: m.y - pinch.mid.y,
      };
    };
    let lastTransform: TransformEvent | null = null;

    const endDragOrPinch = () => {
      if (mode === 'drag') h.current.onDragEnd?.(dragEvent(last));
      else if (mode === 'pinch' && lastTransform) h.current.onTransformEnd?.(lastTransform);
      lastTransform = null;
    };

    const down = (e: PointerEvent) => {
      const p = local(e);
      pointers.set(e.pointerId, p);
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* the pointer is already gone */
      }
      if (pointers.size === 1) {
        mode = 'idle';
        moved = false;
        longFired = false;
        start = p;
        last = p;
        clearTimer();
        if (h.current.onLongPress) {
          timer = setTimeout(() => {
            timer = undefined;
            if (mode === 'idle' && !moved && pointers.size === 1) {
              longFired = true;
              mode = 'ignore';
              h.current.onLongPress?.(start);
            }
          }, LONG_PRESS_MS);
        }
      } else if (pointers.size === 2) {
        clearTimer();
        if (mode === 'drag') h.current.onDragEnd?.(dragEvent(last));
        const [a, b] = twoFingers();
        pinch = { dist: distance(a, b), angle: angleDeg(a, b), mid: midpoint(a, b) };
        moved = true; // never a tap
        mode = 'pinch';
        lastTransform = transformEvent();
        h.current.onTransformStart?.(lastTransform);
      }
    };

    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (mode === 'pinch' && pointers.size >= 2) {
        lastTransform = transformEvent();
        h.current.onTransform?.(lastTransform);
        return;
      }
      if (pointers.size !== 1 || mode === 'ignore') return;
      if (mode === 'idle') {
        if (!movedBeyond(start, p, MOVE_THRESHOLD)) return;
        moved = true;
        clearTimer();
        mode = 'drag';
        h.current.onDragStart?.(dragEvent(p));
        last = p;
        return;
      }
      h.current.onDrag?.(dragEvent(p));
      last = p;
    };

    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);
      pointers.delete(e.pointerId);
      clearTimer();
      if (mode === 'pinch') {
        if (pointers.size < 2) {
          endDragOrPinch();
          mode = 'ignore'; // the remaining finger does nothing until it lifts
        }
      } else if (mode === 'drag') {
        endDragOrPinch();
        mode = 'idle';
      } else if (pointers.size === 0 && mode === 'idle' && !moved && !longFired) {
        const now = Date.now();
        h.current.onTap?.(p);
        if (lastTap && isDoubleTap(lastTap.p, lastTap.t, p, now)) {
          lastTap = null;
          h.current.onDoubleTap?.(p);
        } else {
          lastTap = { p, t: now };
        }
      }
      if (pointers.size === 0) mode = 'idle';
    };

    const cancel = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      clearTimer();
      if (mode === 'drag' || (mode === 'pinch' && pointers.size < 2)) endDragOrPinch();
      mode = pointers.size === 0 ? 'idle' : 'ignore';
      lastTap = null;
    };

    const noGesture = (e: Event) => e.preventDefault(); // Safari's page pinch
    const noMenu = (e: Event) => {
      if (h.current.onLongPress) e.preventDefault();
    };

    const prevSelect = el.style.userSelect;
    el.style.userSelect = 'none';
    (el.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = 'none';
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('gesturestart', noGesture, { passive: false } as AddEventListenerOptions);
    el.addEventListener('contextmenu', noMenu);
    return () => {
      clearTimer();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('gesturestart', noGesture);
      el.removeEventListener('contextmenu', noMenu);
      el.style.userSelect = prevSelect;
      (el.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = '';
    };
  }, [ref, enabled]);
}
