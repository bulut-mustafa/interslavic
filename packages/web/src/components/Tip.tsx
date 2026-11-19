import { cloneElement, type ReactElement } from 'react';

/** Which side of the button the tooltip opens on. 'top-end' opens above with its right edge on the button's right edge. */
export type TipSide = 'right' | 'bottom' | 'top' | 'left' | 'top-end';

/**
 * A tooltip for one button. It adds no wrapper (so layout is untouched): it
 * hands the label and the side to the child, and the stylesheet draws the
 * tooltip. Give it no label and nothing shows. Where it opens is the caller's
 * call: a sidebar opens to the right, a toolbar along the top opens below.
 */
export function Tip({ label, side, children }: { label?: string; side: TipSide; children: ReactElement<Record<string, unknown>> }) {
  if (!label) return children;
  return cloneElement(children, { 'data-tip': label, 'data-side': side });
}
