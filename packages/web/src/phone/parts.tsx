import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon.tsx';
import './screens.css';

/** A round 44px icon button with a text label for screen readers; the phone's replacement for a desktop text button. */
export function PhoneIconButton({ icon, label, onClick, pressed, disabled }: { icon: IconName; label: string; onClick?: () => void; pressed?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className="ph-icon-btn" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size="1.25rem" />
    </button>
  );
}

/** A horizontally scrolling row of chips (language, script, topic); the page itself never scrolls sideways. */
export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ph-chips" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function Chip({ selected, onClick, children, label }: { selected?: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button type="button" className={`ph-chip${selected ? ' is-selected' : ''}`} aria-pressed={selected} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * A wide table inside its own card: it scrolls sideways there, never the page,
 * and an edge fade shows on the side that has more.
 */
export function ScrollCard({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const left = el.scrollLeft > 4;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);
  return (
    <div className="ph-scrollcard" data-more-left={more.left} data-more-right={more.right}>
      <div className="ph-scrollcard-in" ref={box} tabIndex={0}>
        {children}
      </div>
    </div>
  );
}

/** Pins its children to the bottom of the scrolling screen, just above the tab bar. */
export function StickyBar({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="ph-sticky" role={label ? 'toolbar' : undefined} aria-label={label}>
      {children}
    </div>
  );
}
