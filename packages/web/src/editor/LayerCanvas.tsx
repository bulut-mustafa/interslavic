import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { hitLayers } from '../video/boxes.ts';
import { drawFrame } from '../video/compositor.ts';
import { perfBump } from '../video/perf.ts';
import type { MediaFeed } from '../video/contracts.ts';
import type { VideoProject } from '../video/project.ts';
import { boundsOf, clampPosition, hitTest, type TextLayer } from './layers.ts';
import { drawText } from './text-style.ts';

/**
 * Two modes.
 *  - Photo mode (the default): `drawBase` + `layers` (text), drawn by `renderScene`. Unchanged.
 *  - Project mode, when `project` AND `media` are passed (the video editor): each redraw calls the
 *    compositor's `drawFrame` with `project`, `time` (edit seconds, default 0), `media` and the selected
 *    ids, so media layers, text, lanes, rotation and blend are drawn. `drawBase` and `layers` are then
 *    not used for drawing (`layers` still serves the arrow-key nudge, so pass the text layers shown).
 *    A click picks the front-most layer shown at `time` (`hitLayers`, rotated-rectangle test) and calls
 *    `onSelect(id)` with ANY layer's id, text or media (null on empty space); the caller looks up the
 *    kind. Only text can be dragged here (`onDrag`/`onDragEnd`); media layers are moved by the
 *    TransformBox overlay. The canvas redraws when `project`, `time`, `media` or the selection change;
 *    call the handle's `redraw()` when the pictures change without those changing (each playback frame).
 *    `selectedIds` outlines several layers; otherwise `selectedId`.
 */

/**
 * A canvas that shows a picture or a video frame with text layers on top, and
 * lets the text be picked up and moved. `renderScene` is the one place the
 * picture is composed, so what is shown and what is exported cannot differ.
 */

export function renderScene(
  ctx: CanvasRenderingContext2D,
  size: { w: number; h: number },
  drawBase: (ctx: CanvasRenderingContext2D) => void,
  layers: TextLayer[],
  selected: string | readonly string[] | null = null,
): void {
  ctx.clearRect(0, 0, size.w, size.h);
  drawBase(ctx);
  for (const l of layers) {
    if (!l.erase) continue;
    ctx.fillStyle = l.erase.color;
    ctx.fillRect(l.erase.x, l.erase.y, l.erase.w, l.erase.h);
  }
  for (const l of layers) drawText(ctx, l.text, l.style, l.x, l.y, l.maxWidth);
  const ids = selected === null ? [] : typeof selected === 'string' ? [selected] : selected;
  for (const sel of layers.filter((l) => ids.includes(l.id))) {
    const b = boundsOf(ctx, sel);
    ctx.save();
    ctx.strokeStyle = '#1f6b6b';
    ctx.lineWidth = Math.max(2, size.w / 400);
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    ctx.restore();
  }
}

export interface SceneHandle {
  redraw(): void;
  canvas(): HTMLCanvasElement | null;
}

interface Props {
  width: number;
  height: number;
  drawBase?: (ctx: CanvasRenderingContext2D) => void;
  layers: TextLayer[];
  /** Project mode (see the top of the file). */
  project?: VideoProject;
  media?: MediaFeed;
  time?: number;
  selectedId: string | null;
  /** Every selected layer, when more than one is (selectedId is the one that moves with the arrow keys). */
  selectedIds?: string[];
  onSelect: (id: string | null) => void;
  /** While a layer is dragged or nudged: its new top-left corner. */
  onDrag: (id: string, x: number, y: number) => void;
  /** When the drag ends, so the editor can make one undo step of it. */
  onDragEnd: () => void;
  /** Double-click on text, or Enter with text selected: the caller can start typing on the picture. */
  onActivate?: (id: string) => void;
  label?: string;
  /** Project mode: the canvas holds `width * renderScale` pixels but is drawn in frame units (a phone shows a small picture, so it need not fill 1280 px every frame). Default 1. */
  renderScale?: number;
  /** Project mode: where the time is read from at each redraw, instead of `time` (playback moves faster than React renders). */
  timeSource?: () => number;
}

export const LayerCanvas = forwardRef<SceneHandle, Props>(function LayerCanvas(props, ref) {
  const el = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const latest = useRef(props);
  latest.current = props;

  const redraw = useCallback(() => {
    const ctx = el.current?.getContext('2d');
    if (!ctx) return;
    const p = latest.current;
    const selected = p.selectedIds ?? p.selectedId;
    const k = p.renderScale ?? 1;
    if (k !== 1) ctx.setTransform(k, 0, 0, k, 0, 0);
    if (p.project && p.media) {
      perfBump('draw');
      drawFrame(ctx, { project: p.project, time: p.timeSource ? p.timeSource() : (p.time ?? 0), size: { w: p.width, h: p.height }, media: p.media, selected: selected === null ? [] : typeof selected === 'string' ? [selected] : selected });
      return;
    }
    renderScene(ctx, { w: p.width, h: p.height }, p.drawBase ?? (() => {}), p.layers, selected);
  }, []);

  useImperativeHandle(ref, () => ({ redraw, canvas: () => el.current }), [redraw]);
  useEffect(redraw, [redraw, props.width, props.height, props.drawBase, props.layers, props.selectedId, props.selectedIds, props.project, props.media, props.time, props.renderScale]);

  /** Pixel position on the picture of a pointer event, whatever size the canvas is shown at. */
  const at = (e: { clientX: number; clientY: number }) => {
    const c = el.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * props.width) / (r.width || props.width), y: ((e.clientY - r.top) * props.height) / (r.height || props.height) };
  };

  const measure = () => el.current?.getContext('2d') ?? null;

  /** The layer under a point: any kind in project mode, text only in photo mode. */
  const pick = (ctx: CanvasRenderingContext2D, x: number, y: number): string | null =>
    props.project && props.media ? hitLayers(props.project.layers, x, y, ctx, props.time ?? 0) : hitTest(ctx, props.layers, x, y);

  return (
    <canvas
      ref={el}
      className="layer-canvas"
      width={Math.round(props.width * (props.renderScale ?? 1))}
      height={Math.round(props.height * (props.renderScale ?? 1))}
      data-frame-w={props.width}
      tabIndex={0}
      role="img"
      aria-label={props.label ?? 'Editor canvas. Drag text to move it; arrow keys nudge the selected text.'}
      onPointerDown={(e) => {
        const ctx = measure();
        if (!ctx) return;
        const p = at(e);
        const id = pick(ctx, p.x, p.y);
        props.onSelect(id);
        const l = id ? props.layers.find((x) => x.id === id) : undefined;
        if (id && l) {
          drag.current = { id, dx: p.x - l.x, dy: p.y - l.y, moved: false };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const p = at(e);
        const c = clampPosition(p.x - d.dx, p.y - d.dy, { w: props.width, h: props.height });
        d.moved = true;
        props.onDrag(d.id, c.x, c.y);
      }}
      onPointerUp={() => {
        if (drag.current?.moved) props.onDragEnd();
        drag.current = null;
      }}
      // A cancelled touch (the browser took the gesture, or the pointer was lost) ends the drag like a release, so no stale record is left for the next drag.
      onPointerCancel={() => {
        if (drag.current?.moved) props.onDragEnd();
        drag.current = null;
      }}
      onDoubleClick={(e) => {
        const ctx = measure();
        if (!ctx || !props.onActivate) return;
        const p = at(e);
        const id = pick(ctx, p.x, p.y);
        if (id && props.layers.some((x) => x.id === id)) props.onActivate(id);
      }}
      onKeyDown={(e) => {
        const sel = props.layers.find((l) => l.id === props.selectedId);
        if (!sel) return;
        if (e.key === 'Enter' && props.onActivate) {
          e.preventDefault();
          props.onActivate(sel.id);
          return;
        }
        const step = e.shiftKey ? 10 : 1;
        const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        const m = move[e.key];
        if (!m) return;
        e.preventDefault();
        const c = clampPosition(sel.x + m[0], sel.y + m[1], { w: props.width, h: props.height });
        props.onDrag(sel.id, c.x, c.y);
        props.onDragEnd();
      }}
    />
  );
});
