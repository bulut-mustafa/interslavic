/**
 * Typing on a phone, as pure helpers (tested in test/phone-photo-typing.test.ts).
 *
 * iOS Safari scrolls the layout viewport and every ancestor of a focused field (even `overflow: hidden` ones) to reveal it; the
 * editor must never move, so after any such scroll the offsets are put back to zero.
 */

interface Scrollable {
  scrollTop: number;
  scrollLeft: number;
}

/** Puts the scroll offsets of these boxes back to 0; returns whether any had moved. */
export function resetScroll(nodes: readonly (Scrollable | null | undefined)[]): boolean {
  let moved = false;
  for (const n of nodes) {
    if (!n) continue;
    if (n.scrollTop !== 0 || n.scrollLeft !== 0) {
      moved = true;
      n.scrollTop = 0;
      n.scrollLeft = 0;
    }
  }
  return moved;
}

/** Keeps the editor in place while typing: counter-scrolls its boxes and the window whenever something scrolls them. Returns the cleanup. */
export function holdInPlace(boxes: readonly (HTMLElement | null | undefined)[], win: Window = window): () => void {
  const fix = () => {
    resetScroll(boxes);
    if (win.scrollX !== 0 || win.scrollY !== 0) win.scrollTo(0, 0);
  };
  const live = boxes.filter((b): b is HTMLElement => !!b);
  for (const b of live) b.addEventListener('scroll', fix);
  win.addEventListener('scroll', fix);
  win.visualViewport?.addEventListener('scroll', fix);
  fix();
  return () => {
    for (const b of live) b.removeEventListener('scroll', fix);
    win.removeEventListener('scroll', fix);
    win.visualViewport?.removeEventListener('scroll', fix);
  };
}

/** What stopping typing should do: a text left empty would be an invisible layer nobody can hit, so it is removed. */
export function emptyTextToRemove(layer: { text: string } | null, isVirtual: boolean): boolean {
  return !!layer && !isVirtual && layer.text.trim() === '';
}
