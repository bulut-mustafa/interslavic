import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon.tsx';
import { Tip } from '../components/Tip.tsx';
import type { Blend, MediaLayer, Source } from '../video/project.ts';
import type { StepKind } from './layers.ts';
import { MIN_SIZE } from './transform-math.ts';
import { Slider, round } from './controls.tsx';
import './transform.css';

export const BLENDS: { id: Blend; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'darken', label: 'Darken' },
  { id: 'lighten', label: 'Lighten' },
];

const MIN_SECONDS = 0.1;

/** Two numbers on one line (width and height, x and y). A field that is empty or not a number changes nothing. */
type PairField = { name: string; caption: string; value: number; min?: number; set: (v: number) => void };
function Pair(props: { label: string; a: PairField; b: PairField; extra?: ReactNode }) {
  const field = (f: PairField) => (
    <label className="insp-cap">
      <small>{f.caption}</small>
      <input
      type="number"
      aria-label={`${props.label} ${f.name}`}
      min={f.min}
      value={round(f.value)}
      onChange={(e) => {
        const n = e.target.valueAsNumber;
        if (Number.isFinite(n)) f.set(n);
      }}
      />
    </label>
  );
  return (
    <div className="insp-pair" role="group" aria-label={props.label}>
      <span>{props.label}</span>
      {field(props.a)}
      {field(props.b)}
      {props.extra ?? <span />}
    </div>
  );
}

/** The side panel sits on the right of the picture, so tooltips open above, right-aligned. */
function Tool(props: { label: string; icon: IconName; on?: boolean; onClick: () => void }) {
  return (
    <Tip label={props.label} side="top-end">
      <button type="button" className="insp-tool" aria-label={props.label} aria-pressed={props.on} onClick={props.onClick}>
        <Icon name={props.icon} />
      </button>
    </Tip>
  );
}

/**
 * Everything about the selected picture or video layer that is not done with
 * the mouse on the canvas: opacity, size, position, turn, blend, timing and the place in the stack. `onChange` gets a patch of the
 * layer's own fields. Position is the top-left corner before rotation, as in
 * MediaLayer; changing the size keeps the centre where it is.
 */
export function MediaInspector(props: {
  layer: MediaLayer;
  source?: Source;
  frame: { w: number; h: number };
  onChange: (patch: Partial<MediaLayer>) => void;
  onOrder: (kind: StepKind) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { layer, source, onChange } = props;
  const [locked, setLocked] = useState(true);
  const isVideo = source?.kind === 'video';  // the sound is set in SpeedAudioPanel

  const resize = (w: number, h: number) => {
    const nw = Math.max(MIN_SIZE, w);
    const nh = Math.max(MIN_SIZE, h);
    onChange({ w: nw, h: nh, x: layer.x + (layer.w - nw) / 2, y: layer.y + (layer.h - nh) / 2 });
  };
  const setW = (w: number) => resize(w, locked && layer.w > 0 ? (w * layer.h) / layer.w : layer.h);
  const setH = (h: number) => resize(locked && layer.h > 0 ? (h * layer.w) / layer.h : layer.w, h);

  return (
    <section className="inspector" aria-label="Picture settings">
      <h3 className="insp-title">{source?.name ?? (isVideo ? 'Video' : 'Picture')}</h3>

      <Slider label="Opacity" value={layer.opacity} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => onChange({ opacity })} />

      <Pair
        label="Size"
        a={{ name: 'width', caption: 'Width', value: layer.w, min: MIN_SIZE, set: setW }}
        b={{ name: 'height', caption: 'Height', value: layer.h, min: MIN_SIZE, set: setH }}
        extra={
          <Tip label={locked ? 'Unlock the ratio' : 'Keep the ratio'} side="top-end">
            <button type="button" className="insp-tool" aria-label="Keep the ratio" aria-pressed={locked} onClick={() => setLocked(!locked)}>
              <Icon name="swap" />
            </button>
          </Tip>
        }
      />
      <Pair label="Position" a={{ name: 'x', caption: 'X', value: layer.x, set: (x) => onChange({ x }) }} b={{ name: 'y', caption: 'Y', value: layer.y, set: (y) => onChange({ y }) }} />

      <div className="insp-pair" role="group" aria-label="Turn">
        <span>Rotation</span>
        <input
          type="number"
          aria-label="Rotation in degrees"
          value={round(layer.rotation)}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (Number.isFinite(n)) onChange({ rotation: n });
          }}
        />
        <span />
        <Tool label="Reset the turn" icon="rotate" onClick={() => onChange({ rotation: 0 })} />
      </div>

      <label className="insp-row">
        <span>Blend</span>
        <select className="insp-select" aria-label="Blend mode" value={layer.blend} onChange={(e) => onChange({ blend: e.target.value as Blend })}>
          {BLENDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      <Pair
        label="Time"
        a={{ name: 'start', caption: 'Starts (s)', value: layer.start, min: 0, set: (start) => onChange({ start: Math.max(0, start), end: Math.max(0, start) + (layer.end - layer.start) }) }}
        b={{ name: 'duration', caption: 'Length (s)', value: layer.end - layer.start, min: MIN_SECONDS, set: (d) => onChange({ end: layer.start + Math.max(MIN_SECONDS, d) }) }}
      />

      <div className="insp-line insp-foot" role="group" aria-label="Order and actions">
        <Tool label="Bring to front" icon="front" onClick={() => props.onOrder('front')} />
        <Tool label="Bring forward" icon="forward" onClick={() => props.onOrder('forward')} />
        <Tool label="Send backward" icon="backward" onClick={() => props.onOrder('backward')} />
        <Tool label="Send to back" icon="toBack" onClick={() => props.onOrder('back')} />
        <span className="insp-divider" aria-hidden="true" />
        <Tool label="Duplicate" icon="copy" onClick={props.onDuplicate} />
        <Tool label="Delete" icon="trash" onClick={props.onDelete} />
      </div>
    </section>
  );
}
