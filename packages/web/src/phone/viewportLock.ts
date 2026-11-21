/**
 * Keeps the phone shell on screen while the on-screen keyboard is up.
 *
 * Why: on iOS Safari the keyboard shrinks only the VISUAL viewport. When a field
 * gets focus the browser pans the visual viewport (visualViewport.offsetTop > 0)
 * and may scroll the page or any scrollable ancestor (even `overflow: hidden`
 * ones, which stay programmatically scrollable) to reveal it, so a locked 100svh
 * shell appears to slide out of view. Sources: MDN VisualViewport; Chrome blog
 * "viewport-resize-behavior" (iOS resizes only the visual viewport, fixed
 * elements stay put); docs/ideas/mobile-research-patterns.md section 3.
 * Android Chrome (108+) behaves the same, so nothing here is iOS-only.
 *
 * Pure math first (unit-tested), DOM wiring in `installViewportLock`.
 */

/** Below this many px the difference is browser chrome (collapsing URL bar), not a keyboard. */
export const MIN_KEYBOARD = 80;

export interface ViewportInput {
  innerHeight: number;
  vvHeight: number;
  vvOffsetTop: number;
  vvScale: number;
}

export interface ViewportState {
  /** Visible height (visualViewport.height), px. */
  vvh: number;
  /** How far the visual viewport is panned down inside the layout viewport, px. */
  top: number;
  /** Keyboard height from the layout viewport's bottom edge, px (0 when none, or pinch-zoomed). */
  kb: number;
}

export function computeViewport(i: ViewportInput): ViewportState {
  const top = Math.max(0, Math.round(i.vvOffsetTop));
  const vvh = Math.round(i.vvHeight);
  if (i.vvScale > 1.05) return { vvh, top, kb: 0 }; // pinch-zoom shrinks the visual viewport for another reason
  const inset = Math.round(i.innerHeight - i.vvHeight - i.vvOffsetTop);
  return { vvh, top, kb: inset >= MIN_KEYBOARD ? inset : 0 };
}

/** Shell elements that must never be scrolled by focus handling (their own content scrolls in inner panes). */
export const NO_SCROLL_SELECTOR = '.ph-app, .ph-tool-frame, .ph-tool-frame[data-tool="photo"] .ph-tool, .ph-tool-frame[data-tool="video"] .ph-tool';

/** Undo any scroll the browser did to the page or the shell. Returns true if something moved. */
export function counterScroll(doc: Document = document): boolean {
  let moved = false;
  const win = doc.defaultView;
  if (win && (win.scrollX !== 0 || win.scrollY !== 0)) {
    win.scrollTo(0, 0);
    moved = true;
  }
  const se = doc.scrollingElement;
  if (se && (se.scrollTop !== 0 || se.scrollLeft !== 0)) {
    se.scrollTop = 0;
    se.scrollLeft = 0;
    moved = true;
  }
  doc.querySelectorAll<HTMLElement>(NO_SCROLL_SELECTOR).forEach((n) => {
    if (n.scrollTop !== 0 || n.scrollLeft !== 0) {
      n.scrollTop = 0;
      n.scrollLeft = 0;
      moved = true;
    }
  });
  return moved;
}

/**
 * Focus a control without letting the browser scroll anything to it. Editors use
 * this for programmatic focus (opening the text editor); then they decide how to
 * reveal the field themselves (the shell already follows the visual viewport).
 */
export function focusNoScroll(el: HTMLElement | null | undefined): void {
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

const isTextControl = (n: EventTarget | null): boolean => {
  if (!(n instanceof HTMLElement)) return false;
  if (n.isContentEditable) return true;
  if (n instanceof HTMLTextAreaElement || n instanceof HTMLSelectElement) return true;
  if (n instanceof HTMLInputElement) return !['range', 'checkbox', 'radio', 'button', 'submit', 'file', 'color', 'reset', 'image'].includes(n.type);
  return false;
};

/**
 * Wire it up (client only). Writes on `<html>`: `--vvh` (visible height),
 * `--vv-top` (pan offset), `--kb` (keyboard height) and the class `ph-kb-open`
 * while a keyboard is up; CSS in phone.css sizes the shell from them. Returns a
 * cleanup. A no-op without a window or visualViewport (desktop, jsdom).
 */
export function installViewportLock(win: Window = window): () => void {
  const doc = win.document;
  const root = doc.documentElement;
  const vv = win.visualViewport;
  if (!vv) return () => {};
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const update = () => {
    const s = computeViewport({ innerHeight: win.innerHeight, vvHeight: vv.height, vvOffsetTop: vv.offsetTop, vvScale: vv.scale });
    root.style.setProperty('--vvh', `${s.vvh}px`);
    root.style.setProperty('--vv-top', `${s.kb > 0 ? s.top : 0}px`);
    root.style.setProperty('--kb', `${s.kb}px`);
    root.classList.toggle('ph-kb-open', s.kb > 0);
    if (s.kb > 0 || s.top > 0) counterScroll(doc);
  };
  const later = (ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      update();
    }, ms);
    timers.add(t);
  };
  const settleLater = () => {
    update();
    later(120);
    later(400); // iOS can leave a stale value after the keyboard animation
  };
  const onFocusIn = (e: Event) => {
    if (isTextControl(e.target)) settleLater();
  };
  const onScroll = () => {
    counterScroll(doc);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  win.addEventListener('scroll', onScroll, { passive: true });
  win.addEventListener('orientationchange', settleLater);
  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('focusout', settleLater);
  // Scroll events do not bubble from elements: catch them in the capture phase for the shell's own boxes.
  const onShellScroll = (e: Event) => {
    const t = e.target;
    if (t instanceof HTMLElement && t.matches(NO_SCROLL_SELECTOR)) {
      t.scrollTop = 0;
      t.scrollLeft = 0;
    }
  };
  doc.addEventListener('scroll', onShellScroll, true);
  update();
  return () => {
    timers.forEach(clearTimeout);
    timers.clear();
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
    win.removeEventListener('scroll', onScroll);
    win.removeEventListener('orientationchange', settleLater);
    doc.removeEventListener('focusin', onFocusIn);
    doc.removeEventListener('focusout', settleLater);
    doc.removeEventListener('scroll', onShellScroll, true);
    root.style.removeProperty('--vvh');
    root.style.removeProperty('--vv-top');
    root.style.removeProperty('--kb');
    root.classList.remove('ph-kb-open');
  };
}
