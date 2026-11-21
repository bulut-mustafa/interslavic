import { useEffect, useState } from 'react';

/** Below this many px the difference is browser chrome (collapsing URL bar), not a keyboard. */
const MIN_KEYBOARD = 80;

/** Height of the on-screen keyboard (or anything else covering the bottom of the layout viewport), px; 0 if none or unknown. */
export function measureInset(): number {
  if (typeof window === 'undefined') return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  if (vv.scale > 1.05) return 0; // pinch-zoomed: the visual viewport is smaller for another reason
  const inset = Math.round(window.innerHeight - vv.height - vv.offsetTop);
  return inset >= MIN_KEYBOARD ? inset : 0;
}

/**
 * Tracks the on-screen keyboard through `visualViewport` (resize + scroll) and
 * re-measures on `focusout` and shortly after, because iOS can leave a stale
 * value once the keyboard closes. Writes the CSS variable `--kb` ("320px") on
 * the document element (or on `target`) and also returns the number, so a bar
 * can be offset by either: `bottom: var(--kb, 0px)`.
 */
export function useKeyboardInset(target?: HTMLElement | null): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const node = target ?? document.documentElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const px = measureInset();
      node.style.setProperty('--kb', `${px}px`);
      setInset(px);
    };
    const settleLater = () => {
      update();
      clearTimeout(timer);
      timer = setTimeout(update, 300);
    };
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    document.addEventListener('focusout', settleLater);
    window.addEventListener('orientationchange', settleLater);
    update();
    return () => {
      clearTimeout(timer);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      document.removeEventListener('focusout', settleLater);
      window.removeEventListener('orientationchange', settleLater);
      // The viewport lock owns --kb on <html>; only a custom target is cleaned here.
      if (target) node.style.removeProperty('--kb');
    };
  }, [target]);
  return inset;
}
