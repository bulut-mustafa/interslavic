import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { SceneHandle } from '../editor/LayerCanvas.tsx';
import type { LayerBox } from '../video/contracts.ts';
import type { FxAdjust } from '../video/effects.ts';
import { isText, type PageDoc, type PhotoLayer } from './doc.ts';
import type { Rect } from './geometry.ts';
import { snapMove, type Guide } from './guides.ts';
import { boundsOfSelection, boxOfLayer, hitPage, layersInRect } from './hit.ts';
import { isHidden } from './layer-ops.ts';
import { clampDelta, movable } from './page-ops.ts';
import { nudge } from './layer-ops.ts';
import { renderToCanvas, type PictureSource } from './render.ts';
import { probeRender } from './render-probe.ts';

/** What the canvas needs to know of a pointer going down; a live-text line that sits over a layer hands its event on in this shape. */
export interface PointerStart {
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  altKey?: boolean;
}

export interface PhotoCanvasHandle extends SceneHandle {
  /** Starts what a pointer going down on the page does (pick, move, marquee). Returns false when the page is not taking the pointer. */
  begin(e: PointerStart): boolean;
}

/** How far (screen pixels) the pointer must travel before a press is a drag and not a click. */
const DRAG_PX = 3;
/** How near (screen pixels) a layer must come to a guide to snap to it. */
const SNAP_PX = 6;

interface Props {
  /** The document as it is SHOWN (compare and the crop tool change what is drawn, not the document). */
  doc: PageDoc;
  /** The picture at working size; null while it is not ready. */
  base: PictureSource | null;
  /** The pictures of image layers, by file id. */
  images: { pictureOf(srcId: string): CanvasImageSource | null };
  /** Changes whenever a layer picture arrives or goes (the renderer is asked again). */
  imagesVersion: number;
  /** The page's size in pixels: the canvas is made this size. */
  size: { w: number; h: number };
  /** Layers to outline. */
  selectedIds: readonly string[];
  /** Whether the pointer picks and moves layers (off while the crop tool is up). */
  interactive: boolean;
  /** 'Select layers' mode: a drag on empty space is a marquee. Otherwise a marquee needs Shift. */
  boxMode: boolean;
  presets: (id: string, amount: number) => FxAdjust | null;
  guides: readonly Guide[];
  onPick: (id: string | null, additive: boolean) => void;
  onPickMany: (ids: string[], additive: boolean) => void;
  /** Layers while they are dragged: one undo step is made when the drag ends. */
  onDragLayers: (layers: PhotoLayer[]) => void;
  onDragEnd: () => void;
  onDragCancel: () => void;
  onGuides: (g: Guide[]) => void;
  /** Double-click on a text layer, or Enter with one selected. */
  onActivate: (id: string) => void;
  label: string;
}

type Drag =
  | { kind: 'move'; ids: string[]; start: { x: number; y: number }; screen: { x: number; y: number }; base: PhotoLayer[]; rect: Rect; others: LayerBox[]; moved: boolean }
  | { kind: 'marquee'; start: { x: number; y: number }; screen: { x: number; y: number }; additive: boolean; initial: string[]; moved: boolean };

/**
 * The page on screen: `renderPage` draws it (the same code as the thumbnail and the export), and the pointer picks the front-most
 * layer under it (`hitPage`), moves the selection with snapping to the page edges, centre and other layers (hold Alt to switch
 * snapping off), or drags a marquee (Shift, or 'Select layers' mode). Moves and marquees follow the pointer on the window, so a
 * drag that leaves the canvas still ends where the pointer is let go. Escape puts a drag back as it was.
 */
export const PhotoCanvas = forwardRef<PhotoCanvasHandle, Props>(function PhotoCanvas(props, ref) {
  const el = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const drag = useRef<Drag | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const marqueeRef = useRef<Rect | null>(null);

  const draw = useCallback(() => {
    const c = el.current;
    if (!c) return;
    const p = latest.current;
    const req = { doc: p.doc, base: p.base, images: p.images, size: p.size, selected: p.selectedIds, presets: p.presets };
    probeRender(req);
    renderToCanvas(c, req);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    // Guides and the marquee are drawn on the screen canvas only: the export never calls this.
    if (p.guides.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#e0245e';
      ctx.lineWidth = Math.max(1.5, p.size.w / 700);
      ctx.setLineDash([6, 4]);
      for (const g of p.guides) {
        ctx.beginPath();
        if (g.axis === 'x') {
          ctx.moveTo(g.pos, g.from);
          ctx.lineTo(g.pos, g.to);
        } else {
          ctx.moveTo(g.from, g.pos);
          ctx.lineTo(g.to, g.pos);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    const m = marqueeRef.current;
    if (m) {
      ctx.save();
      ctx.fillStyle = 'rgba(31, 107, 107, 0.14)';
      ctx.fillRect(m.x, m.y, m.w, m.h);
      ctx.strokeStyle = '#1f6b6b';
      ctx.lineWidth = Math.max(1.5, p.size.w / 700);
      ctx.strokeRect(m.x, m.y, m.w, m.h);
      ctx.restore();
    }
  }, []);

  useImperativeHandle(ref, () => ({ redraw: draw, canvas: () => el.current, begin }), [draw]); // eslint-disable-line react-hooks/exhaustive-deps
  const ids = props.selectedIds.join(',');
  useEffect(draw, [draw, props.doc, props.base, props.images, props.imagesVersion, props.size.w, props.size.h, ids, props.guides, marquee, props.presets]);
  useEffect(() => () => stop.current?.(), []);

  /** Pixel position on the page of a pointer event, whatever size the canvas is shown at. */
  const at = (e: { clientX: number; clientY: number }) => {
    const c = el.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / (r.width || c.width), y: ((e.clientY - r.top) * c.height) / (r.height || c.height) };
  };
  /** Screen pixels per page pixel. */
  const zoom = () => {
    const c = el.current!;
    const w = c.getBoundingClientRect().width;
    return w && c.width ? w / c.width : 1;
  };

  const finish = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    stop.current?.();
    stop.current = null;
    if (!d) return;
    const p = latest.current;
    if (d.kind === 'move') {
      p.onGuides([]);
      if (d.moved) (commit ? p.onDragEnd : p.onDragCancel)();
      return;
    }
    const m = marqueeRef.current;
    marqueeRef.current = null;
    setMarquee(null);
    if (!commit) return;
    if (!d.moved || !m) {
      if (!d.additive) p.onPick(null, false);
      return;
    }
    const ctx = el.current!.getContext('2d');
    const hit = layersInRect(p.doc.layers, m, ctx ?? undefined);
    p.onPickMany(d.additive ? [...new Set([...d.initial, ...hit])] : hit, d.additive);
  };

  const onMove = (e: MouseEvent) => {
    const d = drag.current;
    const c = el.current;
    if (!d || !c) return;
    const p = latest.current;
    const now = at(e);
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.screen.x, e.clientY - d.screen.y) < DRAG_PX) return;
      d.moved = true;
    }
    if (d.kind === 'move') {
      const page = p.size;
      let { dx, dy } = clampDelta(d.rect, now.x - d.start.x, now.y - d.start.y, page);
      let guides: Guide[] = [];
      if (!e.altKey) {
        const box: LayerBox = { id: 'selection', cx: d.rect.x + d.rect.w / 2 + dx, cy: d.rect.y + d.rect.h / 2 + dy, w: d.rect.w, h: d.rect.h, rotation: 0 };
        const s = snapMove(box, d.others, page, SNAP_PX, zoom());
        dx += s.dx;
        dy += s.dy;
        guides = s.guides;
      }
      p.onGuides(guides);
      p.onDragLayers(nudge(d.base, d.ids, dx, dy));
      return;
    }
    const x0 = Math.min(d.start.x, now.x);
    const y0 = Math.min(d.start.y, now.y);
    const m = { x: x0, y: y0, w: Math.abs(now.x - d.start.x), h: Math.abs(now.y - d.start.y) };
    marqueeRef.current = m;
    setMarquee(m);
  };

  const attach = () => {
    const move = (e: Event) => onMove(e as MouseEvent);
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    stop.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
    };
  };

  function begin(e: PointerStart): boolean {
    const c = el.current;
    const p = latest.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !p.interactive) return false;
    stop.current?.();
    const at0 = at(e);
    const layers = p.doc.layers;
    const id = hitPage(layers, at0.x, at0.y, ctx);
    const screen = { x: e.clientX, y: e.clientY };
    if (id) {
      let chosen: string[];
      if (e.shiftKey) {
        p.onPick(id, true);
        chosen = p.selectedIds.includes(id) ? [] : [...p.selectedIds, id]; // shift-click on a picked layer drops it
      } else {
        if (!p.selectedIds.includes(id)) p.onPick(id, false);
        chosen = p.selectedIds.includes(id) ? [...p.selectedIds] : [id];
      }
      const ids = movable(layers, chosen);
      if (ids.length > 0) {
        const rect = boundsOfSelection(layers, ids, ctx)!;
        const others = layers.filter((l) => !ids.includes(l.id) && !isHidden(l)).map((l) => boxOfLayer(l, ctx));
        drag.current = { kind: 'move', ids, start: at0, screen, base: layers, rect, others, moved: false };
        attach();
      }
      return true;
    }
    if (e.shiftKey || p.boxMode) {
      drag.current = { kind: 'marquee', start: at0, screen, additive: e.shiftKey, initial: [...p.selectedIds], moved: false };
      attach();
      return true;
    }
    p.onPick(null, false);
    return true;
  }

  return (
    <canvas
      ref={el}
      className="layer-canvas"
      width={props.size.w}
      height={props.size.h}
      tabIndex={0}
      role="img"
      aria-label={props.label}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.button !== undefined) return;
        if (begin(e)) e.preventDefault();
      }}
      onDoubleClick={(e) => {
        const c = el.current;
        const ctx = c?.getContext('2d');
        if (!c || !ctx || !latest.current.interactive) return;
        const p = at(e);
        const id = hitPage(latest.current.doc.layers, p.x, p.y, ctx);
        const layer = latest.current.doc.layers.find((l) => l.id === id);
        if (id && layer && isText(layer)) latest.current.onActivate(id);
      }}
      onKeyDown={(e) => {
        // Arrow keys, Delete and the rest are handled for the whole page by the editor; Enter belongs to the canvas it was pressed on.
        if (e.key !== 'Enter') return;
        const sel = latest.current.selectedIds;
        const layer = latest.current.doc.layers.find((l) => l.id === sel[0]);
        if (sel.length === 1 && layer && isText(layer)) {
          e.preventDefault();
          latest.current.onActivate(layer.id);
        }
      }}
    />
  );
});
