import { DEFAULT_TRANSITION, MIN_TRANSITION, TRANSITION_KINDS, type Transition, type TransitionKind } from '../video/transitions.ts';
import './transitions.css';

export interface TransitionPickerProps {
  /** The transition now on the join, or undefined for none. */
  value: Transition | undefined;
  /** The longest allowed on this join (`maxDuration`). */
  max: number;
  onChange(next: Transition | undefined): void;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * The choices for one join: None or a kind, each with a small CSS-only preview
 * (a looping animation, off when the person prefers reduced motion), and a
 * duration slider that stops at `max`.
 */
export function TransitionPicker({ value, max, onChange }: TransitionPickerProps) {
  const tooShort = max < MIN_TRANSITION - 1e-9;
  const duration = value ? Math.min(value.duration, max) : 0;
  const options: (TransitionKind | 'none')[] = ['none', ...TRANSITION_KINDS.map((k) => k.kind)];
  const current: TransitionKind | 'none' = value?.kind ?? 'none';

  const choose = (k: TransitionKind | 'none') => {
    if (k === 'none') return onChange(undefined);
    onChange({ kind: k, duration: value ? value.duration : Math.min(DEFAULT_TRANSITION, max) });
  };
  // Roving tabindex: one stop in the group, arrow keys move and choose, as for a radio group.
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = options[(i + step + options.length) % options.length]!;
    if (next !== 'none' && tooShort) return;
    choose(next);
    requestAnimationFrame(() => (e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role=radio]')[(i + step + options.length) % options.length])?.focus());
  };

  return (
    <div className="trp">
      <div className="trp-grid" role="radiogroup" aria-label="Transition">
        {options.map((k, i) => {
          const label = k === 'none' ? 'None' : TRANSITION_KINDS.find((x) => x.kind === k)!.label;
          const on = k === current;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={label}
              disabled={k !== 'none' && tooShort}
              tabIndex={on ? 0 : -1}
              className={`trp-opt${on ? ' is-on' : ''}`}
              onClick={() => choose(k)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className={`trp-pre trp-${k}`} aria-hidden="true">
                <span className="trp-a" />
                <span className="trp-b" />
              </span>
              <span className="trp-name" aria-hidden="true">{label}</span>
            </button>
          );
        })}
      </div>
      {tooShort ? (
        <p className="trp-note">These clips are too short for a transition.</p>
      ) : (
        value && (
          <label className="trp-dur">
            <span>Duration</span>
            <input
              type="range"
              aria-label="Duration"
              min={MIN_TRANSITION}
              max={round1Up(max)}
              step={0.1}
              value={duration}
              onChange={(e) => onChange({ kind: value.kind, duration: Math.min(Number(e.target.value), max) })}
            />
            <output>{duration.toFixed(1)} s</output>
          </label>
        )
      )}
    </div>
  );
}

/** The slider's max is `max` itself (not rounded down), so the longest allowed value can be reached. */
function round1Up(max: number): number {
  return max === round1(max) ? max : Math.round(max * 1000) / 1000;
}
