import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { LayerCanvas } from '../../editor/LayerCanvas.tsx';
import { DEFAULT_TEXT } from '../../editor/layers.ts';
import { SelectionOverlay } from '../../editor/SelectionOverlay.tsx';
import { HANDLES, handlePositions, resizeBox, rotateBox, type Handle, type Pt } from '../../editor/transform-math.ts';
import { boxOfMedia, patchOfBox } from '../../editor/transform-math.ts';
import { hitLayers } from '../../video/boxes.ts';
import type { ChangeMode } from '../../video/contracts.ts';
import { isMedia, isText, type Layer, type MediaLayer } from '../../video/project.ts';
import type { VideoEditorState } from '../../video/useVideoEditor.ts';
import { useGestures } from '../useGestures.ts';
import { movedTo, previewScale, transformedMedia, transformedText } from './preview-math.ts';

const CORNERS: Handle[] = HANDLES.filter((h) => h.length === 2);

/**
 * The picture on top. The compositor's canvas is drawn exactly as on the
 * desktop; on top of it one gesture surface owns every touch:
 *   tap          picks the layer under the finger (a second tap on picked text types), or clears the pick
 *   drag         moves the layer it began on
 *   two fingers  pinch resizes (text: its size), twist turns, the midpoint moves
 * The picked picture or video also gets a box with 44 px corner handles and a
 * turn handle, for people who prefer to grab something.
 */
export function PhonePreview({ ed }: { ed: VideoEditorState }) {
  const { project, frame, scene, wrap, shownText, sel, time, transport, textLayer, mediaLayer, onFrame, typing } = ed;
  const frameEl = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const live = useRef(ed);
  live.current = ed;
  /** The canvas needs about as many pixels as the screen shows (up to 2 per CSS px), not the project's 1280: a quarter to a half of the work each frame, and much less memory. */
  const renderScale = useMemo(() => previewScale(frame.w, typeof window === 'undefined' ? 0 : window.innerWidth, typeof window === 'undefined' ? 1 : window.devicePixelRatio), [frame.w]);
  const timeSource = useRef(() => live.current.transport?.time ?? live.current.time).current;
  /** What a drag or pinch started from: the layer as it was (keyframes resolved), by id. */
  const base = useRef<{ id: string; layer: Layer } | null>(null);

  /** Screen px per frame px, from the box the picture really has. */
  const scale = (): number => {
    const w = frameEl.current?.getBoundingClientRect().width || frame.w;
    return w / frame.w;
  };
  const at = (p: Pt): Pt => {
    const k = scale();
    return { x: p.x / k, y: p.y / k };
  };
  const pick = (p: Pt): string | null => {
    const e = live.current;
    const f = at(p);
    const ctx = scene.current?.canvas()?.getContext('2d') ?? undefined;
    return hitLayers(e.project.layers, f.x, f.y, ctx, e.time);
  };
  const layerOf = (id: string | null): Layer | undefined => (id ? live.current.projectRef.current.layers.find((l) => l.id === id) : undefined);

  const begin = (id: string) => {
    const l = layerOf(id);
    if (!l) return false;
    base.current = { id, layer: live.current.nowOf(l) };
    return true;
  };
  const patch = (id: string, p: object, mode: ChangeMode = 'preview') => {
    const e = live.current;
    e.change({ layers: e.patchKeyed(e.projectRef.current.layers, id, p) }, mode);
  };
  const finish = () => {
    base.current = null;
    live.current.change({}, 'end');
  };

  useGestures(
    surface,
    {
      onTap: (pt) => {
        const e = live.current;
        const id = pick(pt);
        if (!id) {
          e.setSel(null);
          e.setTyping(false);
          return;
        }
        const l = layerOf(id);
        // A second tap on the text that is already picked starts typing on it.
        if (e.sel?.kind === 'layer' && e.sel.id === id && l && isText(l)) e.setTyping(true);
        else {
          e.setSel({ kind: 'layer', id });
          e.setTyping(false);
        }
      },
      onDragStart: (ev) => {
        const e = live.current;
        // The drag began where the finger went down, not where it is after the 10 px of slop.
        const id = pick({ x: ev.x - ev.dx, y: ev.y - ev.dy });
        if (!id || !begin(id)) {
          base.current = null;
          return;
        }
        e.setSel({ kind: 'layer', id });
        e.setTyping(false);
        const b = base.current!.layer as MediaLayer;
        patch(id, movedTo(b, ev.dx, ev.dy, scale(), live.current.frame));
      },
      onDrag: (ev) => {
        const b = base.current;
        if (!b) return;
        patch(b.id, movedTo(b.layer as MediaLayer, ev.dx, ev.dy, scale(), live.current.frame));
      },
      onDragEnd: () => {
        if (base.current) finish();
      },
      onTransformStart: () => {
        const e = live.current;
        const id = e.sel?.kind === 'layer' ? e.sel.id : null;
        if (!id || !begin(id)) base.current = null;
      },
      onTransform: (ev) => {
        const b = base.current;
        if (!b) return;
        const l = b.layer;
        if (isMedia(l)) patch(b.id, transformedMedia(l, ev.scale, ev.rotation, ev, scale()));
        else if (isText(l)) {
          const t = transformedText({ size: l.style.size, rotation: l.rotation ?? 0 }, ev.scale, ev.rotation, Math.max(60, Math.round(live.current.frame.h / 2)));
          patch(b.id, { rotation: t.rotation, style: { ...l.style, size: t.size } });
        }
      },
      onTransformEnd: () => {
        if (base.current) finish();
      },
    },
    !ed.busyOut,
  );

  return (
    <div className="pv-stage" ref={wrap} data-testid="phone-preview">
      <div className="pv-frame" ref={frameEl} style={{ '--ar': frame.w / frame.h } as React.CSSProperties}>
        <LayerCanvas
          ref={scene}
          width={frame.w}
          height={frame.h}
          layers={shownText}
          project={project}
          media={transport ?? { picture: () => null }}
          time={time}
          timeSource={timeSource}
          renderScale={renderScale}
          selectedId={sel?.kind === 'layer' ? sel.id : null}
          onSelect={(id) => ed.setSel(id ? { kind: 'layer', id } : null)}
          onDrag={(id, x, y) => ed.change({ layers: ed.patchKeyed(ed.projectRef.current.layers, id, { x, y }) }, 'preview')}
          onDragEnd={() => ed.change({}, 'end')}
          label="The video frame."
        />
        <div ref={surface} className="pv-gesture" aria-hidden="true" data-testid="preview-surface" />
        {mediaLayer && !typing && <PhoneBox ed={ed} layer={mediaLayer} frameEl={frameEl} />}
      </div>
      <SelectionOverlay scene={scene} wrap={wrap} active={typing ? onFrame : []} watch={[onFrame, frame, typing]} typing={typing} minFontPx={16} selectOnOpen={textLayer?.text === DEFAULT_TEXT} onType={(text) => textLayer && ed.commitMerge(`t:${textLayer.id}`, { layers: ed.layers.map((l) => (l.id === textLayer.id ? ({ ...l, text } as Layer) : l)) })} onStopTyping={() => ed.setTyping(false)} toolbar={null} />
    </div>
  );
}

/** The outline of the picked picture or video, in percent of the frame (so it needs no measuring), with corner handles to resize and a handle below to turn. */
function PhoneBox({ ed, layer, frameEl }: { ed: VideoEditorState; layer: MediaLayer; frameEl: React.RefObject<HTMLDivElement | null> }) {
  const now = ed.nowOf(layer);
  const box = boxOfMedia(now);
  const { frame } = ed;
  const drag = useRef<{ kind: 'resize'; h: Handle; start: typeof box; offset: Pt; last: typeof box } | { kind: 'rotate'; start: typeof box; grab: Pt; last: typeof box } | null>(null);

  const toFrame = (e: { clientX: number; clientY: number }): Pt => {
    const r = frameEl.current?.getBoundingClientRect();
    const k = (r?.width || frame.w) / frame.w;
    return { x: (e.clientX - (r?.left ?? 0)) / k, y: (e.clientY - (r?.top ?? 0)) / k };
  };
  const down = (kind: Handle | 'rotate') => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* no active pointer to capture (a synthetic event) */
    }
    const grab = toFrame(e);
    if (kind === 'rotate') drag.current = { kind: 'rotate', start: box, grab, last: box };
    else {
      const at = handlePositions(box)[kind];
      drag.current = { kind: 'resize', h: kind, start: box, offset: { x: at.x - grab.x, y: at.y - grab.y }, last: box };
    }
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toFrame(e);
    const next = d.kind === 'rotate' ? rotateBox(d.start, p, { grab: d.grab }) : resizeBox(d.start, d.h, { x: p.x + d.offset.x, y: p.y + d.offset.y }, { proportional: true });
    d.last = next;
    ed.change({ layers: ed.patchKeyed(ed.projectRef.current.layers, layer.id, patchOfBox(next)) }, 'preview');
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.last !== d.start) ed.change({}, 'end');
  };

  const style = {
    left: `${((box.cx - box.w / 2) / frame.w) * 100}%`,
    top: `${((box.cy - box.h / 2) / frame.h) * 100}%`,
    width: `${(box.w / frame.w) * 100}%`,
    height: `${(box.h / frame.h) * 100}%`,
    transform: `rotate(${box.rotation}deg)`,
  };
  const pos: Record<string, [number, number]> = { nw: [0, 0], ne: [100, 0], se: [100, 100], sw: [0, 100] };
  return (
    <div className="pv-box" style={style} data-testid="phone-box" role="group" aria-label="Selected picture. Drag to move, pinch to resize, twist to turn.">
      {CORNERS.map((h) => (
        <div key={h} className="pv-handle" data-handle={h} role="button" aria-label={`Resize from ${h}`} style={{ left: `${pos[h]![0]}%`, top: `${pos[h]![1]}%` }} onPointerDown={down(h)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <i />
        </div>
      ))}
      <div className="pv-handle is-rotate" data-handle="rotate" role="button" aria-label="Turn" style={{ left: '50%', top: '100%' }} onPointerDown={down('rotate')} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <i />
      </div>
    </div>
  );
}
