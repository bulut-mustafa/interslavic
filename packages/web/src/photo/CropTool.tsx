import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../components/Icon.tsx';
import { Tip } from '../components/Tip.tsx';
import { HANDLES, type Handle } from '../editor/transform-math.ts';
import type { Geometry } from './doc.ts';
import { ReleaseSlider } from './AdjustPanel.tsx';
import {
  ASPECTS, boxForAspect, boxFromGeometry, displaySize, flipDisplay, geometryWithBox, moveBox, nudgeBox, resizeBox, turn, type Box,
} from './crop-math.ts';
import './photo-tools.css';

type Mode = 'preview' | 'end';
const NAMES: Record<Handle, string> = { nw: 'top left', n: 'top', ne: 'top right', e: 'right', se: 'bottom right', s: 'bottom', sw: 'bottom left', w: 'left' };
const POS: Record<Handle, [number, number]> = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
const CURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

type Drag = { kind: 'move' | Handle; start: Box; x0: number; y0: number; last: Geometry; moved: boolean };

/**
 * Crop overlay for the picture, with its toolbar below it. `view` is where the
 * SHOWN picture (flipped and turned) sits in the parent, in CSS px, and its
 * scale `k` (screen px per picture px). Controlled: the box comes from
 * `geometry` (see crop-math.ts); drags report 'preview' on every move and one
 * 'end' on release. Escape cancels and Enter applies, unless the focus is on
 * a native control that uses those keys.
 */
export function CropTool(props: {
  src: { w: number; h: number };
  geometry: Geometry;
  view: { left: number; top: number; k: number };
  onChange: (g: Geometry, mode: Mode) => void;
  onApply: () => void;
  onCancel: () => void;
  /** Where to put the options (ratio chips, straighten, turn and flip) instead of under the picture: the phone's bottom sheet, whose header holds Apply and Cancel (so the options have none of their own). */
  controlsHost?: HTMLElement | null;
}) {
  const { src, geometry, view } = props;
  const d = displaySize(src, geometry.turns ?? 0);
  const box = boxFromGeometry(src, geometry);
  const k = view.k;
  const [aspect, setAspect] = useState('free');
  const drag = useRef<Drag | null>(null);
  const live = useRef(props);
  live.current = props;

  const ratioOf = (id: string): number | undefined => (id === 'original' ? d.w / d.h : ASPECTS.find((a) => a.id === id)?.ratio);
  const ratio = ratioOf(aspect);
  const emit = (b: Box, mode: Mode, g: Geometry = geometry) => {
    const next = geometryWithBox(src, g, b);
    props.onChange(next, mode);
    return next;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === 'Escape') {
        e.preventDefault();
        live.current.onCancel();
      } else if (e.key === 'Enter' && !(t && ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName))) {
        e.preventDefault();
        live.current.onApply();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const begin = (kind: Drag['kind']) => (e: RPointerEvent) => {
    if (e.button !== 0 && e.button !== undefined) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // A synthetic event has no active pointer; the drag still works through bubbling.
    }
    drag.current = { kind, start: box, x0: e.clientX, y0: e.clientY, last: geometry, moved: false };
  };
  const move = (e: RPointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const dx = (e.clientX - g.x0) / k;
    const dy = (e.clientY - g.y0) / k;
    const next = g.kind === 'move' ? moveBox(g.start, dx, dy, d) : resizeBox(g.start, g.kind, dx, dy, d, ratio);
    g.moved = true;
    g.last = emit(next, 'preview');
  };
  const up = () => {
    const g = drag.current;
    drag.current = null;
    if (g?.moved) props.onChange(g.last, 'end');
  };

  const keyHandle = (h: Handle) => (e: RKeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const v = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!v) return;
    e.preventDefault();
    emit(resizeBox(box, h, v[0]!, v[1]!, d, ratio), 'end');
  };
  const keyBody = (e: RKeyboardEvent) => {
    if (!e.key.startsWith('Arrow')) return;
    e.preventDefault();
    emit(nudgeBox(box, e.key, e.shiftKey ? 10 : 1, d), 'end');
  };

  const pickAspect = (id: string) => {
    setAspect(id);
    const r = ratioOf(id);
    if (r) emit(boxForAspect(box, d, r), 'end');
  };
  // Turning or mirroring keeps the crop on the same part of the picture.
  const change = (g: Geometry) => props.onChange(geometryWithBox(src, g, boxFromGeometry(src, g)), 'end');

  const px = (v: number) => v * k;
  const b = { left: px(box.x), top: px(box.y), width: px(box.w), height: px(box.h) };
  const W = px(d.w);
  const H = px(d.h);

  return (
    <div className="crop-root" role="group" aria-label="Crop" style={{ left: view.left, top: view.top, width: W, height: H }}>
      <div className="crop-dim" style={{ left: 0, top: 0, width: W, height: b.top }} />
      <div className="crop-dim" style={{ left: 0, top: b.top + b.height, width: W, height: Math.max(0, H - b.top - b.height) }} />
      <div className="crop-dim" style={{ left: 0, top: b.top, width: b.left, height: b.height }} />
      <div className="crop-dim" style={{ left: b.left + b.width, top: b.top, width: Math.max(0, W - b.left - b.width), height: b.height }} />
      <div className="crop-box" style={b} data-part="box">
        <div className="crop-body" data-part="body" role="button" tabIndex={0} aria-label="Move the crop. Arrow keys move it, Shift for larger steps." onPointerDown={begin('move')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={keyBody} />
        {HANDLES.map((h) => (
          <div
            key={h}
            className="crop-h"
            data-handle={h}
            role="button"
            tabIndex={0}
            aria-label={`Crop: resize from ${NAMES[h]}. Arrow keys move it, Shift for larger steps.`}
            style={{ left: `${POS[h][0] * 100}%`, top: `${POS[h][1] * 100}%`, transform: 'translate(-50%, -50%)', cursor: CURSOR[h] }}
            onPointerDown={begin(h)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onKeyDown={keyHandle(h)}
          />
        ))}
      </div>

      {(props.controlsHost ? (node: ReactNode) => createPortal(node, props.controlsHost!) : (node: ReactNode) => node)(
      <div className="crop-bar" role="toolbar" aria-label="Crop options">
        <div className="crop-row" role="group" aria-label="Aspect ratio">
          {ASPECTS.map((a) => (
            <button key={a.id} type="button" className="crop-chip" aria-pressed={aspect === a.id} onClick={() => pickAspect(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
        <ReleaseSlider
          label="Straighten"
          value={geometry.straighten ?? 0}
          min={-45}
          max={45}
          step={0.5}
          resetTo={0}
          show={(v) => `${v}°`}
          onChange={(v, mode) => props.onChange({ ...geometry, straighten: v || undefined }, mode)}
        />
        <div className="crop-row">
          <Tip label="Rotate left" side="top">
            <button type="button" className="crop-turn-left" aria-label="Rotate left" onClick={() => change(turn(geometry, -1))}>
              <Icon name="rotate" />
            </button>
          </Tip>
          <Tip label="Rotate right" side="top">
            <button type="button" aria-label="Rotate right" onClick={() => change(turn(geometry, 1))}>
              <Icon name="rotate" />
            </button>
          </Tip>
          <Tip label="Flip horizontal" side="top">
            <button type="button" aria-label="Flip horizontal" onClick={() => change(flipDisplay(geometry, 'h'))}>
              <Icon name="swap" />
            </button>
          </Tip>
          <Tip label="Flip vertical" side="top">
            <button type="button" className="crop-flip-v" aria-label="Flip vertical" onClick={() => change(flipDisplay(geometry, 'v'))}>
              <Icon name="swap" />
            </button>
          </Tip>
          <span className="crop-size" aria-live="polite">{`${Math.round(box.w)} × ${Math.round(box.h)} px`}</span>
        </div>
        {!props.controlsHost && (
        <div className="crop-row">
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="button" onClick={props.onApply}>
            Apply
          </button>
        </div>
        )}
      </div>,
      )}
    </div>
  );
}
