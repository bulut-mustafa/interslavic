import { Icon } from '../components/Icon.tsx';
import { Tip } from '../components/Tip.tsx';
import { parseHex, type Chroma, type FxAdjust, type Mask, type MaskShape } from '../video/effects.ts';
import { Slider, round } from './controls.tsx';
import './transform.css';
import './effects.css';

export const DEFAULT_MASK: Mask = { shape: 'ellipse', x: 0.15, y: 0.15, w: 0.7, h: 0.7, rotation: 0, feather: 0, invert: false };
/** OBS's defaults, scaled to 0..1 (400 and 80 of 1000). */
export const DEFAULT_CHROMA: Chroma = { color: '#00ff00', similarity: 0.4, smoothness: 0.08 };

export const SHAPES: { id: MaskShape; label: string }[] = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'heart', label: 'Heart' },
];

/** Patch for the layer. A key that is present with undefined removes that effect; `adjust: {}` clears the adjustments. */
export interface EffectsPatch {
  adjust?: FxAdjust;
  mask?: Mask | undefined;
  chroma?: Chroma | undefined;
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

const ADJUSTMENTS: { key: keyof FxAdjust; label: string; min: number; max: number; show?: (v: number) => string }[] = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'hue', label: 'Hue', min: -180, max: 180, show: (v) => `${round(v, 0)}°` },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
  { key: 'tint', label: 'Tint', min: -100, max: 100 },
  { key: 'fade', label: 'Fade', min: 0, max: 100 },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 100 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
  { key: 'blur', label: 'Blur', min: 0, max: 40, show: (v) => `${round(v, 0)} px` },
];

/**
 * Adjustments, mask and chroma key of one picture or video layer, in the look
 * of MediaInspector. It holds no state: every change goes out as a patch
 * (see EffectsPatch). The panel sits on the right, so tooltips open left.
 */
export function EffectsPanel(props: { adjust: FxAdjust; mask?: Mask; chroma?: Chroma; onChange: (patch: EffectsPatch) => void }) {
  const { adjust, mask, chroma, onChange } = props;
  const setMask = (patch: Partial<Mask>) => mask && onChange({ mask: { ...mask, ...patch } });
  const setChroma = (patch: Partial<Chroma>) => chroma && onChange({ chroma: { ...chroma, ...patch } });

  return (
    <section className="inspector" aria-label="Effects">
      <h3 className="insp-title">Effects</h3>

      {ADJUSTMENTS.map((a) => (
        <Slider key={a.key} label={a.label} value={adjust[a.key] ?? 0} min={a.min} max={a.max} step={1} show={a.show} onChange={(v) => onChange({ adjust: { ...adjust, [a.key]: v } })} />
      ))}

      <div className="fx-group" role="group" aria-label="Mask settings">
        <h4 className="fx-head">
          <label className="fx-check">
            <input type="checkbox" aria-label="Mask" checked={!!mask} onChange={(e) => onChange({ mask: e.target.checked ? DEFAULT_MASK : undefined })} />
            Mask
          </label>
        </h4>
        {mask && (
          <>
            <label className="insp-row">
              <span>Shape</span>
              <select className="insp-select" aria-label="Mask shape" value={mask.shape} onChange={(e) => setMask({ shape: e.target.value as MaskShape })}>
                {SHAPES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <Slider label="Left" value={mask.x} min={0} max={1} step={0.01} show={percent} onChange={(x) => setMask({ x })} />
            <Slider label="Top" value={mask.y} min={0} max={1} step={0.01} show={percent} onChange={(y) => setMask({ y })} />
            <Slider label="Width" value={mask.w} min={0.05} max={1} step={0.01} show={percent} onChange={(w) => setMask({ w })} />
            <Slider label="Height" value={mask.h} min={0.05} max={1} step={0.01} show={percent} onChange={(h) => setMask({ h })} />
            <Slider label="Rotation" value={mask.rotation} min={-180} max={180} step={1} show={(v) => `${round(v, 0)}°`} onChange={(rotation) => setMask({ rotation })} />
            <Slider label="Feather" value={mask.feather} min={0} max={100} step={1} show={(v) => `${round(v, 0)} px`} onChange={(feather) => setMask({ feather })} />
            <label className="fx-check">
              <input type="checkbox" aria-label="Invert mask" checked={mask.invert} onChange={(e) => setMask({ invert: e.target.checked })} />
              Invert
            </label>
          </>
        )}
      </div>

      <div className="fx-group" role="group" aria-label="Chroma key settings">
        <h4 className="fx-head">
          <label className="fx-check">
            <input type="checkbox" aria-label="Chroma key" checked={!!chroma} onChange={(e) => onChange({ chroma: e.target.checked ? DEFAULT_CHROMA : undefined })} />
            Chroma key
          </label>
        </h4>
        {chroma && (
          <>
            <label className="insp-row">
              <span>Colour</span>
              <input
                className="fx-color"
                type="color"
                aria-label="Key colour"
                value={parseHex(chroma.color) && chroma.color.length === 7 ? chroma.color : DEFAULT_CHROMA.color}
                onChange={(e) => setChroma({ color: e.target.value })}
              />
              <output>{chroma.color}</output>
            </label>
            <Slider label="Similarity" value={chroma.similarity} min={0} max={1} step={0.01} onChange={(similarity) => setChroma({ similarity })} />
            <Slider label="Smoothness" value={chroma.smoothness} min={0} max={1} step={0.01} onChange={(smoothness) => setChroma({ smoothness })} />
          </>
        )}
      </div>

      <div className="fx-foot">
        <Tip label="Reset effects" side="top-end">
          <button type="button" className="insp-tool" aria-label="Reset effects" onClick={() => onChange({ adjust: {}, mask: undefined, chroma: undefined })}>
            <Icon name="rotate" />
          </button>
        </Tip>
      </div>
    </section>
  );
}
