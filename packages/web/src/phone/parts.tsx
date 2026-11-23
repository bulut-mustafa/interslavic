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

/**
 * The translator's direction as one row: the source language, an arrow, and
 * Interslavic with its script. Each side is a native dropdown (the phone's own
 * picker) laid invisibly over a two-line label, so the whole box is the tap
 * target and the picker is the one people already know.
 */
export function LangBar<L extends string, O extends string>({
  lang, langs, onLang, orth, orths, onOrth,
}: {
  lang: L;
  langs: { value: L; label: string }[];
  onLang: (value: L) => void;
  orth: O;
  orths: { value: O; label: string }[];
  onOrth: (value: O) => void;
}) {
  const chevron = (
    <span className="ph-pick-chev" aria-hidden="true">
      <Icon name="chevronDown" size="1rem" />
    </span>
  );
  return (
    <div className="ph-langbar" role="group" aria-label="Language and script">
      <label className="ph-pick">
        <span className="ph-pick-main">{langs.find((l) => l.value === lang)?.label}</span>
        <span className="ph-pick-sub">from</span>
        {chevron}
        <select aria-label="Translate from" value={lang} onChange={(e) => onLang(e.target.value as L)}>
          {langs.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <span className="ph-langbar-arrow" aria-hidden="true">
        <Icon name="arrowRight" size="1.25rem" />
      </span>
      <label className="ph-pick ph-pick-to">
        <span className="ph-pick-main">Interslavic</span>
        <span className="ph-pick-sub">
          {orths.find((o) => o.value === orth)?.label}
          <span className="ph-pick-word"> script</span>
        </span>
        {chevron}
        <select aria-label="Script" value={orth} onChange={(e) => onOrth(e.target.value as O)}>
          {orths.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
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
