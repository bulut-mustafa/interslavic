import { useEffect, useRef } from 'react';
import { Tip } from '../components/Tip.tsx';
import { DEFAULT_EFFECTS, EFFECT_KINDS, type EffectKind, type TextEffect } from './text-effects.ts';
import { drawText, type TextStyle } from './text-style.ts';
import { round } from './controls.tsx';
import './transform.css';
import './text-effects.css';

export type ChangeMode = 'preview' | 'end';

interface Param {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}
interface ColorParam {
  key: string;
  label: string;
}

/** The parameters of each kind: numeric ones are sliders, colours are colour inputs. */
const PARAMS: Record<EffectKind, { sliders: Param[]; colors: ColorParam[] }> = {
  none: { sliders: [], colors: [] },
  hollow: { sliders: [{ key: 'width', label: 'Thickness', min: 1, max: 12, step: 0.5, unit: '%' }], colors: [] },
  echo: {
    sliders: [
      { key: 'offset', label: 'Offset', min: 1, max: 30, step: 1, unit: '%' },
      { key: 'direction', label: 'Direction', min: 0, max: 360, step: 5, unit: '°' },
    ],
    colors: [{ key: 'color', label: 'Echo colour' }],
  },
  glitch: {
    sliders: [
      { key: 'offset', label: 'Offset', min: 1, max: 15, step: 0.5, unit: '%' },
      { key: 'direction', label: 'Direction', min: 0, max: 360, step: 5, unit: '°' },
    ],
    colors: [
      { key: 'colorA', label: 'Glitch colour 1' },
      { key: 'colorB', label: 'Glitch colour 2' },
    ],
  },
  neon: { sliders: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, step: 1, unit: '' }], colors: [] },
  splice: {
    sliders: [
      { key: 'width', label: 'Thickness', min: 1, max: 12, step: 0.5, unit: '%' },
      { key: 'offset', label: 'Offset', min: 1, max: 30, step: 1, unit: '%' },
      { key: 'direction', label: 'Direction', min: 0, max: 360, step: 5, unit: '°' },
    ],
    colors: [{ key: 'color', label: 'Splice colour' }],
  },
  lift: { sliders: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, step: 1, unit: '' }], colors: [] },
  curve: { sliders: [{ key: 'amount', label: 'Bend', min: -100, max: 100, step: 1, unit: '%' }], colors: [] },
};

/** A small canvas showing "Ag" with the effect, drawn by the same drawText as the real text. */
function Preview({ style, effect }: { style: TextStyle; effect: TextEffect }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return; // no canvas (a test DOM): nothing to draw
    ctx.clearRect(0, 0, 72, 44);
    ctx.fillStyle = '#8a94a6';
    ctx.fillRect(0, 0, 72, 44);
    drawText(ctx, 'Ag', { ...style, size: 26, box: null, align: 'center', uppercase: false, letterSpacing: 0, opacity: 1, effect }, 8, 6, 56);
  }, [style, effect]);
  return <canvas ref={ref} width={72} height={44} aria-hidden="true" />;
}

/**
 * The text-effect picker and the parameters of the chosen effect. Stateless:
 * every change goes out as a patch of the style. Sliders and colour inputs
 * report 'preview' while they move and 'end' when released (or blurred); picking
 * a kind is a single 'end'. The panel sits on the right, so tooltips open left.
 */
export function TextEffectsPanel(props: { style: TextStyle; onChange: (patch: Partial<TextStyle>, mode: ChangeMode) => void }) {
  const { style, onChange } = props;
  const current: TextEffect = style.effect ?? DEFAULT_EFFECTS.none;
  const set = (effect: TextEffect, mode: ChangeMode) => onChange({ effect }, mode);
  const spec = PARAMS[current.kind];
  const value = (key: string) => (current as unknown as Record<string, number | string>)[key];
  const end = (key: string) => (e: { currentTarget: HTMLInputElement }) => set({ ...current, [key]: key.startsWith('color') ? e.currentTarget.value : Number(e.currentTarget.value) } as TextEffect, 'end');

  return (
    <section className="inspector" aria-label="Text effects">
      <h3 className="insp-title">Effects</h3>
      <div className="fxt-grid" role="group" aria-label="Effect">
        {EFFECT_KINDS.map(({ kind, label }) => (
          <Tip key={kind} label={label} side="left">
            <button type="button" className="fxt-kind" aria-label={label} aria-pressed={current.kind === kind} onClick={() => set(kind === current.kind ? current : DEFAULT_EFFECTS[kind], 'end')}>
              {kind === 'none' ? <span className="fxt-none" aria-hidden="true">Aa</span> : <Preview style={style} effect={DEFAULT_EFFECTS[kind]} />}
            </button>
          </Tip>
        ))}
      </div>
      {spec.sliders.map((p) => (
        <label key={p.key} className="insp-row">
          <span>{p.label}</span>
          <input
            type="range"
            min={p.min}
            max={p.max}
            step={p.step}
            value={value(p.key) as number}
            onChange={(e) => set({ ...current, [p.key]: Number(e.target.value) } as TextEffect, 'preview')}
            onPointerUp={end(p.key)}
            onKeyUp={end(p.key)}
            onBlur={end(p.key)}
          />
          <output>{`${round(value(p.key) as number)}${p.unit}`}</output>
        </label>
      ))}
      {spec.colors.map((p) => (
        <label key={p.key} className="insp-row">
          <span>{p.label}</span>
          <input type="color" value={value(p.key) as string} onChange={(e) => set({ ...current, [p.key]: e.target.value } as TextEffect, 'preview')} onBlur={end(p.key)} />
        </label>
      ))}
    </section>
  );
}
