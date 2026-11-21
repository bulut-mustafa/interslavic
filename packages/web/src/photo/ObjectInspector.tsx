import { useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon.tsx';
import { Tip } from '../components/Tip.tsx';
import { BLENDS } from '../editor/MediaInspector.tsx';
import { EffectsPanel, type EffectsPatch } from '../editor/EffectsPanel.tsx';
import { round } from '../editor/controls.tsx';
import type { StepKind } from '../editor/layers.ts';
import { MIN_SIZE } from '../editor/transform-math.ts';
import type { Blend } from '../video/project.ts';
import { isImage, isShape, type Border, type ImageLayer, type ShapeLayer, type Shadow } from './doc.ts';
import { layerName, type AlignKind } from './layer-ops.ts';
import { LOCK, PathIcon, UNLOCK } from './path-icon.tsx';
import { ALIGN_ICONS, FLIP_ICONS, FRAME_ENTRIES } from './shapes-catalog.ts';
import './objects.css';
import '../editor/transform.css';

/**
 * 'preview': a value on its way (a slider being dragged), not for the undo list.
 * 'end': the same patch, final: the slider was let go.
 * 'commit': one finished change.
 */
export type InspectorMode = 'commit' | 'preview' | 'end';
export type ObjectLayer = ImageLayer | ShapeLayer;

const DEFAULT_BORDER: Border = { color: '#000000', width: 4 };
const DEFAULT_SHADOW: Shadow = { color: '#000000', blur: 12, x: 4, y: 4, opacity: 0.4 };
const DEFAULT_STROKE = { color: '#1f6b6b', width: 6 };

const ALIGNS: { kind: AlignKind; label: string }[] = [
  { kind: 'top', label: 'Align top' },
  { kind: 'middle', label: 'Align middle' },
  { kind: 'bottom', label: 'Align bottom' },
  { kind: 'left', label: 'Align left' },
  { kind: 'center', label: 'Align center' },
  { kind: 'right', label: 'Align right' },
];

type Patch = Partial<ImageLayer> & Partial<ShapeLayer>;

/** The side panel is on the right: tooltips open above, right-aligned. */
function Tool(props: { label: string; icon?: IconName; path?: string; on?: boolean; onClick: () => void }) {
  return (
    <Tip label={props.label} side="top-end">
      <button type="button" className="insp-tool" aria-label={props.label} aria-pressed={props.on} onClick={props.onClick}>
        {props.icon ? <Icon name={props.icon} /> : <PathIcon d={props.path ?? ''} />}
      </button>
    </Tip>
  );
}

/** A slider that reports 'preview' while it moves and 'end' when it is let go. */
function Range(props: { label: string; value: number; min: number; max: number; step: number; show?: (v: number) => string; onPreview: (v: number) => void; onEnd: (v: number) => void }) {
  const last = useRef(props.value);
  return (
    <label className="insp-row">
      <span>{props.label}</span>
      <input
        type="range"
        aria-label={props.label}
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => {
          last.current = Number(e.target.value);
          props.onPreview(last.current);
        }}
        onPointerUp={() => props.onEnd(last.current)}
        onKeyUp={() => props.onEnd(last.current)}
      />
      <output>{props.show ? props.show(props.value) : round(props.value)}</output>
    </label>
  );
}

function Num(props: { label: string; caption?: string; value: number; min?: number; onSet: (v: number) => void }) {
  return (
    <label className="insp-cap">
      <small>{props.caption ?? props.label}</small>
      <input
        type="number"
        inputMode="decimal"
        aria-label={props.label}
        min={props.min}
        value={round(props.value)}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n)) props.onSet(n);
        }}
      />
    </label>
  );
}

function Colour(props: { label: string; value: string; onSet: (c: string) => void }) {
  return <input type="color" aria-label={props.label} value={/^#[0-9a-f]{6}$/i.test(props.value) ? props.value : '#000000'} onChange={(e) => props.onSet(e.target.value)} />;
}

function Group(props: { label: string; children: ReactNode }) {
  return (
    <div className="oi-group" role="group" aria-label={props.label}>
      {props.children}
    </div>
  );
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Everything about the selected picture or shape that the canvas does not do:
 * look (opacity, corners, border, shadow, blend, fill, stroke, frame), place
 * (size, position, turn, align to the page), stack order and actions.
 * `onChange` takes a patch of the layer's own fields (a key present with
 * `undefined` removes that setting). Resizing keeps the centre. It keeps no layer
 * state of its own, except whether width and height stay in ratio.
 */
export function ObjectInspector(props: {
  layer: ObjectLayer;
  page: { w: number; h: number };
  onChange: (patch: Patch, mode: InspectorMode) => void;
  onOrder: (kind: StepKind) => void;
  onAlign: (kind: AlignKind) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { layer, onChange } = props;
  const [ratio, setRatio] = useState(true);
  const set = (patch: Patch) => onChange(patch, 'commit');
  const image = isImage(layer) ? layer : null;
  const shape = isShape(layer) ? layer : null;
  const linear = shape?.shape === 'line' || shape?.shape === 'arrow';
  const roundable = !!image || shape?.shape === 'rect';

  const resize = (w: number, h: number) => {
    const nw = Math.max(MIN_SIZE, w);
    const nh = Math.max(MIN_SIZE, h);
    set({ w: nw, h: nh, x: layer.x + (layer.w - nw) / 2, y: layer.y + (layer.h - nh) / 2 });
  };
  const setW = (w: number) => resize(w, ratio && layer.w > 0 ? (w * layer.h) / layer.w : layer.h);
  const setH = (h: number) => resize(ratio && layer.h > 0 ? (h * layer.w) / layer.h : layer.w, h);

  const border = layer.border;
  const shadow = layer.shadow;
  const stroke = shape?.stroke;

  return (
    <section className="inspector" aria-label="Object settings">
      <h3 className="insp-title">{layerName(layer)}</h3>

      <Range label="Opacity" value={layer.opacity} min={0} max={1} step={0.01} show={percent} onPreview={(opacity) => onChange({ opacity }, 'preview')} onEnd={(opacity) => onChange({ opacity }, 'end')} />

      {roundable && (
        <Range
          label="Corner radius"
          value={layer.radius ?? 0}
          min={0}
          max={Math.max(1, Math.floor(Math.min(layer.w, layer.h) / 2))}
          step={1}
          show={(v) => `${Math.round(v)} px`}
          onPreview={(radius) => onChange({ radius }, 'preview')}
          onEnd={(radius) => onChange({ radius }, 'end')}
        />
      )}

      <label className="insp-row">
        <span>Blend</span>
        <select className="insp-select" aria-label="Blend mode" value={layer.blend} onChange={(e) => set({ blend: e.target.value as Blend })}>
          {BLENDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      <div className="insp-line" role="group" aria-label="Flip, lock and actions">
        <Tool label="Flip horizontally" path={FLIP_ICONS.x} on={!!layer.flipX} onClick={() => set({ flipX: !layer.flipX })} />
        <Tool label="Flip vertically" path={FLIP_ICONS.y} on={!!layer.flipY} onClick={() => set({ flipY: !layer.flipY })} />
        <Tool label={layer.locked ? 'Unlock' : 'Lock'} path={layer.locked ? LOCK : UNLOCK} on={!!layer.locked} onClick={() => set({ locked: !layer.locked })} />
        <span className="insp-divider" aria-hidden="true" />
        <Tool label="Duplicate" icon="copy" onClick={props.onDuplicate} />
        <Tool label="Delete" icon="trash" onClick={props.onDelete} />
      </div>

      {shape && (
        <Group label="Shape colours">
          {!linear && (
            <div className="oi-colors">
              <label className="oi-check">
                <input type="checkbox" aria-label="Fill" checked={!!shape.fill} onChange={(e) => set({ fill: e.target.checked ? '#1f6b6b' : undefined })} />
                Fill
              </label>
              {shape.fill ? <Colour label="Fill colour" value={shape.fill} onSet={(fill) => set({ fill })} /> : <span />}
            </div>
          )}
          <div className="oi-colors">
            <label className="oi-check">
              <input type="checkbox" aria-label="Stroke" checked={!!stroke} disabled={linear} onChange={(e) => set({ stroke: e.target.checked ? DEFAULT_STROKE : undefined })} />
              {linear ? 'Line' : 'Stroke'}
            </label>
            {stroke && <Colour label="Stroke colour" value={stroke.color} onSet={(color) => set({ stroke: { ...stroke, color } })} />}
            {stroke && <Num label="Stroke width" caption="Width" value={stroke.width} min={1} onSet={(width) => set({ stroke: { ...stroke, width: Math.max(1, width) } })} />}
            {stroke && (
              <label className="oi-check">
                <input type="checkbox" aria-label="Dashed" checked={!!stroke.dash} onChange={(e) => set({ stroke: { ...stroke, dash: e.target.checked } })} />
                Dashed
              </label>
            )}
          </div>
          {linear && (
            <label className="insp-row">
              <span>Line end</span>
              <select className="insp-select" aria-label="Line end" value={shape.shape} onChange={(e) => set({ shape: e.target.value as 'line' | 'arrow' })}>
                <option value="line">Plain</option>
                <option value="arrow">Arrowhead</option>
              </select>
            </label>
          )}
        </Group>
      )}

      {image && (
        <Group label="Frame">
          <h4 className="fx-head">Frame</h4>
          <div className="oi-frames">
            {FRAME_ENTRIES.map((f) => (
              <Tool key={f.label} label={f.label === 'No frame' ? 'No frame' : `${f.label} frame`} path={f.path} on={image.frame === f.frame} onClick={() => set({ frame: f.frame })} />
            ))}
          </div>
        </Group>
      )}

      <Group label="Border settings">
        <div className="oi-colors">
          <label className="oi-check">
            <input type="checkbox" aria-label="Border" checked={!!border} onChange={(e) => set({ border: e.target.checked ? DEFAULT_BORDER : undefined })} />
            Border
          </label>
          {border && <Colour label="Border colour" value={border.color} onSet={(color) => set({ border: { ...border, color } })} />}
          {border && <Num label="Border width" caption="Width" value={border.width} min={0} onSet={(width) => set({ border: { ...border, width: Math.max(0, width) } })} />}
        </div>
      </Group>

      <Group label="Shadow settings">
        <label className="oi-check">
          <input type="checkbox" aria-label="Shadow" checked={!!shadow} onChange={(e) => set({ shadow: e.target.checked ? DEFAULT_SHADOW : undefined })} />
          Shadow
        </label>
        {shadow && (
          <>
            <label className="insp-row">
              <span>Colour</span>
              <Colour label="Shadow colour" value={shadow.color} onSet={(color) => set({ shadow: { ...shadow, color } })} />
            </label>
            <Range label="Shadow blur" value={shadow.blur} min={0} max={60} step={1} show={(v) => `${Math.round(v)} px`} onPreview={(blur) => onChange({ shadow: { ...shadow, blur } }, 'preview')} onEnd={(blur) => onChange({ shadow: { ...shadow, blur } }, 'end')} />
            <Range label="Shadow opacity" value={shadow.opacity} min={0} max={1} step={0.01} show={percent} onPreview={(opacity) => onChange({ shadow: { ...shadow, opacity } }, 'preview')} onEnd={(opacity) => onChange({ shadow: { ...shadow, opacity } }, 'end')} />
            <div className="insp-pair" role="group" aria-label="Shadow offset">
              <span>Offset</span>
              <Num label="Shadow X" caption="X" value={shadow.x} onSet={(x) => set({ shadow: { ...shadow, x } })} />
              <Num label="Shadow Y" caption="Y" value={shadow.y} onSet={(y) => set({ shadow: { ...shadow, y } })} />
              <span />
            </div>
          </>
        )}
      </Group>

      <Group label="Position and size">
        <div className="insp-pair" role="group" aria-label="Size">
          <span>Size</span>
          <Num label="Width" value={layer.w} min={MIN_SIZE} onSet={setW} />
          <Num label="Height" value={layer.h} min={MIN_SIZE} onSet={setH} />
          <Tool label={ratio ? 'Unlock the ratio' : 'Keep the ratio'} icon="swap" on={ratio} onClick={() => setRatio(!ratio)} />
        </div>
        <div className="insp-pair" role="group" aria-label="Place">
          <span>Position</span>
          <Num label="X" value={layer.x} onSet={(x) => set({ x })} />
          <Num label="Y" value={layer.y} onSet={(y) => set({ y })} />
          <span />
        </div>
        <div className="insp-pair" role="group" aria-label="Turn">
          <span>Rotation</span>
          <Num label="Rotation in degrees" caption="Degrees" value={layer.rotation} onSet={(rotation) => set({ rotation })} />
          <span />
          <Tool label="Reset the turn" icon="rotate" onClick={() => set({ rotation: 0 })} />
        </div>
        <div className="insp-line oi-wrap" role="group" aria-label="Align to the page">
          {ALIGNS.map((a) => (
            <Tool key={a.kind} label={a.label} path={ALIGN_ICONS[a.kind]} onClick={() => props.onAlign(a.kind)} />
          ))}
        </div>
      </Group>

      <div className="insp-line insp-foot" role="group" aria-label="Order">
        <Tool label="Bring to front" icon="front" onClick={() => props.onOrder('front')} />
        <Tool label="Bring forward" icon="forward" onClick={() => props.onOrder('forward')} />
        <Tool label="Send backward" icon="backward" onClick={() => props.onOrder('backward')} />
        <Tool label="Send to back" icon="toBack" onClick={() => props.onOrder('back')} />
      </div>

      {image && <EffectsPanel adjust={image.adjust ?? {}} mask={image.mask} chroma={image.chroma} onChange={(p: EffectsPatch) => set(p)} />}
    </section>
  );
}
