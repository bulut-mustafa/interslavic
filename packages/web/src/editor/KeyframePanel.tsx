import { Icon } from '../components/Icon.tsx';
import { Tip } from '../components/Tip.tsx';
import { ANIM_PROPS, hasKeyAt, neighbours, removeKey, setEase, setKey, valueAt, type AnimProp, type Ease, type Track } from '../video/keyframes.ts';
import { PRESETS, PRESET_LABELS, type AnimPreset, type Anims } from '../video/text-anim.ts';
import './keyframes.css';

/** The properties this panel can show. Volume is not one: the sound is set in SpeedAudioPanel. Keyed by string so the panel still compiles if keyframes.ts drops or adds properties. */
const LABELS: Record<string, string> = { x: 'X', y: 'Y', w: 'Width', h: 'Height', rotation: 'Rotation', opacity: 'Opacity' };
const ORDER: AnimProp[] = ANIM_PROPS.filter((p) => p in LABELS);
const EASES: { id: Exclude<Ease, { bezier: unknown }>; label: string }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'easeIn', label: 'Ease in' },
  { id: 'easeOut', label: 'Ease out' },
  { id: 'easeInOut', label: 'Ease in-out' },
];
const SLOTS = [
  { id: 'in', label: 'In', durLabel: 'In duration', def: 0.5 },
  { id: 'out', label: 'Out', durLabel: 'Out duration', def: 0.5 },
  { id: 'loop', label: 'Loop', durLabel: 'Loop duration', def: 1 },
] as const;

const round = (n: number): number => Math.round(n * 100) / 100;

export interface KeyframePanelProps {
  /** The selected layer's own (unanimated) values. */
  layer: object;
  /** The playhead in seconds from the layer's start. */
  tLocal: number;
  tracks: Track[];
  anims: Anims | undefined;
  /** A patch for the layer: `tracks` and/or `anims`. */
  onChange: (patch: { tracks?: Track[]; anims?: Anims }) => void;
  /** Move the playhead to a time in seconds from the layer's start. */
  onSeekLocal: (t: number) => void;
  /** Which properties to show; default: the numeric ones the layer has, rotation, and any that already have keys. */
  props?: AnimProp[];
}

function Diamond() {
  return (
    <svg className="kf-diamond" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 3l9 9-9 9-9-9z" />
    </svg>
  );
}

/**
 * Keyframes and in/out/loop animations of the selected layer. The panel sits
 * on the right of the picture, so tooltips open above it, right-aligned. Changing a value
 * elsewhere at a non-start playhead is turned into a key by `autoKey`
 * (keyframes.ts); this panel adds, removes and re-eases keys by hand.
 */
export function KeyframePanel({ layer, tLocal, tracks, anims, onChange, onSeekLocal, props }: KeyframePanelProps) {
  const rec = layer as Record<string, unknown>;
  const shown = props ?? ORDER.filter((p) => typeof rec[p] === 'number' || p === 'rotation' || tracks.some((t) => t.prop === p));

  const row = (prop: AnimProp) => {
    const name = LABELS[prop] ?? prop;
    const keys = tracks.find((t) => t.prop === prop)?.keys ?? [];
    const base = typeof rec[prop] === 'number' ? (rec[prop] as number) : prop === 'opacity' ? 1 : 0;
    const value = valueAt(keys, tLocal, base);
    const on = hasKeyAt(tracks, prop, tLocal);
    const { prev, next } = neighbours(tracks, prop, tLocal);
    const key = keys.find((k) => Math.abs(k.t - tLocal) < 0.01);
    const ease = key?.ease;
    const toggle = on ? 'Remove keyframe' : 'Add keyframe at the playhead';
    const nav = (label: string, to: number | undefined, icon: 'chevronLeft' | 'chevronRight') => (
      <Tip label={label} side="top-end">
        <button type="button" className="kf-btn" aria-label={`${name}: ${label}`} disabled={to === undefined} onClick={() => to !== undefined && onSeekLocal(to)}>
          <Icon name={icon} size="0.9rem" />
        </button>
      </Tip>
    );
    return (
      <div className="kf-row" key={prop} role="group" aria-label={name}>
        <span>{name}</span>
        <span className="kf-val" role="status" aria-label={`${name} value`}>
          {round(value)}
        </span>
        <span className="kf-btns">
          {nav('Previous keyframe', prev, 'chevronLeft')}
          <Tip label={toggle} side="top-end">
            <button
              type="button"
              className="kf-btn"
              aria-label={`${name}: ${toggle}`}
              aria-pressed={on}
              onClick={() => onChange({ tracks: on ? removeKey(tracks, prop, tLocal) : setKey(tracks, prop, tLocal, value) })}
            >
              <Diamond />
            </button>
          </Tip>
          {nav('Next keyframe', next, 'chevronRight')}
        </span>
        <select
          aria-label={`${name} easing`}
          disabled={!on}
          value={typeof ease === 'object' ? 'custom' : (ease ?? 'linear')}
          onChange={(e) => onChange({ tracks: setEase(tracks, prop, tLocal, e.target.value as Ease) })}
        >
          {EASES.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
          {typeof ease === 'object' && (
            <option value="custom" disabled>
              Custom curve
            </option>
          )}
        </select>
      </div>
    );
  };

  const setSlot = (id: 'in' | 'out' | 'loop', slot: { preset: AnimPreset; dur: number } | undefined) => {
    const next: Anims = { ...(anims ?? {}) };
    if (slot && slot.preset !== 'none') next[id] = slot;
    else delete next[id];
    onChange({ anims: next });
  };

  return (
    <section className="inspector kf-panel" aria-label="Keyframes">
      <h3 className="insp-title">Keyframes</h3>
      {shown.map(row)}
      <h3 className="insp-title">Animation</h3>
      {SLOTS.map((s) => {
        const cur = anims?.[s.id];
        return (
          <div className="kf-anim" key={s.id}>
            <span>{s.label}</span>
            <select aria-label={`${s.label} animation`} value={cur?.preset ?? 'none'} onChange={(e) => setSlot(s.id, { preset: e.target.value as AnimPreset, dur: cur?.dur ?? s.def })}>
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {PRESET_LABELS[p]}
                </option>
              ))}
            </select>
            {cur ? (
              <input
                type="number"
                aria-label={s.durLabel}
                min={0.1}
                step={0.1}
                value={cur.dur}
                onChange={(e) => {
                  const n = e.target.valueAsNumber;
                  if (Number.isFinite(n) && n > 0) setSlot(s.id, { preset: cur.preset, dur: n });
                }}
              />
            ) : (
              <span />
            )}
          </div>
        );
      })}
    </section>
  );
}
