import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon.tsx';
import { layout, nextIndex, settle, type Detent } from './sheetMath.ts';
import './bottom-sheet.css';

export type { Detent } from './sheetMath.ts';

export interface BottomSheetProps {
  open: boolean;
  /** Called by the close/Done button, Escape, or a drag down past the lowest detent. The parent then sets `open` false. */
  onClose: () => void;
  /** Heights, e.g. ['half', 'full'] (45% and 85% of the viewport) or [30, 60, 90] (percent). Default ['half', 'full']. */
  detents?: Detent[];
  /** Which detent it opens at: an index into `detents` sorted shortest first. Default 0. */
  initialDetent?: number;
  /** Heading; also the dialog's accessible name. */
  title: string;
  /** Replaces the close button, e.g. a "Done" button. */
  headerAction?: ReactNode;
  /** Set false for a sheet that can only be closed by its own button. Default true. */
  dismissible?: boolean;
  /** Called with the visible height in px whenever it settles (0 when closed). */
  onHeight?: (px: number) => void;
  /** Gets the CSS variable `--sheet-h` (visible height, e.g. "380px"; "0px" when closed). Default: the document element. Pass the editor's root so only it reacts. */
  heightTarget?: HTMLElement | null;
  children: ReactNode;
}

const SLOP = 6; // px of movement before a press on the header becomes a drag
const EXIT_MS = 200;

const reducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const viewportH = (): number => (typeof window === 'undefined' ? 800 : window.innerHeight);

/**
 * A non-modal bottom sheet: no scrim, the content behind stays interactive.
 * Drag the grabber or the header to move between detents or to dismiss (the
 * release velocity counts); tap the grabber to cycle detents. The body scrolls
 * natively. It moves by `transform`, written in requestAnimationFrame while
 * dragging, never by React state.
 *
 * ONE SHEET AT A TIME: render a single <BottomSheet> per screen and switch its
 * `title`/children (or key it) to change tool; two open sheets would overlap
 * and both close on Escape.
 *
 * To keep the canvas visible, shrink it by `var(--sheet-h)` (or `onHeight`).
 */
export function BottomSheet({ open, onClose, detents = ['half', 'full'], initialDetent = 0, title, headerAction, dismissible = true, onHeight, heightTarget, children }: BottomSheetProps) {
  const [mounted, setMounted] = useState(open);
  const [index, setIndex] = useState(initialDetent);
  const [vh, setVh] = useState(viewportH);
  const el = useRef<HTMLElement>(null);
  const geo = layout(detents, vh);
  const count = geo.offsets.length;
  const i = Math.min(index, Math.max(0, count - 1));
  const offsetNow = useRef(geo.hidden);
  const live = useRef({ geo, i, onClose, dismissible, onHeight, heightTarget });
  live.current = { geo, i, onClose, dismissible, onHeight, heightTarget };
  const openRef = useRef(open);
  openRef.current = open;

  const report = useCallback((px: number) => {
    const t = live.current.heightTarget ?? document.documentElement;
    t.style.setProperty('--sheet-h', `${px}px`);
    live.current.onHeight?.(px);
  }, []);

  const place = useCallback((offset: number, animate: boolean) => {
    const node = el.current;
    if (!node) return;
    offsetNow.current = offset;
    node.style.transition = animate && !reducedMotion() ? `transform ${EXIT_MS}ms ease-out` : 'none';
    node.style.transform = `translate3d(0, ${offset}px, 0)`;
  }, []);

  // Opening mounts, closing animates away and then unmounts.
  useEffect(() => {
    if (open) {
      setMounted(true);
      setIndex(initialDetent);
      return;
    }
    if (!mounted) return;
    place(live.current.geo.hidden, true);
    report(0);
    const t = setTimeout(() => !openRef.current && setMounted(false), reducedMotion() ? 0 : EXIT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // First frame: start hidden, then slide to the detent. Later detent or size changes animate.
  const entered = useRef(false);
  useLayoutEffect(() => {
    if (!mounted || !open) {
      entered.current = false;
      return;
    }
    const target = geo.offsets[i] ?? 0;
    if (!entered.current) {
      entered.current = true;
      place(geo.hidden, false);
      void el.current?.offsetHeight; // commit the hidden position before animating
    }
    place(target, true);
    report(geo.heights[i] ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, open, i, geo.max, geo.offsets.join()]);

  // Leaving takes the variable with it.
  useEffect(
    () => () => {
      const t = live.current.heightTarget ?? document.documentElement;
      t.style.removeProperty('--sheet-h');
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onResize = () => setVh(viewportH());
    window.addEventListener('resize', onResize);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) live.current.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // ---- dragging the grabber / header ----
  const drag = useRef<{ id: number; y0: number; off0: number; active: boolean; samples: { t: number; y: number }[] } | null>(null);
  const frame = useRef(0);
  const pending = useRef(0);
  const swallowClick = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const onButton = (e.target as HTMLElement).closest('button');
    if (onButton && !onButton.classList.contains('ph-sheet-grabber')) return; // Done / close are plain buttons
    drag.current = { id: e.pointerId, y0: e.clientY, off0: offsetNow.current, active: false, samples: [{ t: e.timeStamp, y: e.clientY }] };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.active) {
      if (Math.abs(e.clientY - d.y0) < SLOP) return;
      d.active = true;
      // Capture only now: capturing on press would redirect the grabber's click to the header.
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    }
    d.samples.push({ t: e.timeStamp, y: e.clientY });
    while (d.samples.length > 2 && e.timeStamp - d.samples[0]!.t > 100) d.samples.shift();
    const { geo: g, dismissible: canDismiss } = live.current;
    const lo = 0; // the tallest detent
    const hi = canDismiss ? g.hidden : (g.offsets[g.offsets.length - 1] ?? 0);
    pending.current = Math.min(hi, Math.max(lo, d.off0 + (e.clientY - d.y0)));
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        place(pending.current, false);
      });
    }
  };
  const finish = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.active) return; // a tap: the click does the work
    swallowClick.current = true;
    setTimeout(() => (swallowClick.current = false), 0);
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    const { geo: g, dismissible: canDismiss, i: cur } = live.current;
    const first = d.samples[0]!;
    const dt = e.timeStamp - first.t;
    const v = dt >= 1 ? (e.clientY - first.y) / dt : 0;
    const now = Math.min(g.hidden, Math.max(0, d.off0 + (e.clientY - d.y0)));
    const target = cancelled ? cur : settle(now, v, g.offsets, g.hidden, canDismiss);
    if (target < 0) {
      live.current.onClose();
    } else {
      setIndex(target);
      place(g.offsets[target] ?? 0, true);
      report(g.heights[target] ?? 0);
    }
  };

  const cycle = () => {
    if (swallowClick.current) return;
    setIndex(nextIndex(live.current.i, count));
  };

  if (!mounted) return null;
  return (
    <section
      ref={el}
      className="ph-sheet"
      role="dialog"
      aria-modal="false"
      aria-label={title}
      data-detent={i}
      data-open={open ? 'true' : 'false'}
      style={{ height: geo.max }}
    >
      <div className="ph-sheet-head" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={(e) => finish(e, false)} onPointerCancel={(e) => finish(e, true)}>
        <button type="button" className="ph-sheet-grabber" aria-label={count > 1 ? 'Resize sheet' : 'Sheet handle'} onClick={cycle}>
          <span aria-hidden="true" />
        </button>
        <div className="ph-sheet-title-row">
          <h2 className="ph-sheet-title">{title}</h2>
          {headerAction ?? (
            <button type="button" className="ph-sheet-close" aria-label="Close" onClick={onClose}>
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>
      <div className="ph-sheet-body">{children}</div>
    </section>
  );
}
