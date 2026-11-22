import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../../components/Icon.tsx';
import type { LiveClock } from '../../video/live-clock.ts';
import type { ChangeMode, FrameStrip, ProjectChange, Selection } from '../../video/contracts.ts';
import { makeTileCache } from '../../video/frames.ts';
import { isText, sourceOf, trackOf, type VideoProject } from '../../video/project.ts';
import { layerSpan, projectEnd, rulerTicks } from '../../video/timeline-math.ts';
import { length as clipLength, startOf, total } from '../../video/timeline.ts';
import { useGestures } from '../useGestures.ts';
import { RULER_H, ROW_H, MAIN_H, barKind, clampRowScroll, geometryOf, hitAt, moveDrag, scrubPoints, trimDrag, type DragBase, type Target } from './timeline-model.ts';
import { flingAt, pinchZoom, scrubSnap, scrubTime, screenXOf, timeAtScreenX, velocityOf, type Sample } from './scrub-math.ts';

export interface PhoneTimelineProps {
  project: VideoProject;
  /** The edit second under the (fixed, centre) playhead, as React last heard it (a few times a second while playing). */
  time: number;
  /** The playhead every frame: the content is moved from this directly, so playing costs no render. */
  clock?: LiveClock;
  playing: boolean;
  selection: Selection;
  /** Pixels per second. */
  zoom: number;
  onZoom(pxPerSecond: number): void;
  strips: FrameStrip[];
  snapping?: boolean;
  disabled?: boolean;
  onSeek(t: number): void;
  /** A finger took hold of the timeline: playback should pause. */
  onScrubStart(): void;
  onSelect(s: Selection): void;
  onChange(change: ProjectChange, mode: ChangeMode): void;
  /** The "+" on a join: `clipId` is the clip AFTER the join (the one that carries `transitionIn`). */
  onTransition(clipId: string): void;
  /** Files picked with the "+" at the end of the main track. */
  onAddFiles(files: File[]): void;
}

const TILE_PX = 56;
const KEY_STEP = 0.1;
const FALLBACK_W = 360;

const clock = (s: number): string => (s >= 10 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`);

type Moving = { base: DragBase; moved: boolean };
type Trimming = { base: DragBase; edge: 'start' | 'end'; moved: boolean };

/**
 * The phone timeline, CapCut style: the playhead stays at the centre and the
 * content slides under it. A swipe scrubs (with a fling), a pinch zooms about
 * the playhead, a tap picks (or opens a join's transition), a long press then
 * a drag reorders a main clip or slides a layer in time, and the picked bar
 * shows 44 px handles at both ends to trim. It holds no edit state: drags send
 * `preview` changes and one `end`, exactly as the desktop timeline does.
 *
 * The maths is in scrub-math.ts and timeline-model.ts.
 */
export function PhoneTimeline(props: PhoneTimelineProps) {
  const { project, time, zoom, selection, strips, playing } = props;
  const root = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  /** The playhead right now: the live clock when there is one, else the last rendered time. */
  const nowT = (): number => latest.current.clock?.get() ?? latest.current.time;
  const contentA = useRef<HTMLDivElement>(null);
  const contentB = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_W);
  const [rowScroll, setRowScroll] = useState(0);
  const rowRef = useRef(0);
  rowRef.current = rowScroll;
  const [guide, setGuide] = useState<number | null>(null);
  const [marker, setMarker] = useState<number | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const tilesFor = useRef(makeTileCache()).current;

  const centre = width / 2;
  const g = geometryOf(project);
  const mainTotal = total(project.clips);
  const end = projectEnd(project);

  const measure = useCallback(() => {
    const w = root.current?.getBoundingClientRect().width || root.current?.clientWidth || FALLBACK_W;
    setWidth((o) => (o === w ? o : w));
  }, []);
  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Rows that no longer overflow cannot stay scrolled.
  useEffect(() => {
    setRowScroll((r) => clampRowScroll(r, g));
  }, [g.maxRowScroll]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Timeline px from time 0 for a clientX, with the playhead where it is now. */
  const contentX = (clientX: number): number => {
    const r = surface.current?.getBoundingClientRect();
    const p = latest.current;
    return (clientX - (r?.left ?? 0)) - (r?.width || FALLBACK_W) / 2 + nowT() * p.zoom;
  };

  // ---- scrubbing, flinging, zooming, tapping ----
  const drag = useRef<{ axis: 'x' | 'y'; t0: number; r0: number; samples: Sample[] } | null>(null);
  const zoom0 = useRef(zoom);
  const flingRaf = useRef<number | null>(null);
  const stopFling = () => {
    if (flingRaf.current !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(flingRaf.current);
    flingRaf.current = null;
  };
  useEffect(() => stopFling, []);

  const scrubTo = (t: number, soft = true) => {
    const p = latest.current;
    const s = soft ? scrubSnap(t, scrubPoints(p.project), p.zoom) : { time: t };
    p.onSeek(s.time);
  };

  const moving = useRef<Moving | null>(null);
  const trimming = useRef<Trimming | null>(null);

  const startMove = (pt: { x: number; y: number }) => {
    const p = latest.current;
    const t = timeAtScreenX(pt.x, nowT(), p.zoom, (surface.current?.getBoundingClientRect().width || FALLBACK_W) / 2);
    const hit = hitAt(p.project, pt.y, t, p.zoom, rowRef.current);
    if (hit.kind !== 'clip' && hit.kind !== 'layer') return;
    const target: Target = { kind: hit.kind, id: hit.id };
    p.onScrubStart();
    p.onSelect({ kind: hit.kind, id: hit.id });
    const r = surface.current?.getBoundingClientRect();
    const x0 = pt.x - (r?.width || FALLBACK_W) / 2 + nowT() * p.zoom;
    moving.current = { base: { target, x0, origin: p.project }, moved: false };
    setLifted(hit.id);
    const move = (e: PointerEvent) => {
      const m = moving.current;
      if (!m) return;
      const q = latest.current;
      const r = moveDrag(m.base, contentX(e.clientX), { zoom: q.zoom, time: nowT(), snapping: q.snapping ?? true });
      m.moved = true;
      setMarker(r.marker);
      setGuide(r.guide);
      q.onChange(r.change, 'preview');
    };
    const finish = (cancelled: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      const m = moving.current;
      moving.current = null;
      setLifted(null);
      setMarker(null);
      setGuide(null);
      if (!m?.moved) return;
      // A cancelled touch puts everything back; a release keeps the last preview.
      if (cancelled) latest.current.onChange({ clips: m.base.origin.clips, layers: m.base.origin.layers }, 'preview');
      latest.current.onChange({}, 'end');
    };
    const up = () => finish(false);
    const cancel = () => finish(true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  useGestures(
    surface,
    {
      onTap: (pt) => {
        const p = latest.current;
        const t = timeAtScreenX(pt.x, nowT(), p.zoom, (surface.current?.getBoundingClientRect().width || FALLBACK_W) / 2);
        stopFling();
        if (pt.y < RULER_H) return p.onSeek(Math.max(0, t));
        const hit = hitAt(p.project, pt.y, t, p.zoom, rowRef.current);
        if (hit.kind === 'clip' || hit.kind === 'layer') p.onSelect({ kind: hit.kind, id: hit.id });
        else if (hit.kind === 'joint') p.onTransition(hit.id);
        else p.onSelect(null);
      },
      onLongPress: startMove,
      onDragStart: (e) => {
        stopFling();
        const p = latest.current;
        const axis = Math.abs(e.dx) >= Math.abs(e.dy) || g.maxRowScroll === 0 ? 'x' : 'y';
        drag.current = { axis, t0: nowT(), r0: rowRef.current, samples: [{ x: e.x, t: performance.now() }] };
        if (axis === 'x') p.onScrubStart();
        if (axis === 'x') scrubTo(scrubTime(drag.current.t0, e.dx, p.zoom, projectEnd(p.project)));
        else setRowScroll(clampRowScroll(drag.current.r0 - e.dy, g));
      },
      onDrag: (e) => {
        const d = drag.current;
        const p = latest.current;
        if (!d) return;
        if (d.axis === 'y') return setRowScroll(clampRowScroll(d.r0 - e.dy, geometryOf(p.project)));
        d.samples.push({ x: e.x, t: performance.now() });
        if (d.samples.length > 8) d.samples.shift();
        scrubTo(scrubTime(d.t0, e.dx, p.zoom, projectEnd(p.project)));
      },
      onDragEnd: () => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.axis !== 'x' || typeof requestAnimationFrame !== 'function') return;
        const v = velocityOf(d.samples);
        if (Math.abs(v) < 0.2) return;
        const t0 = nowT();
        const born = performance.now();
        const step = () => {
          const p = latest.current;
          const f = flingAt(v, performance.now() - born);
          const t = scrubTime(t0, f.dist, p.zoom, projectEnd(p.project));
          p.onSeek(t);
          const atEdge = t <= 0 || t >= projectEnd(p.project);
          flingRaf.current = f.done || atEdge ? null : requestAnimationFrame(step);
        };
        flingRaf.current = requestAnimationFrame(step);
      },
      onTransformStart: () => {
        stopFling();
        zoom0.current = latest.current.zoom;
        latest.current.onScrubStart();
      },
      onTransform: (e) => latest.current.onZoom(pinchZoom(zoom0.current, e.scale)),
    },
    !props.disabled,
  );

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    props.onSeek(nowT() + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : KEY_STEP));
  };

  // ---- trim handles (outside the gesture surface, so a handle drag is never a scrub) ----
  const selTarget: Target | null = selection ? { kind: selection.kind, id: selection.id } : null;
  const selSpan = (() => {
    if (!selTarget) return null;
    if (selTarget.kind === 'clip') {
      const i = project.clips.findIndex((c) => c.id === selTarget.id);
      return i < 0 ? null : { start: startOf(project.clips, i), end: startOf(project.clips, i) + clipLength(project.clips[i]!), row: -1 };
    }
    const l = project.layers.find((v) => v.id === selTarget.id);
    if (!l) return null;
    return { ...layerSpan(l, end), row: g.lanes.indexOf(trackOf(l)) };
  })();

  const beginTrim = (edge: 'start' | 'end') => (e: ReactPointerEvent) => {
    if (!selTarget || props.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* no active pointer to capture (a synthetic event) */
    }
    stopFling();
    props.onScrubStart();
    trimming.current = { edge, moved: false, base: { target: selTarget, x0: contentX(e.clientX), origin: project } };
  };
  const moveTrim = (e: ReactPointerEvent) => {
    const t = trimming.current;
    if (!t) return;
    const r = trimDrag(t.base, t.edge, contentX(e.clientX), { zoom, time: nowT(), snapping: props.snapping ?? true });
    t.moved = true;
    setGuide(r.guide);
    props.onChange(r.change, 'preview');
  };
  const endTrim = () => {
    const t = trimming.current;
    trimming.current = null;
    setGuide(null);
    if (t?.moved) props.onChange({}, 'end');
  };

  // The content follows the live clock directly (one transform write per animation frame, no render).
  const widthRef = useRef(width);
  widthRef.current = width;
  useEffect(() => {
    const clock = props.clock;
    if (!clock) return;
    return clock.subscribe((t) => {
      const v = `translate3d(${screenXOf(0, t, latest.current.zoom, widthRef.current / 2)}px, 0, 0)`;
      if (contentA.current) contentA.current.style.transform = v;
      if (contentB.current) contentB.current.style.transform = v;
    });
  }, [props.clock]);

  // ---- drawing ----
  const px = (t: number) => t * zoom;
  const shown = props.clock?.get() ?? time;
  const from = Math.max(0, shown - centre / zoom);
  // The time reaches React a few times a second while playing, so the ruler is drawn a little past the right edge.
  const ticks = rulerTicks(zoom, width + 64 + Math.round(zoom * 0.5), from);
  const stripOf = (srcId: string | undefined) => strips.find((s) => s.srcId === srcId);

  const contentStyle = { transform: `translate3d(${screenXOf(0, shown, zoom, centre)}px, 0, 0)` };
  const rowsInStyle = { transform: `translate3d(0, ${-rowScroll}px, 0)` };
  const handleRow = selSpan && selSpan.row >= 0 ? RULER_H + selSpan.row * ROW_H - rowScroll : g.mainTop;
  const handleH = selSpan && selSpan.row >= 0 ? ROW_H : MAIN_H;
  const handleVisible = selSpan !== null && (selSpan.row < 0 || (handleRow >= RULER_H - 1 && handleRow + handleH <= g.mainTop + 1));

  return (
    <div ref={root} className={`pv-tl${playing ? ' is-playing' : ''}`} style={{ height: g.height }} data-testid="phone-timeline">
      <div ref={surface} className="pv-tl-surface" role="group" tabIndex={0} aria-label="Timeline. Swipe to move the playhead, pinch to zoom, tap to pick, press and hold to move." onKeyDown={onKeyDown}>
        <div ref={contentA} className="pv-tl-content" style={contentStyle} data-px-per-second={zoom}>
          <div className="pv-ruler" aria-hidden="true" style={{ height: RULER_H }}>
            {ticks.map((k) => (
              <span key={k.t} className={`pv-tick${k.major ? ' is-major' : ''}`} style={{ left: px(k.t) }}>
                {k.label && <i>{k.label}</i>}
              </span>
            ))}
          </div>

          <div className="pv-rows" style={{ top: RULER_H, height: g.rowsH }}>
            <div className="pv-rows-in" style={rowsInStyle}>
              {g.lanes.map((lane, row) =>
                project.layers
                  .filter((l) => trackOf(l) === lane)
                  .map((l) => {
                    const s = layerSpan(l, end);
                    const kind = barKind(project, l);
                    const sel = selection?.kind === 'layer' && selection.id === l.id;
                    const name = isText(l) ? l.text || 'Text' : (sourceOf(project, l.srcId)?.name ?? 'Missing file');
                    return (
                      <div key={l.id} data-item={l.id} className={`pv-bar pv-bar-${kind}${sel ? ' is-selected' : ''}${lifted === l.id ? ' is-lifted' : ''}`} style={{ left: px(s.start), width: Math.max(6, px(s.end - s.start)), top: row * ROW_H + 3, height: ROW_H - 6 }}>
                        <span>{name}</span>
                      </div>
                    );
                  }),
              )}
            </div>
          </div>

          <div className="pv-main" style={{ top: g.mainTop, height: MAIN_H }}>
            {project.clips.map((c, i) => {
              const at = startOf(project.clips, i);
              const len = clipLength(c);
              const w = Math.max(8, px(len));
              const sel = selection?.kind === 'clip' && selection.id === c.id;
              const tiles = tilesFor(c.id, stripOf(c.srcId), c.start, c.end, Math.max(1, Math.ceil(w / TILE_PX)));
              return (
                <div key={c.id} data-item={c.id} className={`pv-clip${sel ? ' is-selected' : ''}${lifted === c.id ? ' is-lifted' : ''}`} style={{ left: px(at), width: w, height: MAIN_H - 6, top: 3 }}>
                  <Tiles tiles={tiles} />
                  <span className="pv-clip-len">{clock(len)}</span>
                </div>
              );
            })}
          </div>
          {marker !== null && <div className="pv-marker" style={{ left: px(marker), top: g.mainTop }} aria-hidden="true" />}
          {guide !== null && <div className="pv-guide" style={{ left: px(guide) }} aria-hidden="true" />}
        </div>
      </div>

      {/* Controls that must not be scrubs: they sit above the surface and move with the content. */}
      <div className="pv-tl-over" aria-hidden={false}>
        <div ref={contentB} className="pv-tl-content" style={contentStyle}>
          {project.clips.slice(1).map((c, i) => (
            <button key={c.id} type="button" className={`pv-joint${c.transitionIn ? ' has-transition' : ''}`} style={{ left: px(startOf(project.clips, i + 1)), top: g.mainTop + MAIN_H / 2 - 22 }} aria-label={`Transition between clip ${i + 1} and clip ${i + 2}`} disabled={props.disabled} onClick={() => props.onTransition(c.id)}>
              <Icon name={c.transitionIn ? 'close' : 'plus'} size="1rem" />
            </button>
          ))}
          {project.clips.length > 0 && (
            <label className={`pv-add${props.disabled ? ' is-disabled' : ''}`} style={{ left: px(mainTotal) + 10, top: g.mainTop + MAIN_H / 2 - 22 }}>
              <span aria-hidden="true">+</span>
              <input
                type="file"
                multiple
                accept="video/*,image/*,audio/*"
                aria-label="Add a video, picture or sound"
                disabled={props.disabled}
                onChange={(e) => {
                  const list = [...(e.target.files ?? [])];
                  e.target.value = '';
                  if (list.length > 0) props.onAddFiles(list);
                }}
              />
            </label>
          )}
          {handleVisible && selSpan && (
            <>
              <div className="pv-trim is-start" data-edge="start" role="button" aria-label="Trim the start" style={{ left: px(selSpan.start) - 30, top: handleRow, height: handleH }} onPointerDown={beginTrim('start')} onPointerMove={moveTrim} onPointerUp={endTrim} onPointerCancel={endTrim}>
                <i />
              </div>
              <div className="pv-trim is-end" data-edge="end" role="button" aria-label="Trim the end" style={{ left: px(selSpan.end) - 14, top: handleRow, height: handleH }} onPointerDown={beginTrim('end')} onPointerMove={moveTrim} onPointerUp={endTrim} onPointerCancel={endTrim}>
                <i />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="pv-playhead" aria-hidden="true" />
    </div>
  );
}

/** The pictures along a clip; a new array only when they change, so playback redraws skip it. */
const Tiles = memo(function Tiles({ tiles }: { tiles: string[] }) {
  if (tiles.length === 0) return null;
  return (
    <span className="pv-tiles" aria-hidden="true">
      {tiles.map((url, k) => (
        <img key={k} src={url} alt="" draggable={false} />
      ))}
    </span>
  );
});

