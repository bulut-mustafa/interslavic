import type { ReactNode } from 'react';

/** Small touch-sized building blocks for the phone sheets (styles in phone-video.css). */

export function Slider(props: { label: string; value: number; min: number; max: number; step: number; show?: (v: number) => string; onChange: (v: number) => void; disabled?: boolean }) {
  const shown = props.show ? props.show(props.value) : String(Math.round(props.value * 100) / 100);
  return (
    <label className="pv-slider">
      <span className="pv-slider-top">
        <span>{props.label}</span>
        <output>{shown}</output>
      </span>
      <input type="range" aria-label={props.label} min={props.min} max={props.max} step={props.step} value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(Number(e.target.value))} />
    </label>
  );
}

/** A row of single-choice chips (a radio group). */
export function Chips<T extends string | number>(props: { label: string; value: T | null; options: { id: T; label: ReactNode; aria?: string; disabled?: boolean }[]; onChange: (id: T) => void }) {
  return (
    <div className="pv-chips" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={String(o.id)} type="button" role="radio" aria-checked={props.value === o.id} aria-label={o.aria} disabled={o.disabled} className={`pv-chip${props.value === o.id ? ' is-on' : ''}`} onClick={() => props.onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="pv-section">
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
}

/** A big button that opens the phone's file picker: a real label around a real input, so the tap itself is what opens it. */
export function PickButton(props: { label: string; accept: string; multiple?: boolean; disabled?: boolean; primary?: boolean; hint?: string; onFiles: (files: File[]) => void; icon?: ReactNode }) {
  return (
    <label className={`pv-pick${props.primary ? ' is-primary' : ''}${props.disabled ? ' is-disabled' : ''}`}>
      {props.icon}
      <span className="pv-pick-text">
        <span>{props.label}</span>
        {props.hint && <small>{props.hint}</small>}
      </span>
      <input
        type="file"
        accept={props.accept}
        multiple={props.multiple}
        aria-label={props.label}
        disabled={props.disabled}
        onChange={(e) => {
          const list = [...(e.target.files ?? [])];
          e.target.value = '';
          if (list.length > 0) props.onFiles(list);
        }}
      />
    </label>
  );
}

export function Row(props: { label: string; hint?: string; disabled?: boolean; onClick: () => void; icon?: ReactNode }) {
  return (
    <button type="button" className="pv-row" disabled={props.disabled} onClick={props.onClick}>
      {props.icon}
      <span className="pv-pick-text">
        <span>{props.label}</span>
        {props.hint && <small>{props.hint}</small>}
      </span>
    </button>
  );
}

export function Switch(props: { label: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={props.on} disabled={props.disabled} className={`pv-switch${props.on ? ' is-on' : ''}`} onClick={() => props.onChange(!props.on)}>
      <span>{props.label}</span>
      <i aria-hidden="true" />
    </button>
  );
}

/** A 24 px line icon from a path in a 24 x 24 box (the app's own Icon only knows the names it already has). */
export function PIcon({ d, size = 24 }: { d: string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

export const PATHS = {
  speed: 'M4 18a8 8 0 1116 0M12 18l4-6M7 18h1M16 18h1M12 8v1',
  animate: 'M12 3l9 9-9 9-9-9zM12 8l4 4-4 4-4-4z',
  diamond: 'M12 3l9 9-9 9-9-9z',
  effects: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  transitions: 'M4 6h7v12H4zM13 6h7v12h-7zM11 12h2',
  ratio: 'M4 7h16v10H4zM8 7v3M8 14v3',
  overlay: 'M3 5h13v10H3zM8 9h13v10H8z',
  captions: 'M3 5h18v14H3zM7 11h4M13 11h4M7 15h10',
  voice: 'M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4',
  edit: 'M6 3v18M18 3v18M3 8h6M15 16h6',
  audio: 'M9 18V6l10-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM19 16a3 3 0 11-6 0 3 3 0 016 0z',
  style: 'M4 20l5-5M12 4l8 8-6 6-8-8zM9 7l8 8',
  type: 'M4 20h4L19 9l-4-4L4 16z',
  opacity: 'M12 3.5C9 7 6 10 6 14a6 6 0 0012 0c0-4-3-7-6-10.5zM12 20V8',
  fit: 'M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  ok: 'M5 12l5 5 9-10',
} as const;
