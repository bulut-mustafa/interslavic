import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isAudio, isText, sourceOf, trackOf, type Layer, type VideoProject } from './project.ts';
import type { FrameStrip, ProjectChange, TimelineProps } from './contracts.ts';
import { makeTileCache, stripPicture } from './frames.ts';
import { drawPeaks, peaksOf } from './waveform.ts';
import {
  MAX_ZOOM, MIN_ZOOM, clampZoom, clockTenths, keyMarks, mostCommon, moveKeysAt, slicePeaks, dropGap, gapTime, indexAfterDrop, laneAtY, layerEdges, layerSpan, moveLayer, projectEnd, pxToTime, rulerTicks, scrollForAnchor, snap, snapPoints,
  snapSpan, timeToPx, topTrack, trimLayerEnd, trimLayerStart, zoomToFit,
} from './timeline-math.ts';
import { length, moveClipTo, rippleTrim, speedOf, startOf, total } from './timeline.ts';
import { effectiveDuration, labelOf } from './transitions.ts';
import './timeline.css';

export type { Selection } from './contracts.ts';

/** Extras the timeline takes beyond the shared `TimelineProps`. */
export interface TimelineExtras {
  /** The joint between two main clips was pressed; `clipId` is the clip AFTER the cut (the one that carries `transitionIn`). */
  onTransition?(clipId: string): void;
  /** The file behind a source, for drawing waveforms. Without it (or when it returns null) no waveform is drawn. */
  fileOf?(srcId: string): File | null;
}

/** On a touchscreen the rows are taller so a finger can pick one (44 px is the touch-target guideline). Read once; a desktop window stays as it was. */
const coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: coarse)').matches;
const RULER_H = coarse ? 40 : 26;
const ROW_H = coarse ? 44 : 36;
const MAIN_H = coarse ? 56 : 52;
const SNAP_PX = 8;
/** A press must travel this far before it counts as a drag, so a click never edits. */
const DRAG_PX = 3;
const NUDGE = 0.1;
const TILE_PX = 64;
const TAIL_PX = 160;
/** Waveform detail kept per source; a bar draws the part it plays. */
const PEAK_BUCKETS = 800;
/** Canvases wider than this are drawn at this many device pixels and stretched (browsers limit canvas size). */
const MAX_WAVE_PX = 4096;
const KEY_PX = 10;

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

type Edge = 'start' | 'end';
type Target = { kind: 'clip' | 'layer'; id: string };
type Drag =
  | { mode: 'scrub' }
  /** A finger on an empty lane: a tap seeks, a drag is left to the browser to scroll with. */
  | { mode: 'tap' }
  | { mode: 'key'; layerId: string; t0: number; x0: number; origin: VideoProject; moved: boolean; last: ProjectChange | null }
  | { mode: 'move' | Edge; target: Target; x0: number; y0: number; origin: VideoProject; moved: boolean; last: ProjectChange | null };

/** The name a screen reader and a tooltip give a layer. */
export function layerName(p: VideoProject, l: Layer): string {
  if (isText(l)) return `Text: ${l.text.slice(0, 30)}`;
  const src = sourceOf(p, l.srcId);
  const name = src?.name ?? 'missing file';
  if (isAudio(l) || src?.kind === 'audio') return `Sound: ${name}`;
  return src?.kind === 'image' ? `Picture: ${name}` : `Video: ${name}`;
}

const layerKind = (p: VideoProject, l: Layer): 'text' | 'picture' | 'video' | 'sound' => {
  if (isText(l)) return 'text';
  if (isAudio(l)) return 'sound';
  return sourceOf(p, l.srcId)?.kind === 'image' ? 'picture' : 'video';
};

/** The change a drag makes to the origin project at the pointer position, with the snap point hit and the main-track insertion time. */
export function dragChange(
  drag: Extract<Drag, { target: Target }>,
  ptr: { x: number; y: number },
  env: { zoom: number; snapping: boolean; time: number },
): { change: ProjectChange; guide: number | null; marker: number | null } {
  const o = drag.origin;
  const { zoom, snapping } = env;
  const dt = pxToTime(ptr.x - drag.x0, zoom);
  const end = projectEnd(o);
  const snapOne = (t: number, pts: number[]) => (snapping ? snap(t, pts, SNAP_PX, zoom) : { time: t, hit: null as number | null });

  if (drag.target.kind === 'layer') {
    const l = o.layers.find((x) => x.id === drag.target.id);
    if (!l) return { change: { layers: o.layers }, guide: null, marker: null };
    const span = layerSpan(l, end);
    let next: Layer;
    let guide: number | null = null;
    if (drag.mode === 'move') {
      let start = span.start + dt;
      if (snapping) {
        const r = snapSpan(start, start + (span.end - span.start), snapPoints(o, l.id, env.time), SNAP_PX, zoom);
        start += r.shift;
        guide = r.hit;
      }
      const row = laneAtY(ptr.y, ROW_H, topTrack(o) + 1);
      next = moveLayer(l, start, row, end);
    } else {
      const pts = snapPoints(o, l.id, env.time);
      if (drag.mode === 'start') {
        const s = snapOne(span.start + dt, pts);
        guide = s.hit;
        next = trimLayerStart(o, { ...l, start: span.start, end: span.end }, s.time);
      } else {
        const s = snapOne(span.end + dt, pts);
        guide = s.hit;
        next = trimLayerEnd(o, { ...l, start: span.start, end: span.end }, s.time);
      }
    }
    return { change: { layers: o.layers.map((x) => (x.id === l.id ? next : x)) }, guide, marker: null };
  }

  const i = o.clips.findIndex((c) => c.id === drag.target.id);
  const c = o.clips[i];
  if (!c) return { change: { clips: o.clips }, guide: null, marker: null };
  if (drag.mode === 'move') {
    const gap = dropGap(o.clips, pxToTime(ptr.x, zoom));
    return { change: { clips: moveClipTo(o.clips, c.id, indexAfterDrop(i, gap)) }, guide: null, marker: gapTime(o.clips, gap) };
  }
  // Trimming a main clip: the clip keeps its place and the ones after follow (ripple). The edge that moves the clip's end is what snaps.
  const at = startOf(o.clips, i);
  const len = length(c);
  const newLen = drag.mode === 'end' ? len + dt : len - dt;
  const s = snapOne(at + newLen, [env.time, ...layerEdges(o)]);
  const delta = drag.mode === 'end' ? s.time - (at + len) : at + len - s.time;
  const duration = sourceOf(o, c.srcId)?.duration ?? Infinity;
  return { change: { clips: rippleTrim(o.clips, i, drag.mode, delta, duration) }, guide: s.hit, marker: null };
}

/**
 * The edit laid out in time. A ruler on top that can be pressed and dragged to
 * move the playhead; lanes for text, pictures, videos and sounds above the main
 * track, which holds the video clips one after another. Items can be picked,
 * dragged (in time, and between lanes), and trimmed by their edges; the main
 * track reorders and ripples. The timeline holds no edit state: a drag sends
 * `preview` changes and one `end`.
 */
export function Timeline(props: TimelineProps & TimelineExtras) {
  const { project, time, selection, zoom, snapping, strips } = props;
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const pending = useRef<number | null>(null);
  const frame = useRef(0);
  const anchor = useRef<{ time: number; offset: number } | null>(null);
  const [view, setView] = useState({ left: 0, width: 0 });
  const [guide, setGuide] = useState<number | null>(null);
  const [marker, setMarker] = useState<number | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const mainTotal = total(project.clips);
  const end = projectEnd(project);
  const contentW = Math.round(timeToPx(end, zoom) + TAIL_PX);
  const topLane = topTrack(project) + 1;
  const rows = topLane + 1; // lanes topLane..0, always one free lane above the highest in use
  const height = RULER_H + rows * ROW_H + MAIN_H;
  const stripOf = useMemo(() => new Map(strips.map((s): [string, FrameStrip] => [s.srcId, s])), [strips]);
  const tilesFor = useRef(makeTileCache()).current;
  const peaksOfSrc = usePeaks(project, props.fileOf);
  const laneName = (lane: number): string | undefined => {
    const kinds = project.layers.filter((l) => trackOf(l) === lane).map((l) => layerKind(project, l));
    const k = mostCommon(kinds);
    return k && KIND_LABEL[k];
  };

  // ---- measuring ----
  const measure = () => {
    const el = scroller.current;
    if (el) setView({ left: el.scrollLeft, width: el.clientWidth });
  };
  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- zoom: buttons, slider and ctrl/cmd + wheel all keep one moment still on screen ----
  const zoomTo = (next: number, clientX?: number) => {
    const el = scroller.current;
    const z = clampZoom(next);
    if (el) {
      const offset = clientX !== undefined ? clientX - el.getBoundingClientRect().left : el.clientWidth / 2;
      anchor.current = { time: pxToTime(el.scrollLeft + offset, latest.current.zoom), offset };
    }
    latest.current.onZoom(z);
  };
  useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    if (a && scroller.current) scroller.current.scrollLeft = scrollForAnchor(a.time, a.offset, zoom);
    measure();
  }, [zoom]);

  // The wheel listener is attached by hand with `passive: false`: only then may it call preventDefault, which stops the page itself zooming on ctrl + wheel.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; // DOM_DELTA_LINE is 1
      zoomTo(latest.current.zoom * Math.exp(-dy * 0.0025), e.clientX);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Keep the playhead on screen while it plays.
  useEffect(() => {
    const el = scroller.current;
    if (!el || drag.current || el.clientWidth <= 0) return;
    const x = timeToPx(time, zoom);
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 8) el.scrollLeft = Math.max(0, x - el.clientWidth / 4);
  }, [time, zoom]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // ---- pointer handling: one set of handlers on the lanes, deciding by what was pressed ----
  const rect = () => root.current!.getBoundingClientRect();
  const timeAt = (clientX: number): number => Math.min(Math.max(pxToTime(clientX - rect().left, latest.current.zoom), 0), Math.max(projectEnd(latest.current.project), 0));

  const seekSoon = (clientX: number) => {
    pending.current = clientX;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (pending.current !== null) latest.current.onSeek(timeAt(pending.current));
      pending.current = null;
    });
  };

  /** While a finger holds a drag near the left or right edge of the visible timeline, the timeline scrolls that way (a finger cannot also scroll it). */
  const edgeScroll = (clientX: number) => {
    const el = scroller.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const zone = 40;
    if (clientX > r.right - zone) el.scrollLeft += Math.min(16, (clientX - (r.right - zone)) / 2 + 2);
    else if (clientX < r.left + zone) el.scrollLeft -= Math.min(16, (r.left + zone - clientX) / 2 + 2);
  };

  const capture = (el: Element, id: number) => {
    // Without capture the drag would stop when the pointer leaves the bar. It throws NotFoundError for a pointer that is no longer active.
    try {
      (el as HTMLElement).setPointerCapture?.(id);
    } catch {
      /* the drag still works while the pointer stays over the timeline */
    }
  };

  const finish = (cancel: boolean) => {
    const d = drag.current;
    drag.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    pending.current = null;
    setGuide(null);
    setMarker(null);
    setActive(null);
    if (!d || d.mode === 'scrub' || d.mode === 'tap' || !d.moved) return;
    // A cancelled drag puts the edit back as it was, as one finished change.
    const out = cancel ? { clips: d.origin.clips, layers: d.origin.layers } : d.last;
    if (out) latest.current.onChange(out, 'end');
  };

  return (
    <div className="tl" aria-label="Timeline" role="region">
      <div className="tl-bar" role="toolbar" aria-label="Timeline view">
        <button type="button" className={`tl-btn${snapping ? ' is-on' : ''}`} aria-pressed={snapping} title="Snap to the playhead and to the edges of other items" onClick={() => props.onSnapping(!snapping)}>
          Snapping
        </button>
        <span className="tl-spacer" />
        <button type="button" className="tl-btn" aria-label="Zoom out" title="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => zoomTo(zoom / 1.25)}>
          −
        </button>
        <input
          type="range"
          className="tl-zoom"
          aria-label="Zoom"
          min={Math.log(MIN_ZOOM)}
          max={Math.log(MAX_ZOOM)}
          step={0.01}
          value={Math.log(clampZoom(zoom))}
          aria-valuetext={`${Math.round(zoom)} pixels per second`}
          onChange={(e) => zoomTo(Math.exp(Number(e.target.value)))}
        />
        <button type="button" className="tl-btn" aria-label="Zoom in" title="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => zoomTo(zoom * 1.25)}>
          +
        </button>
        <button
          type="button"
          className="tl-btn"
          title="Zoom so the whole edit fits"
          onClick={() => {
            anchor.current = { time: 0, offset: 0 };
            props.onZoom(zoomToFit(Math.max(end, 1), scroller.current?.clientWidth || 600));
          }}
        >
          Fit
        </button>
      </div>

      <div className="tl-scroll" ref={scroller} onScroll={measure}>
        <div
          className="timeline-lanes"
          ref={root}
          style={{ width: contentW, height }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const target = e.target as HTMLElement;
            if (target.closest('[data-joint]')) return; // a joint is a button of its own: no seek, no deselect
            const keyEl = target.closest<HTMLElement>('[data-key-layer]');
            if (keyEl) {
              // A keyframe diamond on the picked bar: drag it sideways to move its keys in time.
              props.onScrubStart();
              drag.current = { mode: 'key', layerId: keyEl.dataset.keyLayer!, t0: Number(keyEl.dataset.keyT), x0: e.clientX - rect().left, origin: latest.current.project, moved: false, last: null };
              capture(keyEl, e.pointerId);
              return;
            }
            const item = target.closest<HTMLElement>('[data-item]');
            if (item) {
              const sep = item.dataset.item!.indexOf(':');
              const t: Target = { kind: item.dataset.item!.slice(0, sep) as Target['kind'], id: item.dataset.item!.slice(sep + 1) };
              const edge = target.closest<HTMLElement>('[data-edge]')?.dataset.edge as Edge | undefined;
              const sel = latest.current.selection;
              if (!(sel && sel.kind === t.kind && sel.id === t.id)) props.onSelect({ kind: t.kind, id: t.id });
              props.onScrubStart();
              drag.current = { mode: edge ?? 'move', target: t, x0: e.clientX - rect().left, y0: e.clientY - rect().top, origin: latest.current.project, moved: false, last: null };
              capture(item, e.pointerId);
              return;
            }
            const y = e.clientY - rect().top;
            if (y > RULER_H && latest.current.selection) props.onSelect(null);
            if (e.pointerType === 'touch' && y > RULER_H) {
              // Empty lane under a finger: the lanes allow pan-x pan-y here, so a drag scrolls the timeline or the page. Only a tap seeks (on pointerup).
              drag.current = { mode: 'tap' };
              return;
            }
            drag.current = { mode: 'scrub' };
            props.onScrubStart();
            capture(e.currentTarget, e.pointerId);
            props.onSeek(timeAt(e.clientX));
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            if (d.mode === 'tap') return;
            edgeScroll(e.clientX);
            if (d.mode === 'scrub') return seekSoon(e.clientX);
            const r = rect();
            const px = e.clientX - r.left;
            const py = e.clientY - r.top;
            if (d.mode === 'key') {
              if (!d.moved && Math.abs(px - d.x0) < DRAG_PX) return;
              d.moved = true;
              const change = keyDragChange(d.origin, d.layerId, d.t0, pxToTime(px - d.x0, latest.current.zoom));
              d.last = change;
              latest.current.onChange(change, 'preview');
              return;
            }
            if (!d.moved && Math.hypot(px - d.x0, py - d.y0) < DRAG_PX) return;
            d.moved = true;
            // Everything is in the lanes' own coordinates (x from the left of the scrolled content, y from the top of the ruler).
            const { change, guide: g, marker: m } = dragChange(d, { x: px, y: py - RULER_H }, { zoom: latest.current.zoom, snapping: latest.current.snapping, time: latest.current.time });
            d.last = change;
            setGuide(g);
            setMarker(m);
            setActive(`${d.target.kind}:${d.target.id}`);
            latest.current.onChange(change, 'preview');
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            if (d?.mode === 'tap') {
              finish(false);
              props.onSeek(timeAt(e.clientX));
              return;
            }
            if (d?.mode === 'scrub') {
              cancelAnimationFrame(frame.current);
              frame.current = 0;
              pending.current = null;
              props.onSeek(timeAt(e.clientX)); // the moment where the pointer was let go
            }
            finish(false);
          }}
          onPointerCancel={() => finish(true)}
        >
          <div className="tl-ruler" role="slider" tabIndex={0} aria-label="Playhead position" aria-valuemin={0} aria-valuemax={Math.round(end * 10) / 10} aria-valuenow={Math.round(time * 10) / 10} aria-valuetext={clock(time)} style={{ height: RULER_H }}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 1 : NUDGE;
              const to = e.key === 'ArrowLeft' ? time - step : e.key === 'ArrowRight' ? time + step : e.key === 'Home' ? 0 : e.key === 'End' ? end : null;
              if (to === null) return;
              e.preventDefault();
              props.onSeek(Math.min(Math.max(round3(to), 0), end));
            }}
          >
            {rulerTicks(zoom, (view.width || 800) + 200, Math.max(0, pxToTime(view.left, zoom) - 100 / zoom)).map((t) => (
              <span key={t.t} className={`tl-tick${t.major ? ' is-major' : ''}`} style={{ left: timeToPx(t.t, zoom) }} aria-hidden="true">
                {t.label}
              </span>
            ))}
          </div>

          {Array.from({ length: rows }, (_, r) => {
            const lane = topLane - r;
            return (
              <div key={lane} className="tl-lane" role="group" aria-label={`Lane ${lane + 1}`} style={{ top: RULER_H + r * ROW_H, height: ROW_H }}>
                <LaneLabel text={laneName(lane)} />
                {project.layers
                  .filter((l) => trackOf(l) === lane)
                  .map((l) => {
                    const span = layerSpan(l, end);
                    const kind = layerKind(project, l);
                    const on = selection?.kind === 'layer' && selection.id === l.id;
                    const name = layerName(project, l);
                    const src = isText(l) ? undefined : sourceOf(project, l.srcId);
                    const w = timeToPx(span.end - span.start, zoom);
                    const peaks = !isText(l) && kind !== 'picture' ? peaksOf1(project, peaksOfSrc, l, span.end - span.start) : undefined;
                    const marks = keyMarks(l.tracks, span.end - span.start);
                    const thumb = !isText(l) && kind !== 'sound' ? stripPicture(stripOf.get(l.srcId), l.in) : undefined;
                    return (
                      <Item
                        key={l.id}
                        id={`layer:${l.id}`}
                        kind={kind}
                        selected={on}
                        dragging={active === `layer:${l.id}`}
                        left={timeToPx(span.start, zoom)}
                        width={w}
                        height={ROW_H - 4}
                        top={2}
                        label={name}
                        title={`${name}, ${clock(span.end - span.start)}`}
                        missing={!isText(l) && !src}
                        extras={
                          marks.length > 0 &&
                          marks.map((t, k) => (
                            <KeyMark
                              key={k}
                              layerId={l.id}
                              t={t}
                              px={Math.min(Math.max(timeToPx(t, zoom), KEY_PX / 2), Math.max(w, KEY_PX) - KEY_PX / 2)}
                              interactive={on}
                              onNudge={(d) => props.onChange({ layers: project.layers.map((x) => (x.id === l.id && x.tracks ? { ...x, tracks: moveKeysAt(x.tracks, t, round3(t + d), span.end - span.start) } : x)) }, 'commit')}
                            />
                          ))
                        }
                        onKeyDown={(e) => nudge(e, l, project, end, props)}
                        onActivate={() => {
                          props.onSelect({ kind: 'layer', id: l.id });
                          props.onSeek(span.start);
                        }}
                      >
                        {peaks && peaks.length > 0 && <Wave peaks={peaks} width={Math.round(w)} height={ROW_H - 6} kind={kind} />}
                        {thumb && <img className="tl-thumb" src={thumb} alt="" draggable={false} />}
                        <span className="tl-label">{isText(l) ? l.text.replace(/\s+/g, ' ').slice(0, 40) : (src?.name ?? 'missing file')}</span>
                      </Item>
                    );
                  })}
              </div>
            );
          })}

          <div className="tl-lane tl-main" role="group" aria-label="Main track" style={{ top: RULER_H + rows * ROW_H, height: MAIN_H }}>
            {project.clips.length > 0 && <LaneLabel text="Video" />}
            {project.clips.map((c, i) => {
              const on = selection?.kind === 'clip' && selection.id === c.id;
              const w = timeToPx(length(c), zoom);
              const tiles = tilesFor(c.id, stripOf.get(c.srcId ?? ''), c.start, c.end, Math.min(80, Math.max(1, Math.round(w / TILE_PX))));
              const clipPeaks = c.srcId ? slicePeaks(peaksOfSrc.get(c.srcId) ?? EMPTY, c.start, c.end, sourceOf(project, c.srcId)?.duration ?? 0) : EMPTY;
              return (
                <Item
                  key={c.id}
                  id={`clip:${c.id}`}
                  kind="clip"
                  selected={on}
                  dragging={active === `clip:${c.id}`}
                  left={timeToPx(startOf(project.clips, i), zoom)}
                  width={w}
                  height={MAIN_H - 4}
                  top={2}
                  label={`Clip ${i + 1}, ${clock(length(c))}`}
                  title={`Clip ${i + 1}, ${clock(length(c))}${speedOf(c) !== 1 ? `, ${speedOf(c)}×` : ''}`}
                  onKeyDown={(e) => nudgeClip(e, project, i, props)}
                  onActivate={() => {
                    props.onSelect({ kind: 'clip', id: c.id });
                    props.onSeek(startOf(project.clips, i));
                  }}
                >
                  <ClipFrames tiles={tiles} />
                  {clipPeaks.length > 0 && <Wave peaks={clipPeaks} width={Math.round(w)} height={Math.round((MAIN_H - 6) * 0.45)} kind="clip" />}
                  <span className="tl-label">{i + 1}</span>
                </Item>
              );
            })}
          </div>

          {project.clips.slice(1).map((c, k) => {
            const i = k + 1;
            const d = effectiveDuration(project.clips, i);
            const set = !!c.transitionIn;
            const what = set ? `${labelOf(c.transitionIn!.kind)}, ${d.toFixed(1)} s` : 'none';
            return (
              <div key={c.id} className="tl-joint-slot" data-joint={c.id} style={{ left: timeToPx(startOf(project.clips, i), zoom), top: RULER_H + rows * ROW_H + MAIN_H / 2 }}>
                <button
                  type="button"
                  className={`tl-joint${set ? ' is-set' : ''}`}
                  aria-label={`Transition between clip ${i} and clip ${i + 1}: ${what}`}
                  title={`Transition: ${what}`}
                  onClick={() => props.onTransition?.(c.id)}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
                    <path d="M3 6l7 6-7 6zM21 6l-7 6 7 6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            );
          })}
          {marker !== null && <div className="tl-marker" style={{ left: timeToPx(marker, zoom), top: RULER_H + rows * ROW_H }} aria-hidden="true" />}
          {guide !== null && <div className="tl-guide" style={{ left: timeToPx(guide, zoom) }} aria-hidden="true" />}
          <div className="tl-playhead" style={{ left: timeToPx(Math.max(0, time), zoom) }} aria-hidden="true" />
        </div>
      </div>
      <span className="tl-sr" aria-live="off">{mainTotal > 0 ? `Edit length ${clock(end)}` : ''}</span>
    </div>
  );
}

/** One bar on the timeline: a button for focus and the keyboard, with edge handles shown on hover, focus and when picked. */
function Item(props: {
  id: string;
  kind: string;
  selected: boolean;
  dragging: boolean;
  left: number;
  width: number;
  height: number;
  top: number;
  label: string;
  title: string;
  missing?: boolean;
  extras?: React.ReactNode;
  onKeyDown(e: React.KeyboardEvent): void;
  onActivate(): void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`tl-item tl-${props.kind}${props.selected ? ' is-selected' : ''}${props.dragging ? ' is-dragging' : ''}${props.missing ? ' is-missing' : ''}`}
      data-item={props.id}
      style={{ left: props.left, width: Math.max(props.width, 4), top: props.top, height: props.height }}
    >
      <button
        type="button"
        className="tl-hit"
        aria-pressed={props.selected}
        aria-label={props.label}
        title={props.title}
        onKeyDown={props.onKeyDown}
        onClick={(e) => {
          // A mouse press is handled on pointer down; this is for the keyboard (Enter or Space), which has no position.
          if (e.detail !== 0) return;
          props.onActivate();
        }}
      >
        {props.children}
      </button>
      {props.extras}
      {/* Always present so any bar can be trimmed; they are only drawn on hover, on keyboard focus and when picked (see timeline.css). */}
      <span className="tl-handle is-start" data-edge="start" aria-hidden="true" title="Drag to trim the start" />
      <span className="tl-handle is-end" data-edge="end" aria-hidden="true" title="Drag to trim the end" />
    </div>
  );
}

/** Arrow keys on a focused layer: move by 0.1 s; with Alt trim the end (Alt+Shift: the start). */
function nudge(e: React.KeyboardEvent, l: Layer, p: VideoProject, end: number, props: TimelineProps) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const d = e.key === 'ArrowLeft' ? -NUDGE : NUDGE;
  const span = layerSpan(l, end);
  const base = { ...l, start: span.start, end: span.end } as Layer;
  let next: Layer;
  if (!e.altKey) next = moveLayer(base, round3(span.start + d), undefined, end);
  else if (e.shiftKey) next = trimLayerStart(p, base, round3(span.start + d));
  else next = trimLayerEnd(p, base, round3(span.end + d));
  props.onChange({ layers: p.layers.map((x) => (x.id === l.id ? next : x)) }, 'commit');
}

/** Arrow keys on a focused main clip: move it one place earlier or later; with Alt trim its end (Alt+Shift: its start) by 0.1 s. */
function nudgeClip(e: React.KeyboardEvent, p: VideoProject, i: number, props: TimelineProps) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const c = p.clips[i]!;
  const d = e.key === 'ArrowLeft' ? -1 : 1;
  if (!e.altKey) return props.onChange({ clips: moveClipTo(p.clips, c.id, i + d) }, 'commit');
  const duration = sourceOf(p, c.srcId)?.duration ?? Infinity;
  props.onChange({ clips: rippleTrim(p.clips, i, e.shiftKey ? 'start' : 'end', d * NUDGE, duration) }, 'commit');
}

const EMPTY = new Float32Array(0);
const KIND_LABEL = { text: 'Text', picture: 'Picture', video: 'Video', sound: 'Sound' } as const;

/** Names what a lane mostly holds. Sticks to the left edge of the scroller so it stays in view; takes no pointer. */
function LaneLabel({ text }: { text: string | undefined }) {
  if (!text) return null;
  return (
    <span className="tl-lane-label" aria-hidden="true">
      {text}
    </span>
  );
}

/** The pictures along a main clip; a new array is only passed when they change, so playback redraws skip it. */
const ClipFrames = memo(function ClipFrames({ tiles }: { tiles: string[] }) {
  if (tiles.length === 0) return null;
  return (
    <span className="clip-frames tl-tiles" aria-hidden="true">
      {tiles.map((url, k) => (
        <img key={k} src={url} alt="" draggable={false} />
      ))}
    </span>
  );
});

/** The change made by dragging the keys at `t0` of a layer by `dt` seconds. */
export function keyDragChange(origin: VideoProject, layerId: string, t0: number, dt: number): ProjectChange {
  return {
    layers: origin.layers.map((x) => {
      if (x.id !== layerId || !x.tracks) return x;
      const len = (x.end ?? projectEnd(origin)) - (x.start ?? 0);
      return { ...x, tracks: moveKeysAt(x.tracks, t0, round3(t0 + dt), len) };
    }),
  };
}

/** A keyframe diamond. On the picked bar it is a focusable button (arrows move it 0.1 s) and can be dragged; elsewhere it is only a mark. */
function KeyMark(props: { layerId: string; t: number; px: number; interactive: boolean; onNudge(d: number): void }) {
  const name = `Keyframe at ${clockTenths(props.t)}`;
  const style = { left: props.px - KEY_PX / 2 };
  if (!props.interactive) return <span className="tl-key is-idle" style={style} aria-hidden="true" />;
  return (
    <button
      type="button"
      className="tl-key"
      data-key-layer={props.layerId}
      data-key-t={props.t}
      aria-label={name}
      title={`${name}. Drag, or use the arrow keys, to move it.`}
      style={style}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        props.onNudge(e.key === 'ArrowLeft' ? -NUDGE : NUDGE);
      }}
    />
  );
}

/** The peaks of a source for one bar: the part it plays, [in, in + span x speed] of the source. Empty when not (yet) known. */
function peaksOf1(p: VideoProject, peaks: Map<string, Float32Array>, l: Layer, span: number): Float32Array {
  if (isText(l)) return EMPTY;
  const all = peaks.get(l.srcId);
  if (!all || all.length === 0) return EMPTY;
  return slicePeaks(all, l.in, l.in + span * (l.speed ?? 1), sourceOf(p, l.srcId)?.duration ?? 0);
}

/**
 * Waveform peaks per source, found once and kept, off the render path: the
 * result map grows as decodes finish. Aborted on unmount. An empty array means
 * no waveform (too large, or nothing decodable).
 */
function usePeaks(project: VideoProject, fileOf: ((srcId: string) => File | null) | undefined): Map<string, Float32Array> {
  const cache = useRef(new Map<string, Float32Array>());
  const pending = useRef(new Set<string>());
  const ctl = useRef<AbortController | null>(null);
  const [, bump] = useState(0);
  const wanted = useMemo(() => {
    const ids = new Set<string>();
    const add = (id: string | undefined) => {
      const kind = id ? sourceOf(project, id)?.kind : undefined;
      if (id && (kind === 'video' || kind === 'audio')) ids.add(id);
    };
    project.clips.forEach((c) => add(c.srcId));
    project.layers.forEach((l) => !isText(l) && add(l.srcId));
    return Array.from(ids).sort().join('|');
  }, [project]);

  useEffect(() => {
    const c = new AbortController();
    ctl.current = c;
    return () => {
      c.abort();
      pending.current.clear();
    };
  }, []);

  useEffect(() => {
    const signal = ctl.current?.signal;
    if (!fileOf || !signal || !wanted) return;
    for (const id of wanted.split('|')) {
      if (cache.current.has(id) || pending.current.has(id)) continue;
      const file = fileOf(id);
      if (!file) continue; // not there yet: asked again when the project or fileOf changes
      pending.current.add(id);
      peaksOf(file, PEAK_BUCKETS, signal).then(
        (peaks) => {
          if (signal.aborted) return;
          pending.current.delete(id);
          cache.current.set(id, peaks);
          bump((n) => n + 1);
        },
        () => {
          if (signal.aborted) return;
          pending.current.delete(id);
          cache.current.set(id, EMPTY);
        },
      );
    }
  }, [wanted, fileOf]);

  return cache.current;
}

/** Draws a waveform into a canvas on the bar. Sized in device pixels (capped), shown at CSS size. */
const Wave = memo(function Wave({ peaks, width, height, kind }: { peaks: Float32Array; width: number; height: number; kind: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
    c.width = Math.max(1, Math.min(Math.round(width * dpr), MAX_WAVE_PX));
    c.height = Math.max(1, Math.round(height * dpr));
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = c.getContext('2d');
    } catch {
      /* no canvas: the bar just has no waveform */
    }
    if (!ctx) return;
    ctx.fillStyle = kind === 'sound' ? '#3f7a31' : 'rgba(255,255,255,0.85)';
    drawPeaks(ctx, peaks, c.width, c.height);
  }, [peaks, width, height, kind]);
  return <canvas ref={ref} className={`tl-wave is-${kind}`} aria-hidden="true" style={{ height }} />;
});
