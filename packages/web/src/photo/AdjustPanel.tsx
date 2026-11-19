import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Adjust } from '../video/project.ts';
import { round } from '../editor/controls.tsx';
import { Tip } from '../components/Tip.tsx';
import { PRESETS, presetThumb } from './presets.ts';
import '../editor/transform.css';
import './photo-tools.css';

type Mode = 'preview' | 'end';
export interface AdjustPatch {
  adjust?: Adjust;
  preset?: string | undefined;
  presetAmount?: number;
}

/**
 * A range input that reports 'preview' on every input and ONE 'end' when the
 * drag is released (pointer up) or the keyboard is let go, so the editor can
 * make a single undo step. A double click puts it back to `resetTo`.
 */
export function ReleaseSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  resetTo?: number;
  show?: (v: number) => string;
  onChange: (v: number, mode: Mode) => void;
}) {
  const last = useRef<number | null>(null);
  const end = () => {
    if (last.current === null) return;
    const v = last.current;
    last.current = null;
    props.onChange(v, 'end');
  };
  const keyUp = (e: KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) end();
  };
  return (
    <label className="insp-row">
      <span>{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => {
          last.current = Number(e.target.value);
          props.onChange(last.current, 'preview');
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyUp={keyUp}
        onDoubleClick={() => {
          if (props.resetTo === undefined) return;
          last.current = null;
          props.onChange(props.resetTo, 'preview');
          props.onChange(props.resetTo, 'end');
        }}
      />
      <output>{props.show ? props.show(props.value) : round(props.value)}</output>
    </label>
  );
}

type Row = { key: keyof Adjust; label: string; min: number; max: number; show?: (v: number) => string };
/*
 * Plain sliders, not Google Photos' Light/Color/Pop: those mix several
 * controls with a mapping nobody has published, and a made-up mapping would
 * be a guess. Each slider here is exactly one field of Adjust.
 */
const BASIC: Row[] = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
];
const MORE: Row[] = [
  { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
  { key: 'tint', label: 'Tint', min: -100, max: 100 },
  { key: 'hue', label: 'Hue', min: -180, max: 180, show: (v) => `${round(v, 0)}°` },
  { key: 'fade', label: 'Fade', min: 0, max: 100 },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 100 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
  { key: 'blur', label: 'Blur', min: 0, max: 40, show: (v) => `${round(v, 0)} px` },
];

function Thumb({ source, id, amount }: { source?: HTMLCanvasElement; id?: string; amount: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || !source) return;
    const c = presetThumb(source, id, 56, amount);
    host.replaceChildren();
    if (c) {
      c.className = 'adj-thumb-canvas';
      c.style.width = '100%';
      c.style.height = '100%';
      c.style.borderRadius = 'inherit';
      host.append(c);
    }
  }, [source, id, amount]);
  return <div ref={ref} className="adj-thumb" aria-hidden="true" />;
}

/**
 * The right-hand panel for the picture itself. Holds no value state: every
 * change goes out as a patch with 'preview' while dragging and 'end' once on
 * release. 'Compare' (hold) reports onCompare(true) while pressed. The panel
 * sits on the right, so tooltips would open left; there are none here.
 */
export function AdjustPanel(props: {
  adjust: Adjust;
  preset?: string;
  presetAmount?: number;
  source?: HTMLCanvasElement;
  onChange: (patch: AdjustPatch, mode: Mode) => void;
  onAuto: () => void;
  onReset: () => void;
  onCompare?: (on: boolean) => void;
}) {
  const { adjust, preset, source, onChange } = props;
  const amount = props.presetAmount ?? 1;
  const [more, setMore] = useState(false);
  const holding = useRef(false);
  const compare = (on: boolean) => {
    if (holding.current === on) return;
    holding.current = on;
    props.onCompare?.(on);
  };
  useEffect(() => () => void (holding.current && props.onCompare?.(false)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const slider = (r: Row) => (
    <ReleaseSlider
      key={r.key}
      label={r.label}
      value={adjust[r.key] ?? 0}
      min={r.min}
      max={r.max}
      step={1}
      resetTo={0}
      show={r.show}
      onChange={(v, mode) => onChange({ adjust: { ...adjust, [r.key]: v } }, mode)}
    />
  );

  return (
    <section className="inspector adj-panel" aria-label="Adjust">
      <h3 className="insp-title">Adjust</h3>

      <div className="adj-top">
        <button type="button" onClick={props.onAuto}>
          Auto
        </button>
        <button
          type="button"
          className="adj-compare"
          aria-label="Compare with the original (hold)"
          onPointerDown={() => compare(true)}
          onPointerUp={() => compare(false)}
          onPointerLeave={() => compare(false)}
          onPointerCancel={() => compare(false)}
          onBlur={() => compare(false)}
          onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && compare(true)}
          onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && compare(false)}
        >
          Compare
        </button>
      </div>

      <div className="adj-strip" role="group" aria-label="Looks">
        <Tip label="No look" side="top">
          <button type="button" className="adj-look" aria-pressed={!preset} aria-label="No look" onClick={() => onChange({ preset: undefined }, 'end')}>
            <Thumb source={source} amount={1} />
            None
          </button>
        </Tip>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className="adj-look" aria-pressed={preset === p.id} aria-label={`${p.label} look`} onClick={() => onChange({ preset: p.id, presetAmount: amount }, 'end')}>
            <Thumb source={source} id={p.id} amount={1} />
            {p.label}
          </button>
        ))}
      </div>
      {preset && <ReleaseSlider label="Look strength" value={Math.round(amount * 100)} min={0} max={100} step={1} resetTo={100} show={(v) => `${v}%`} onChange={(v, mode) => onChange({ presetAmount: v / 100 }, mode)} />}

      {BASIC.map(slider)}
      <button type="button" className="adj-more" aria-expanded={more} onClick={() => setMore(!more)}>
        {more ? 'Fewer adjustments' : 'More adjustments'}
      </button>
      {more && MORE.map(slider)}

      <div className="adj-foot">
        <button type="button" onClick={props.onReset}>
          Reset
        </button>
      </div>
    </section>
  );
}
