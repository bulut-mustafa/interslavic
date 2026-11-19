import type { ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon.tsx';
import type { TextLayer } from './layers.ts';
import { FONTS, PRESETS, type FontKey, type TextStyle } from './text-style.ts';
import { WordLookup } from './WordLookup.tsx';

/** #rrggbb for a colour input, whatever form the style holds the colour in. */
const hex = (c: string): string => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#000000');

function Slider(props: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="insp-row">
      <span>{props.label}</span>
      <input type="range" min={props.min} max={props.max} step={props.step ?? 1} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
      <output>{Math.round(props.value * 100) / 100}</output>
    </label>
  );
}

function Toggle(props: { label: string; on: boolean; onChange: (on: boolean) => void; children?: ReactNode }) {
  return (
    <div className="insp-toggle">
      <label>
        <input type="checkbox" checked={props.on} onChange={(e) => props.onChange(e.target.checked)} />
        <span>{props.label}</span>
      </label>
      {props.on && <div className="insp-sub">{props.children}</div>}
    </div>
  );
}

/** A square button with an icon (or a few letters) in it, which stays pressed while its setting is on. */
function Tool(props: { label: string; icon?: IconName; text?: string; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="insp-tool" aria-label={props.label} title={props.label} aria-pressed={props.on} onClick={props.onClick}>
      {props.icon ? <Icon name={props.icon} /> : <span aria-hidden="true">{props.text}</span>}
    </button>
  );
}

/**
 * Everything that can be changed about the selected text. The few things people
 * reach for first - font, size, colour, bold, italic, alignment - are in two
 * short rows; the rest folds away. `extra` holds what only one editor has
 * (translate, timing).
 */
export function Inspector(props: {
  layer: TextLayer;
  /** Frame size in pixels, which sets how large the text and its width can be. */
  frame: { w: number; h: number };
  onText: (patch: Partial<TextLayer>) => void;
  onStyle: (patch: Partial<TextStyle>) => void;
  onPreset: (id: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onFront: () => void;
  /** A word from the Slavic-language lookup, to add to the text. */
  onInsertWord: (word: string) => void;
  extra?: ReactNode;
}) {
  const { layer, frame } = props;
  const s = layer.style;
  const maxSize = Math.max(60, Math.round(frame.h / 2));
  const setSize = (n: number) => props.onStyle({ size: Math.min(maxSize, Math.max(8, Math.round(n))) });
  return (
    <section className="inspector" aria-label="Text settings">
      <label className="insp-text">
        <span>Text</span>
        <textarea value={layer.text} rows={2} spellCheck={false} onChange={(e) => props.onText({ text: e.target.value })} />
      </label>

      {props.extra}

      <div className="insp-line">
        <select className="insp-font" aria-label="Font" value={s.font} onChange={(e) => props.onStyle({ font: e.target.value as FontKey })}>
          {(Object.keys(FONTS) as FontKey[]).map((k) => (
            <option key={k} value={k}>
              {FONTS[k].label}
            </option>
          ))}
        </select>
        <div className="insp-stepper" role="group" aria-label="Size">
          <button type="button" aria-label="Smaller text" onClick={() => setSize(s.size * 0.9)}>
            <Icon name="minus" size="0.9rem" />
          </button>
          <input type="number" aria-label="Size" min={8} max={maxSize} value={Math.round(s.size)} onChange={(e) => setSize(Number(e.target.value) || s.size)} />
          <button type="button" aria-label="Larger text" onClick={() => setSize(s.size * 1.1)}>
            <Icon name="plus" size="0.9rem" />
          </button>
        </div>
      </div>

      <div className="insp-line insp-tools" role="group" aria-label="Emphasis and alignment">
        <input className="insp-swatch" type="color" aria-label="Text colour" title="Text colour" value={hex(s.color)} onChange={(e) => props.onStyle({ color: e.target.value })} />
        <Tool label="Bold" icon="bold" on={s.bold} onClick={() => props.onStyle({ bold: !s.bold })} />
        <Tool label="Italic" icon="italic" on={s.italic} onClick={() => props.onStyle({ italic: !s.italic })} />
        <Tool label="Capitals" text="Aa" on={s.uppercase} onClick={() => props.onStyle({ uppercase: !s.uppercase })} />
        <span className="insp-divider" aria-hidden="true" />
        <Tool label="Align left" icon="alignLeft" on={s.align === 'left'} onClick={() => props.onStyle({ align: 'left' })} />
        <Tool label="Align centre" icon="alignCenter" on={s.align === 'center'} onClick={() => props.onStyle({ align: 'center' })} />
        <Tool label="Align right" icon="alignRight" on={s.align === 'right'} onClick={() => props.onStyle({ align: 'right' })} />
      </div>

      <WordLookup onInsert={props.onInsertWord} />

      <details className="insp-group" open>
        <summary>Styles</summary>
        <div className="insp-presets" role="group" aria-label="Styles">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className="insp-preset" onClick={() => props.onPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </details>

      <details className="insp-group">
        <summary>Spacing and fit</summary>
        <Slider label="Letter spacing" value={s.letterSpacing} min={-2} max={20} step={0.5} onChange={(letterSpacing) => props.onStyle({ letterSpacing })} />
        <Slider label="Line height" value={s.lineHeight} min={0.8} max={2.2} step={0.05} onChange={(lineHeight) => props.onStyle({ lineHeight })} />
        <Slider label="Opacity" value={s.opacity} min={0.1} max={1} step={0.05} onChange={(opacity) => props.onStyle({ opacity })} />
        <Slider label="Wrap width" value={layer.maxWidth} min={0} max={frame.w} step={10} onChange={(maxWidth) => props.onText({ maxWidth })} />
      </details>

      <details className="insp-group">
        <summary>Effects</summary>
        <Toggle label="Outline" on={s.outline !== null} onChange={(on) => props.onStyle({ outline: on ? { width: 4, color: '#000000' } : null })}>
          {s.outline && (
            <>
              <Slider label="Width" value={s.outline.width} min={1} max={20} onChange={(width) => props.onStyle({ outline: { ...s.outline!, width } })} />
              <label className="insp-row">
                <span>Colour</span>
                <input type="color" value={hex(s.outline.color)} onChange={(e) => props.onStyle({ outline: { ...s.outline!, color: e.target.value } })} />
              </label>
            </>
          )}
        </Toggle>
        <Toggle label="Shadow" on={s.shadow !== null} onChange={(on) => props.onStyle({ shadow: on ? { blur: 8, dx: 0, dy: 3, color: 'rgba(0,0,0,0.6)' } : null })}>
          {s.shadow && <Slider label="Blur" value={s.shadow.blur} min={0} max={40} onChange={(blur) => props.onStyle({ shadow: { ...s.shadow!, blur } })} />}
        </Toggle>
        <Toggle label="Glow" on={s.glow !== null} onChange={(on) => props.onStyle({ glow: on ? { blur: 20, color: '#2de2e6' } : null })}>
          {s.glow && (
            <label className="insp-row">
              <span>Colour</span>
              <input type="color" value={hex(s.glow.color)} onChange={(e) => props.onStyle({ glow: { ...s.glow!, color: e.target.value } })} />
            </label>
          )}
        </Toggle>
        <Toggle label="Background box" on={s.box !== null} onChange={(on) => props.onStyle({ box: on ? { color: '#16202f', padding: 12, radius: 8 } : null })}>
          {s.box && (
            <>
              <label className="insp-row">
                <span>Colour</span>
                <input type="color" value={hex(s.box.color)} onChange={(e) => props.onStyle({ box: { ...s.box!, color: e.target.value } })} />
              </label>
              <Slider label="Padding" value={s.box.padding} min={0} max={60} onChange={(padding) => props.onStyle({ box: { ...s.box!, padding } })} />
            </>
          )}
        </Toggle>
      </details>

      <div className="insp-line insp-foot" role="group" aria-label="This text">
        <Tool label="Duplicate" icon="copy" onClick={props.onDuplicate} />
        <Tool label="Bring to front" icon="front" onClick={props.onFront} />
        <Tool label="Delete" icon="trash" onClick={props.onDelete} />
      </div>
    </section>
  );
}
