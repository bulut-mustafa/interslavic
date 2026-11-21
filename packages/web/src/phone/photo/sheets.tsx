import { useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon.tsx';
import type { StepKind } from '../../editor/layers.ts';
import { hex } from '../../editor/Inspector.tsx';
import { isImage, isShape, type PhotoLayer } from '../../photo/doc.ts';
import { ReleaseSlider } from '../../photo/AdjustPanel.tsx';
import { isHidden, isLocked, layerName, reorder, setHidden, setLocked, type AlignKind } from '../../photo/layer-ops.ts';
import { onlyImages } from '../../photo/AddPanel.tsx';
import { EYE, EYE_OFF, LOCK, PathIcon, TEXT_T, UNLOCK } from '../../photo/path-icon.tsx';
import { ALIGN_ICONS, FRAME_ENTRIES, SHAPE_ENTRIES, STICKER_GROUPS, type FrameKind } from '../../photo/shapes-catalog.ts';
import type { ShapeKind } from '../../photo/doc.ts';
import type { OcrLang } from '../../photo/ocr.ts';
import type { Script } from '../../subtitles/translate.ts';
import { ICONS } from './icons.ts';

/** The phone's tool sheets: small panels built from the same pieces and the same actions as the desktop's side panels. */

export const SWATCHES = ['#000000', '#ffffff', '#e0245e', '#f26b21', '#f7c325', '#2e9e5b', '#1f6b6b', '#2878ff', '#6a3fd1', '#8a8f98', '#16202f', '#f4e4c1'];

/** A big square button: an icon over a label. */
export function Tile(props: { label: string; icon: ReactNode; onClick?: () => void; children?: ReactNode; pressed?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className="pp-tile" aria-pressed={props.pressed} disabled={props.disabled} onClick={props.onClick}>
      <span className="pp-tile-icon">{props.icon}</span>
      <span>{props.label}</span>
      {props.children}
    </button>
  );
}

export function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="pp-section" aria-label={props.title}>
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}

// ---- Add ----

export function AddSheet(props: {
  onPickFiles: (files: File[]) => void;
  onAddText: () => void;
  onAddShape: (kind: ShapeKind) => void;
  onAddSticker: (c: string) => void;
  onPickFrame?: (frame: FrameKind | undefined) => void;
  done: () => void;
}) {
  return (
    <div className="pp-add">
      <div className="pp-tiles">
        <Tile
          label="Text"
          icon={<Icon name="addText" size="1.6rem" />}
          onClick={() => {
            props.onAddText();
            props.done();
          }}
        />
        <label className="pp-tile">
          <span className="pp-tile-icon">
            <Icon name="image" size="1.6rem" />
          </span>
          <span>Picture</span>
          <input
            type="file"
            accept="image/*"
            multiple
            aria-label="Add pictures"
            onChange={(e) => {
              const files = onlyImages(e.target.files ?? []);
              if (files.length) {
                props.onPickFiles(files);
                props.done();
              }
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <Section title="Shapes">
        <div className="pp-grid" role="group" aria-label="Shapes">
          {SHAPE_ENTRIES.map((s) => (
            <button
              key={s.kind}
              type="button"
              className="pp-cell"
              aria-label={`Add ${s.label.toLowerCase()}`}
              onClick={() => {
                props.onAddShape(s.kind);
                props.done();
              }}
            >
              <PathIcon d={s.path} size="1.6rem" />
            </button>
          ))}
        </div>
      </Section>

      {props.onPickFrame && (
        <Section title="Frames">
          <div className="pp-grid" role="group" aria-label="Frames">
            {FRAME_ENTRIES.map((f) => (
              <button key={f.label} type="button" className="pp-cell" aria-label={f.frame ? `Frame: ${f.label.toLowerCase()}` : 'Frame: none'} onClick={() => props.onPickFrame?.(f.frame)}>
                <PathIcon d={f.path} size="1.6rem" />
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Stickers">
        {STICKER_GROUPS.map((g) => (
          <div key={g.id} className="pp-grid" role="group" aria-label={g.label}>
            {g.chars.map((c) => (
              <button
                key={c}
                type="button"
                className="pp-cell"
                aria-label={`Add sticker ${c}`}
                onClick={() => {
                  props.onAddSticker(c);
                  props.done();
                }}
              >
                {c}
              </button>
            ))}
          </div>
        ))}
        <p className="pp-hint">Stickers are emoji drawn by your device, so they look different on other devices.</p>
      </Section>
    </div>
  );
}

// ---- Colour ----

export function ColourSheet(props: { value: string; onPick: (c: string) => void; label?: string }) {
  return (
    <div className="pp-colour">
      <div className="pp-swatches" role="group" aria-label={props.label ?? 'Colours'}>
        {SWATCHES.map((c) => (
          <button key={c} type="button" className="pp-swatch" aria-label={`Colour ${c}`} aria-pressed={props.value.toLowerCase() === c} style={{ background: c }} onClick={() => props.onPick(c)} />
        ))}
      </div>
      <label className="pp-row">
        <span>Any colour</span>
        <input type="color" aria-label="Text colour" value={hex(props.value)} onChange={(e) => props.onPick(e.target.value)} />
      </label>
    </div>
  );
}

// ---- Position ----

const ALIGNS: { kind: AlignKind; label: string }[] = [
  { kind: 'left', label: 'Align left' },
  { kind: 'center', label: 'Align center' },
  { kind: 'right', label: 'Align right' },
  { kind: 'top', label: 'Align top' },
  { kind: 'middle', label: 'Align middle' },
  { kind: 'bottom', label: 'Align bottom' },
];
const ARRANGE: { kind: StepKind; label: string; icon: 'front' | 'forward' | 'backward' | 'toBack' }[] = [
  { kind: 'front', label: 'Bring to front', icon: 'front' },
  { kind: 'forward', label: 'Bring forward', icon: 'forward' },
  { kind: 'backward', label: 'Send backward', icon: 'backward' },
  { kind: 'back', label: 'Send to back', icon: 'toBack' },
];
const NUDGES = [
  ['Nudge left', 'arrowLeft', -5, 0],
  ['Nudge up', 'arrowUp', 0, -5],
  ['Nudge down', 'arrowDown', 0, 5],
  ['Nudge right', 'arrowRight', 5, 0],
] as const;

export function PositionSheet(props: {
  rotation: number;
  canMove: boolean;
  onAlign: (k: AlignKind) => void;
  onOrder: (k: StepKind) => void;
  onNudge: (dx: number, dy: number) => void;
  onRotate: (deg: number, mode: 'preview' | 'end') => void;
}) {
  return (
    <div className="pp-position">
      <Section title="Align to the page">
        <div className="pp-row-icons" role="group" aria-label="Align to the page">
          {ALIGNS.map((a) => (
            <button key={a.kind} type="button" className="pp-cell" aria-label={a.label} disabled={!props.canMove} onClick={() => props.onAlign(a.kind)}>
              <PathIcon d={ALIGN_ICONS[a.kind]} size="1.5rem" />
            </button>
          ))}
        </div>
      </Section>
      <Section title="Arrange">
        <div className="pp-row-icons" role="group" aria-label="Arrange">
          {ARRANGE.map((a) => (
            <button key={a.kind} type="button" className="pp-cell" aria-label={a.label} onClick={() => props.onOrder(a.kind)}>
              <Icon name={a.icon} size="1.5rem" />
            </button>
          ))}
        </div>
      </Section>
      <Section title="Nudge">
        <div className="pp-row-icons" role="group" aria-label="Nudge">
          {NUDGES.map(([label, icon, dx, dy]) => (
            <button key={label} type="button" className="pp-cell" aria-label={label} disabled={!props.canMove} onClick={() => props.onNudge(dx, dy)}>
              <Icon name={icon} size="1.5rem" />
            </button>
          ))}
        </div>
      </Section>
      <Section title="Rotation">
        <ReleaseSlider label="Rotation" value={Math.round(props.rotation)} min={-180} max={180} step={1} resetTo={0} show={(v) => `${v}°`} onChange={props.onRotate} />
        <button type="button" className="pp-chip" onClick={() => { props.onRotate(0, 'preview'); props.onRotate(0, 'end'); }}>
          Reset the turn
        </button>
      </Section>
    </div>
  );
}

// ---- More ----

export function MoreSheet(props: { items: { id: string; label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }[]; done: () => void }) {
  return (
    <ul className="pp-list" aria-label="More">
      {props.items.map((it) => (
        <li key={it.id}>
          <button
            type="button"
            className={it.danger ? 'pp-list-row is-danger' : 'pp-list-row'}
            disabled={it.disabled}
            onClick={() => {
              it.onClick();
              props.done();
            }}
          >
            <span className="pp-list-icon">{it.icon}</span>
            {it.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---- Text (Live Text, translation settings) ----

const LANGS: { value: OcrLang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
  { value: 'uk', label: 'Ukrainian' },
];

export function TextSheet(props: {
  note: string | null;
  canSelectAll: boolean;
  onSelectAll: () => void;
  lang: OcrLang;
  onLang: (l: OcrLang) => void;
  script: Script;
  onScript: (s: Script) => void;
  onAddText: () => void;
  hint: ReactNode;
  error: ReactNode;
  done: () => void;
}) {
  return (
    <div className="pp-text">
      {props.note && <p className="pp-note">{props.note}</p>}
      {props.error}
      {props.hint}
      <div className="pp-tiles">
        <Tile
          label="Select all text"
          icon={<PathIcon d={ICONS.text} size="1.6rem" />}
          disabled={!props.canSelectAll}
          onClick={() => {
            props.onSelectAll();
            props.done();
          }}
        />
        <Tile
          label="Add a text box"
          icon={<Icon name="addText" size="1.6rem" />}
          onClick={() => {
            props.onAddText();
            props.done();
          }}
        />
      </div>
      <label className="pp-row">
        <span>Text language</span>
        <select value={props.lang} onChange={(e) => props.onLang(e.target.value as OcrLang)} aria-label="Language of the text in the photo">
          {LANGS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <label className="pp-row">
        <span>Interslavic script</span>
        <select value={props.script} onChange={(e) => props.onScript(e.target.value as Script)} aria-label="Interslavic script">
          <option value="standard">Latin</option>
          <option value="cyrillic">Cyrillic</option>
        </select>
      </label>
      <p className="pp-hint">Tap a word in the picture to select it, tap again for the whole line, then choose Translate.</p>
    </div>
  );
}

// ---- Layers ----

function LayerIcon({ layer }: { layer: PhotoLayer }) {
  if (isImage(layer)) return <Icon name="image" />;
  if (isShape(layer)) return <PathIcon d={SHAPE_ENTRIES.find((s) => s.kind === layer.shape)?.path ?? SHAPE_ENTRIES[0]!.path} />;
  return <PathIcon d={TEXT_T} />;
}

/** Every layer, front first: tap to select, eye, lock, and buttons to move it up or down (no drag needed). */
export function LayersSheet(props: { layers: PhotoLayer[]; selected: string[]; onSelect: (id: string) => void; onChange: (next: PhotoLayer[]) => void; onDelete?: (id: string) => void }) {
  const { layers } = props;
  // One row is "the one": the list rows only select, and ONE bar of actions (move, hide, lock, delete) acts on that row. Hidden and
  // locked layers cannot be picked on the picture, so the row tapped here is remembered separately from the picture's selection.
  const [tapped, setTapped] = useState<string | null>(null);
  if (layers.length === 0) return <p className="pp-note">No layers yet. Add text, a picture or a shape.</p>;
  const shown = [...layers].reverse();
  const focusId = [tapped, props.selected[0]].find((id) => !!id && layers.some((l) => l.id === id)) ?? null;
  const at = shown.findIndex((l) => l.id === focusId);
  const cur = at >= 0 ? shown[at]! : null;
  const name = cur ? layerName(cur) : '';
  const hidden = !!cur && isHidden(cur);
  const locked = !!cur && isLocked(cur);
  return (
    <>
      <div className="pp-actionbar" role="toolbar" aria-label={cur ? `Actions for ${name}` : 'Layer actions'}>
        {cur ? (
          <>
            <span className="pp-actionbar-name">{name}</span>
            <button type="button" className="pp-icon-btn" aria-label={`Move ${name} up`} disabled={at === 0} onClick={() => props.onChange(reorder(layers, [cur.id], 'forward'))}>
              <Icon name="arrowUp" />
            </button>
            <button type="button" className="pp-icon-btn" aria-label={`Move ${name} down`} disabled={at === shown.length - 1} onClick={() => props.onChange(reorder(layers, [cur.id], 'backward'))}>
              <Icon name="arrowDown" />
            </button>
            <button type="button" className="pp-icon-btn" aria-label={hidden ? `Show ${name}` : `Hide ${name}`} aria-pressed={hidden} onClick={() => props.onChange(setHidden(layers, [cur.id], !hidden))}>
              <PathIcon d={hidden ? EYE_OFF : EYE} />
            </button>
            <button type="button" className="pp-icon-btn" aria-label={locked ? `Unlock ${name}` : `Lock ${name}`} aria-pressed={locked} onClick={() => props.onChange(setLocked(layers, [cur.id], !locked))}>
              <PathIcon d={locked ? LOCK : UNLOCK} />
            </button>
            {props.onDelete && (
              <button
                type="button"
                className="pp-icon-btn is-danger"
                aria-label={`Delete ${name}`}
                onClick={() => {
                  // The next layer in the list takes over, so Delete can be pressed again for the one below.
                  const next = shown[at + 1] ?? shown[at - 1];
                  setTapped(next ? next.id : null);
                  props.onDelete?.(cur.id);
                }}
              >
                <Icon name="trash" />
              </button>
            )}
          </>
        ) : (
          <span className="pp-actionbar-name">Tap a layer to move, hide, lock or delete it</span>
        )}
      </div>
      <ul className="pp-layers" aria-label="Layer list, front first">
        {shown.map((l) => {
          const n = layerName(l);
          const sel = l.id === focusId;
          return (
            <li key={l.id} className={`pp-layer${sel ? ' is-selected' : ''}${isHidden(l) ? ' is-hidden' : ''}`}>
              <button
                type="button"
                className="pp-layer-main"
                aria-pressed={sel}
                aria-label={n}
                onClick={() => {
                  setTapped(l.id);
                  props.onSelect(l.id);
                }}
              >
                <span className="pp-layer-thumb">
                  <LayerIcon layer={l} />
                </span>
                <span className="pp-layer-name">{n}</span>
                {isHidden(l) && <span className="pp-layer-flag">hidden</span>}
                {isLocked(l) && <span className="pp-layer-flag">locked</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---- Pages ----

export function PagesSheet(props: {
  pages: { id: string; name: string; thumb?: string; edited: boolean }[];
  currentId: string;
  onShow: (id: string) => void;
  onAddFiles: (files: File[]) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, by: -1 | 1) => void;
}) {
  const [asking, setAsking] = useState<string | null>(null);
  const n = props.pages.length;
  // Tiles only choose a page; ONE bar of actions (move, duplicate, delete) acts on the chosen page. Four buttons on every tile did not fit
  // the tile (160px of buttons in 111px), so each tile's trash sat under its neighbour's arrow and could not be tapped.
  const at = Math.max(0, props.pages.findIndex((p) => p.id === props.currentId));
  const cur = props.pages[at];
  return (
    <div className="pp-pages-sheet">
      {cur && (
        <div className="pp-actionbar" role="toolbar" aria-label={`Actions for page ${at + 1}`}>
          {asking === cur.id ? (
            <div className="pp-page-ask" role="alertdialog" aria-label={`Remove page ${at + 1}?`}>
              <span>Page {at + 1} has changes that will be lost.</span>
              <button type="button" className="pp-chip is-danger" onClick={() => { setAsking(null); props.onRemove(cur.id); }}>
                Remove
              </button>
              <button type="button" className="pp-chip" onClick={() => setAsking(null)}>
                Keep
              </button>
            </div>
          ) : (
            <>
              <span className="pp-actionbar-name">Page {at + 1}</span>
              <button type="button" className="pp-icon-btn" aria-label={`Move page ${at + 1} earlier`} disabled={at === 0} onClick={() => props.onMove(cur.id, -1)}>
                <Icon name="arrowLeft" />
              </button>
              <button type="button" className="pp-icon-btn" aria-label={`Move page ${at + 1} later`} disabled={at === n - 1} onClick={() => props.onMove(cur.id, 1)}>
                <Icon name="arrowRight" />
              </button>
              <button type="button" className="pp-icon-btn" aria-label={`Duplicate page ${at + 1}`} onClick={() => props.onDuplicate(cur.id)}>
                <Icon name="copy" />
              </button>
              <button type="button" className="pp-icon-btn is-danger" aria-label={`Delete page ${at + 1}`} onClick={() => (cur.edited ? setAsking(cur.id) : props.onRemove(cur.id))}>
                <Icon name="trash" />
              </button>
            </>
          )}
        </div>
      )}
      <ol className="pp-page-grid">
        {props.pages.map((p, i) => (
          <li key={p.id} className={p.id === props.currentId ? 'pp-page is-current' : 'pp-page'}>
            <button
              type="button"
              className="pp-page-thumb"
              aria-label={`Page ${i + 1}: ${p.name}`}
              aria-current={p.id === props.currentId ? 'page' : undefined}
              onClick={() => {
                setAsking(null);
                props.onShow(p.id);
              }}
            >
              {p.thumb ? <img src={p.thumb} alt="" /> : <span className="pp-page-blank" aria-hidden="true" />}
              <span className="pp-page-number" aria-hidden="true">
                {i + 1}
              </span>
              {p.edited && <span className="pp-page-dot" aria-hidden="true" />}
            </button>
          </li>
        ))}
        <li className="pp-page">
          <label className="pp-page-add">
            <Icon name="plus" size="1.6rem" />
            <span>Add page</span>
            <input
              type="file"
              multiple
              accept="image/*"
              aria-label="Add pages"
              onChange={(e) => {
                const files = onlyImages(e.target.files ?? []);
                if (files.length) props.onAddFiles(files);
                e.target.value = '';
              }}
            />
          </label>
        </li>
      </ol>
    </div>
  );
}
