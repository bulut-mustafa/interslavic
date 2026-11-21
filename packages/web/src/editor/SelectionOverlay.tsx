import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { boundsOf, type TextLayer } from './layers.ts';
import type { SceneHandle } from './LayerCanvas.tsx';
import { FONTS } from './text-style.ts';

/** Where the picture sits on screen inside its frame, and how much it is scaled. */
export interface View {
  left: number;
  top: number;
  k: number;
}

/**
 * What sits on the canvas around the selected text: a small toolbar next to it,
 * and, when asked, a box to type in right where the text is. Shared by the photo
 * and the video editor, so selecting text feels the same in both.
 */
export function SelectionOverlay(props: {
  scene: RefObject<SceneHandle | null>;
  wrap: RefObject<HTMLDivElement | null>;
  /** The selected text layers. */
  active: TextLayer[];
  /** Things whose change means the selection may have moved or the canvas resized; measured again when they do. */
  watch: readonly unknown[];
  typing: boolean;
  onType: (text: string) => void;
  onStopTyping: () => void;
  /** The buttons of the toolbar. */
  toolbar: ReactNode;
  /** Told where the picture is on screen, for anything else that has to be laid over it. */
  onView?: (v: View | null) => void;
}) {
  const { scene, wrap, active } = props;
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number; height: number; k: number } | null>(null);
  const layer = active[0] ?? null;
  const bar = useRef<HTMLDivElement>(null);
  // Where the toolbar's left edge goes so it stays inside the picture's frame, whatever the selection's position (a phone's frame is narrow).
  const [shift, setShift] = useState<number | null>(null);
  useLayoutEffect(() => {
    const b = bar.current;
    const w = wrap.current;
    if (!b || !w || !anchor) return;
    const room = w.clientWidth - b.offsetWidth;
    setShift(room > 0 ? Math.max(0, Math.min(anchor.left, room)) : null);
  }, [anchor, wrap, props.typing, props.toolbar]);

  const place = useCallback(() => {
    const c = scene.current?.canvas();
    const w = wrap.current;
    if (!c || !w) {
      props.onView?.(null);
      setAnchor(null);
      return;
    }
    const cr = c.getBoundingClientRect();
    const wr = w.getBoundingClientRect();
    const k = cr.width / c.width || 1;
    const left = cr.left - wr.left;
    const top = cr.top - wr.top;
    props.onView?.({ left, top, k });
    const ctx = c.getContext('2d');
    if (!ctx || active.length === 0) {
      setAnchor(null);
      return;
    }
    const boxes = active.map((l) => boundsOf(ctx, l));
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.w));
    const y1 = Math.max(...boxes.map((b) => b.y + b.h));
    setAnchor({ left: left + x0 * k, top: top + y0 * k, width: (x1 - x0) * k, height: (y1 - y0) * k, k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, props.watch);
  useLayoutEffect(place, [place]);
  // The frame around the canvas is only attached once everything inside it has been, so measure again after the commit.
  useEffect(place, [place]);
  useEffect(() => {
    window.addEventListener('resize', place);
    const c = scene.current?.canvas();
    const ro = typeof ResizeObserver !== 'undefined' && c ? new ResizeObserver(place) : null;
    if (ro && c) ro.observe(c);
    return () => {
      window.removeEventListener('resize', place);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place]);

  if (!layer || !anchor) return null;

  if (props.typing) {
    return (
      <textarea
        className="canvas-typing"
        aria-label="Type on the picture"
        autoFocus
        spellCheck={false}
        value={layer.text}
        style={{
          left: anchor.left - 6,
          top: anchor.top - 6,
          width: Math.max(anchor.width, 160) + 12,
          minHeight: anchor.height + 12,
          fontFamily: FONTS[layer.style.font].css,
          fontSize: Math.max(13, layer.style.size * anchor.k),
          lineHeight: layer.style.lineHeight,
          textAlign: layer.style.align,
        }}
        onChange={(e) => props.onType(e.target.value)}
        onBlur={props.onStopTyping}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            props.onStopTyping();
            scene.current?.canvas()?.focus();
          }
        }}
      />
    );
  }

  return (
    <div ref={bar} className="canvas-toolbar" role="toolbar" aria-label="Selected text" style={{ left: shift ?? Math.max(0, anchor.left), top: anchor.top > 56 ? anchor.top - 50 : anchor.top + anchor.height + 12 }}>
      {props.toolbar}
    </div>
  );
}
