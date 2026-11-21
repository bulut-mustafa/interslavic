import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './floating-bar.css';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where to put a bar of `bar` size next to `anchor` inside `bounds`: centred
 * under it, flipped above when there is no room below (or below when no room
 * above), and clamped inside the bounds with `margin`. Pure; unit-tested.
 */
export function placeBar(anchor: Rect, bar: { width: number; height: number }, bounds: { width: number; height: number }, gap = 8, margin = 8): { x: number; y: number; side: 'above' | 'below' } {
  const below = anchor.y + anchor.height + gap;
  const above = anchor.y - gap - bar.height;
  const fitsBelow = below + bar.height <= bounds.height - margin;
  const fitsAbove = above >= margin;
  const side = fitsBelow || !fitsAbove ? 'below' : 'above';
  const rawY = side === 'below' ? below : above;
  const y = Math.max(margin, Math.min(bounds.height - margin - bar.height, rawY));
  const x = Math.max(margin, Math.min(bounds.width - margin - bar.width, anchor.x + anchor.width / 2 - bar.width / 2));
  return { x, y, side };
}

/**
 * A small bar (duplicate, delete, more) floating next to the selected object.
 * `anchor` is the object's box and `bounds` the size of the container, both in
 * the container's coordinates; the container must be `position: relative`.
 */
export function FloatingBar({ anchor, bounds, children, label = 'Selection' }: { anchor: Rect; bounds: { width: number; height: number }; children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const n = ref.current;
    if (n && (n.offsetWidth !== size.width || n.offsetHeight !== size.height)) setSize({ width: n.offsetWidth, height: n.offsetHeight });
  });
  const p = placeBar(anchor, size, bounds);
  return (
    <div ref={ref} className="ph-fbar" role="toolbar" aria-label={label} data-side={p.side} style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)` }}>
      {children}
    </div>
  );
}
