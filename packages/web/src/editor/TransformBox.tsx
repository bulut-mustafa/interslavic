import { useEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { LayerBox } from '../video/contracts.ts';
import { HANDLES, SIGN, handlePositions, isCorner, moveBox, resizeBox, rotateBox, type Handle, type Pt } from './transform-math.ts';
import type { View } from './SelectionOverlay.tsx';
import './transform.css';

/**
 * The box drawn over the selected picture or video: eight resize handles, a
 * rotate handle above the top edge, and the body to drag it about.
 *
 * What the pointer and keys do (the sources are in docs/ideas/video-research-transform.md):
 *  - A corner resizes proportionally; Shift frees it. An edge changes one side
 *    only; Shift makes it proportional. (Canva and CapCut keep a picture's
 *    ratio on a corner; Figma's Shift toggles the ratio lock.)
 *  - Alt (Option) resizes from the centre.
 *  - The rotate handle turns the box by the angle swept about its centre; Shift
 *    snaps to 15 degrees (Figma, Canva).
 *  - Escape during a drag puts the box back as it was.
 *  - With the box focused, arrow keys nudge it 1 frame pixel, Shift 10 (Figma's
 *    small and big nudge). With a handle focused, arrows resize (Shift: 10) or,
 *    on the rotate handle, turn by 1 degree (Shift: 15).
 *
 * Reporting matches the timeline: `onChange(box, 'preview')` on every move and
 * `onChange(box, 'end')` once on release, so the editor can make one undo step.
 * A cancelled drag sends the starting box as 'preview', then calls `onCancel`
 * (or, with none given, sends the starting box as 'end'). A click that moved
 * nothing sends nothing. `view` is what SelectionOverlay reports (where the
 * picture sits in its wrap, and the scale k from frame pixels to CSS pixels).
 */
export interface TransformBoxProps {
  box: LayerBox;
  view: View;
  frame: { w: number; h: number };
  onChange: (box: LayerBox, mode: 'preview' | 'end') => void;
  onCancel?: () => void;
  /** Accessible name of the box. */
  label?: string;
}

type Kind = { t: 'move' } | { t: 'rotate' } | { t: 'resize'; h: Handle };

/** CSS pixels from the box to its rotate handle. */
const ROTATE_GAP = 28;
/** Below this many CSS pixels a side is too short for its middle handle to be told from the corners. */
const EDGE_MIN = 56;
/** Below this many CSS pixels the corner handles are pushed outward so they do not pile up. */
const SMALL = 32;
const NAMES: Record<Handle, string> = { nw: 'top left', n: 'top', ne: 'top right', e: 'right', se: 'bottom right', s: 'bottom', sw: 'bottom left', w: 'left' };
const NUDGE = 1;
const NUDGE_BIG = 10;

/** The resize cursor for a handle, turned with the box: ew, nwse, ns or nesw, whichever is nearest. */
export function cursorFor(h: Handle, rotation: number): string {
  const a = ((((Math.atan2(SIGN[h][1], SIGN[h][0]) * 180) / Math.PI + rotation) % 180) + 180) % 180;
  return (['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const)[Math.round(a / 45) % 4]!;
}

export function TransformBox({ box, view, frame, onChange, onCancel, label = 'Selected picture' }: TransformBoxProps) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: Kind; start: LayerBox; grab: Pt; offset: Pt; last: LayerBox; moved: boolean; id?: number } | null>(null);
  const esc = useRef<((e: globalThis.KeyboardEvent) => void) | null>(null);
  const props = useRef({ onChange, onCancel });
  props.current = { onChange, onCancel };
  const { k } = view;

  const toFrame = (e: { clientX: number; clientY: number }): Pt => {
    const r = root.current?.getBoundingClientRect();
    return { x: (e.clientX - (r?.left ?? 0)) / k, y: (e.clientY - (r?.top ?? 0)) / k };
  };

  const finish = () => {
    if (esc.current) window.removeEventListener('keydown', esc.current);
    esc.current = null;
    drag.current = null;
  };
  useEffect(() => finish, []);

  const begin = (kind: Kind) => (e: ReactPointerEvent) => {
    if (e.button !== 0 && e.button !== undefined) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // No active pointer to capture (a synthetic event); the drag still works through bubbling.
    }
    const grab = toFrame(e);
    const at = kind.t === 'resize' ? handlePositions(box)[kind.h] : grab;
    drag.current = { kind, start: box, grab, offset: { x: at.x - grab.x, y: at.y - grab.y }, last: box, moved: false, id: e.pointerId };
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key !== 'Escape' || !drag.current) return;
      ev.preventDefault();
      cancel();
    };
    esc.current = onKey;
    window.addEventListener('keydown', onKey);
  };

  const cancel = () => {
    const d = drag.current;
    if (!d) return;
    finish();
    if (!d.moved) return;
    props.current.onChange(d.start, 'preview');
    if (props.current.onCancel) props.current.onCancel();
    else props.current.onChange(d.start, 'end');
  };

  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toFrame(e);
    let next: LayerBox;
    if (d.kind.t === 'move') next = moveBox(d.start, p.x - d.grab.x, p.y - d.grab.y, frame);
    else if (d.kind.t === 'rotate') next = rotateBox(d.start, p, { grab: d.grab, snapDeg: e.shiftKey ? 15 : undefined });
    else {
      const h = d.kind.h;
      // Shift flips the default: corners keep the ratio unless it is held, edges only while it is.
      next = resizeBox(d.start, h, { x: p.x + d.offset.x, y: p.y + d.offset.y }, { proportional: isCorner(h) ? !e.shiftKey : e.shiftKey, fromCentre: e.altKey });
    }
    d.last = next;
    d.moved = true;
    props.current.onChange(next, 'preview');
  };

  const up = () => {
    const d = drag.current;
    if (!d) return;
    finish();
    if (d.moved) props.current.onChange(d.last, 'end');
  };

  const key = (e: KeyboardEvent) => {
    const step = e.shiftKey ? NUDGE_BIG : NUDGE;
    const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
    if (!d || drag.current) return;
    e.preventDefault();
    props.current.onChange(moveBox(box, d[0], d[1], frame), 'end');
  };

  /** Arrow keys on a focused handle: a resize handle moves toward the arrow (Shift: 10), the rotate handle turns by 1 degree (Shift: 15). */
  const handleKey = (h: Handle | 'rotate') => (e: KeyboardEvent) => {
    const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    if (!delta || drag.current) return;
    e.preventDefault();
    e.stopPropagation();
    if (h === 'rotate') {
      const turn = delta[0] !== 0 ? delta[0] : delta[1];
      props.current.onChange({ ...box, rotation: box.rotation + turn * (e.shiftKey ? 15 : 1) }, 'end');
      return;
    }
    const step = e.shiftKey ? NUDGE_BIG : NUDGE;
    const at = handlePositions(box)[h];
    props.current.onChange(resizeBox(box, h, { x: at.x + delta[0] * step, y: at.y + delta[1] * step }, { proportional: isCorner(h) }), 'end');
  };

  const sw = box.w * k;
  const sh = box.h * k;
  const small = Math.min(sw, sh) < SMALL;
  const shown = HANDLES.filter((h) => isCorner(h) || (SIGN[h][0] !== 0 ? sh : sw) >= EDGE_MIN);

  return (
    <div ref={root} className="tbox-root" data-testid="transform-box" style={{ left: view.left, top: view.top, width: frame.w * k, height: frame.h * k }}>
      <div
        className="tbox"
        role="group"
        aria-label={`${label}. Arrow keys move it, Shift for larger steps.`}
        tabIndex={0}
        style={{ left: (box.cx - box.w / 2) * k, top: (box.cy - box.h / 2) * k, width: sw, height: sh, transform: `rotate(${box.rotation}deg)` }}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onKeyDown={key}
      >
        <div className="tbox-body" data-part="body" onPointerDown={begin({ t: 'move' })} />
        <div className="tbox-stem" style={{ top: -ROTATE_GAP, height: ROTATE_GAP }} />
        <div className="tbox-h is-rotate" data-handle="rotate" role="button" tabIndex={0} aria-label="Rotate" title="Rotate (Shift: 15 degree steps)" style={{ left: '50%', top: -ROTATE_GAP, transform: 'translate(-50%, -50%)' }} onPointerDown={begin({ t: 'rotate' })} onKeyDown={handleKey('rotate')} />
        {shown.map((h) => {
          const [sx, sy] = SIGN[h];
          const out = small && isCorner(h) ? 14 : 0;
          return (
            <div
              key={h}
              className="tbox-h"
              data-handle={h}
              role="button"
              tabIndex={0}
              aria-label={`Resize from ${NAMES[h]}`}
              style={{ left: `${50 + sx * 50}%`, top: `${50 + sy * 50}%`, transform: `translate(calc(-50% + ${sx * out}px), calc(-50% + ${sy * out}px))`, cursor: cursorFor(h, box.rotation) }}
              onPointerDown={begin({ t: 'resize', h })}
              onKeyDown={handleKey(h)}
            />
          );
        })}
      </div>
    </div>
  );
}
