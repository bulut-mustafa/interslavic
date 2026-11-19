import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Icon } from '../components/Icon.tsx';
import { Tip } from '../components/Tip.tsx';
import { isImage, isShape, type PhotoLayer } from './doc.ts';
import { isHidden, isLocked, layerName, patchLayers, reorder, setHidden, setLocked } from './layer-ops.ts';
import { EYE, EYE_OFF, GRIP, LOCK, PathIcon, TEXT_T, UNLOCK } from './path-icon.tsx';
import { SHAPE_ENTRIES } from './shapes-catalog.ts';
import './objects.css';

export type ChangeMode = 'commit' | 'preview' | 'end';

/**
 * Where the layer lands when dropped in the gap `gap` of the list as shown
 * (front first, gaps 0..n). Returns the layers in drawing order, or the same
 * array when the layer would not move.
 */
export function dropOrder(layers: readonly PhotoLayer[], id: string, gap: number): PhotoLayer[] {
  const shown = [...layers].reverse();
  const from = shown.findIndex((l) => l.id === id);
  if (from < 0) return layers.slice();
  const to = gap - (from < gap ? 1 : 0);
  if (to === from) return layers.slice();
  const [l] = shown.splice(from, 1);
  shown.splice(to, 0, l!);
  return shown.reverse();
}

function Thumb({ layer }: { layer: PhotoLayer }) {
  if (isImage(layer)) return <Icon name="image" />;
  if (isShape(layer)) return <PathIcon d={SHAPE_ENTRIES.find((s) => s.kind === layer.shape)?.path ?? SHAPE_ENTRIES[0]!.path} />;
  return <PathIcon d={TEXT_T} />;
}

/** Every layer, front first, with hide and lock toggles, rename on double-click, drag or Alt+arrow to reorder. */
export function LayersPanel(props: {
  layers: PhotoLayer[];
  selected: string[];
  onSelect: (ids: string[], additive: boolean) => void;
  onChange: (layers: PhotoLayer[], mode: ChangeMode) => void;
}) {
  const { layers, selected, onSelect, onChange } = props;
  const shown = [...layers].reverse();
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<{ id: string; gap: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const gapAt = (clientY: number): number => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('li[data-id]') ?? [])];
    return rows.filter((r) => {
      const b = r.getBoundingClientRect();
      return b.top + b.height / 2 < clientY;
    }).length;
  };

  const startDrag = (e: PointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id, gap: gapAt(e.clientY) });
  };
  const moveDrag = (e: PointerEvent<HTMLElement>) => {
    if (drag) setDrag({ ...drag, gap: gapAt(e.clientY) });
  };
  const endDrag = (e: PointerEvent<HTMLElement>, cancel: boolean) => {
    if (!drag) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const next = cancel ? layers : dropOrder(layers, drag.id, gapAt(e.clientY));
    setDrag(null);
    if (!cancel && next.some((l, i) => l !== layers[i])) onChange(next, 'commit');
  };

  const commitRename = () => {
    if (renaming) {
      const name = draft.trim();
      if (name) onChange(patchLayers(layers, [renaming], { name }), 'commit');
    }
    setRenaming(null);
  };

  const key = (e: KeyboardEvent<HTMLElement>, l: PhotoLayer, i: number) => {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      // The list shows the front first: up is toward the front.
      const next = reorder(layers, [l.id], e.key === 'ArrowUp' ? 'forward' : 'backward');
      if (next.some((x, j) => x !== layers[j])) onChange(next, 'commit');
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const rows = listRef.current?.querySelectorAll<HTMLElement>('.lp-main');
      rows?.[i + (e.key === 'ArrowUp' ? -1 : 1)]?.focus();
    } else if (e.key === 'F2') {
      e.preventDefault();
      setDraft(layerName(l));
      setRenaming(l.id);
    }
  };

  if (!layers.length) return <p className="lp-empty">No layers yet. Add a picture, shape or text.</p>;

  return (
    <section className="lp inspector" aria-label="Layers">
      <ul className="lp-list" ref={listRef} aria-label="Layer list, front first">
        {shown.map((l, i) => {
          const sel = selected.includes(l.id);
          const hidden = isHidden(l);
          const locked = isLocked(l);
          const name = layerName(l);
          const cls = ['lp-row', sel && 'is-selected', hidden && 'is-hidden', drag?.id === l.id && 'is-dragging', drag && drag.gap === i && 'is-drop-before', drag && drag.gap === shown.length && i === shown.length - 1 && 'is-drop-after'].filter(Boolean).join(' ');
          return (
            <li key={l.id} className={cls} data-id={l.id}>
              <Tip label="Drag to reorder (Alt+arrows)" side="top-end">
                <button
                  type="button"
                  className="insp-tool lp-grip"
                  aria-label={`Reorder ${name}`}
                  onPointerDown={(e) => startDrag(e, l.id)}
                  onPointerMove={moveDrag}
                  onPointerUp={(e) => endDrag(e, false)}
                  onPointerCancel={(e) => endDrag(e, true)}
                  onKeyDown={(e) => key(e, l, i)}
                >
                  <PathIcon d={GRIP} />
                </button>
              </Tip>
              {renaming === l.id ? (
                <input
                  className="lp-rename"
                  aria-label="Layer name"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    else if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="lp-main"
                  aria-pressed={sel}
                  aria-label={name}
                  onClick={(e) => onSelect([l.id], e.shiftKey || e.metaKey || e.ctrlKey)}
                  onDoubleClick={() => {
                    setDraft(name);
                    setRenaming(l.id);
                  }}
                  onKeyDown={(e) => key(e, l, i)}
                >
                  <span className="lp-thumb">
                    <Thumb layer={l} />
                  </span>
                  <span className="lp-name">{name}</span>
                </button>
              )}
              <Tip label={hidden ? 'Show' : 'Hide'} side="top-end">
                <button type="button" className="insp-tool" aria-label={hidden ? `Show ${name}` : `Hide ${name}`} aria-pressed={hidden} onClick={() => onChange(setHidden(layers, [l.id], !hidden), 'commit')}>
                  <PathIcon d={hidden ? EYE_OFF : EYE} />
                </button>
              </Tip>
              <Tip label={locked ? 'Unlock' : 'Lock'} side="top-end">
                <button type="button" className="insp-tool" aria-label={locked ? `Unlock ${name}` : `Lock ${name}`} aria-pressed={locked} onClick={() => onChange(setLocked(layers, [l.id], !locked), 'commit')}>
                  <PathIcon d={locked ? LOCK : UNLOCK} />
                </button>
              </Tip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
