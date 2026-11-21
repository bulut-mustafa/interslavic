import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './tool-strip.css';

export interface StripItem {
  id: string;
  label: string;
  /** Usually an <Icon name="..." /> (24px grid line icon). */
  icon: ReactNode;
  disabled?: boolean;
  /** A count or short text shown as a small dot on the icon; `true` shows a plain dot. */
  badge?: number | string | boolean;
}

export interface ToolStripProps {
  items: StripItem[];
  /** The id of the selected item (its tool is open), or null. */
  selected?: string | null;
  onSelect: (id: string) => void;
  /**
   * Which set of items this is ("project", "clip", "text"...). When it changes
   * the strip slides and fades in the new set (transform + opacity only).
   */
  mode?: string;
  /** Accessible name of the toolbar. */
  label?: string;
}

/**
 * The bottom tool strip: icon over a 12px label, 56px tall targets, scrolls
 * sideways with proximity snapping, and fades only the edge that has more.
 * Swap the editor's tools with the selection by passing different `items` and
 * a new `mode`.
 */
export function ToolStrip({ items, selected = null, onSelect, mode = 'default', label = 'Tools' }: ToolStripProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const n = scroller.current;
    if (!n) return;
    const left = n.scrollLeft > 2;
    const right = n.scrollLeft + n.clientWidth < n.scrollWidth - 2;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  }, []);

  useLayoutEffect(measure, [measure, items, mode]);
  useEffect(() => {
    const n = scroller.current;
    if (!n || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(n);
    return () => ro.disconnect();
  }, [measure]);

  // Bring a newly selected tool into view.
  useEffect(() => {
    if (!selected) return;
    const b = scroller.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    b?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [selected]);

  return (
    <div className={`ph-strip-wrap${more.left ? ' fade-left' : ''}${more.right ? ' fade-right' : ''}`}>
      <div key={mode} ref={scroller} className="ph-strip" role="toolbar" aria-label={label} data-mode={mode} onScroll={measure}>
        {items.map((it) => (
          <button key={it.id} type="button" className={`ph-strip-item${selected === it.id ? ' is-selected' : ''}`} aria-pressed={selected === it.id} disabled={it.disabled} onClick={() => onSelect(it.id)}>
            <span className="ph-strip-icon">
              {it.icon}
              {it.badge !== undefined && it.badge !== false && <i className="ph-badge">{it.badge === true ? '' : it.badge}</i>}
            </span>
            <span className="ph-strip-label">{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
