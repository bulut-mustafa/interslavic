import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { Link } from '../../router.tsx';
import { Inspector } from '../../editor/Inspector.tsx';
import { TextEffectsPanel } from '../../editor/TextEffectsPanel.tsx';
import { SelectionOverlay } from '../../editor/SelectionOverlay.tsx';
import { TransformBox } from '../../editor/TransformBox.tsx';
import type { SceneHandle } from '../../editor/LayerCanvas.tsx';
import { boxOfMedia } from '../../editor/transform-math.ts';
import { AdjustPanel } from '../../photo/AdjustPanel.tsx';
import { CropTool } from '../../photo/CropTool.tsx';
import { ObjectInspector, type ObjectPart } from '../../photo/ObjectInspector.tsx';
import { PhotoCanvas } from '../../photo/PhotoCanvas.tsx';
import { PathIcon } from '../../photo/path-icon.tsx';
import { presetsFor, movable, selectable } from '../../photo/page-ops.ts';
import { boundsOfSelection, boxOfLayer, hitPage, HIT_SLACK } from '../../photo/hit.ts';
import { isHidden } from '../../photo/hit.ts';
import { isImage, isShape } from '../../photo/doc.ts';
import { lineAround, nearestGlyph, wordAround } from '../../photo/live-text.ts';
import { BottomSheet, type Detent } from '../BottomSheet.tsx';
import { FloatingBar } from '../FloatingBar.tsx';
import { KeyboardBar } from '../KeyboardBar.tsx';
import { ToolStrip, type StripItem } from '../ToolStrip.tsx';
import { useGestures } from '../useGestures.ts';
import { useKeyboardInset } from '../useKeyboardInset.ts';
import { clampPan, placement, revealPan, toPage, toStageRect, zoomAbout, type Pan, type Size } from './canvas-view.ts';
import { pinchLayer, planMove, softRotation } from './gesture-actions.ts';
import { ICONS } from './icons.ts';
import { emptyTextToRemove, holdInPlace, typingPadding } from './typing.ts';
import { remove } from '../../photo/layer-ops.ts';
import { AddSheet, ColourSheet, LayersSheet, MoreSheet, PagesSheet, PositionSheet, TextSheet } from './sheets.tsx';
import type { PhoneCtx } from './types.ts';
import './phone-photo.css';

const CutoutDialog = lazy(() => import('../../photo/CutoutDialog.tsx'));

export type SheetId = 'add' | 'adjust' | 'text' | 'layers' | 'font' | 'size' | 'colour' | 'effects' | 'position' | 'frame' | 'imgadjust' | 'more' | 'pages' | 'export' | 'cutout' | 'crop';

const TITLES: Record<SheetId, string> = {
  add: 'Add',
  adjust: 'Adjust',
  text: 'Text',
  layers: 'Layers',
  font: 'Font',
  size: 'Size',
  colour: 'Colour',
  effects: 'Effects',
  position: 'Position',
  frame: 'Frame',
  imgadjust: 'Adjust picture',
  more: 'More',
  pages: 'Pages',
  export: 'Download',
  cutout: 'Remove background',
  crop: 'Crop and rotate',
};

/** The set of tools on the strip: what is selected decides it (Canva and CapCut do the same). */
export type StripMode = 'idle' | 'text' | 'image' | 'shape' | 'object' | 'multi';

export function stripModeOf(c: Pick<PhoneCtx, 'isVirtual' | 'textSel' | 'objectSel' | 'sel'>): StripMode {
  if (c.isVirtual || (c.textSel.length > 0 && c.objectSel.length === 0)) return 'text';
  if (c.objectSel.length > 0 && c.textSel.length === 0) return c.objectSel.every(isImage) ? 'image' : c.objectSel.every(isShape) ? 'shape' : 'object';
  return c.sel.length > 0 ? 'multi' : 'idle';
}

const ic = (name: Parameters<typeof Icon>[0]['name']) => <Icon name={name} size="1.5rem" />;
const pi = (d: string) => <PathIcon d={d} size="1.5rem" />;

const ITEM: Record<string, StripItem> = {
  add: { id: 'add', label: 'Add', icon: ic('plus') },
  background: { id: 'background', label: 'Background', icon: pi(ICONS.background) },
  crop: { id: 'crop', label: 'Crop', icon: pi(ICONS.crop) },
  adjust: { id: 'adjust', label: 'Adjust', icon: pi(ICONS.adjust) },
  text: { id: 'text', label: 'Text', icon: pi(ICONS.text) },
  layers: { id: 'layers', label: 'Layers', icon: pi(ICONS.layers) },
  edit: { id: 'edit', label: 'Edit', icon: ic('edit') },
  font: { id: 'font', label: 'Font', icon: pi(ICONS.font) },
  size: { id: 'size', label: 'Size', icon: pi(ICONS.size) },
  colour: { id: 'colour', label: 'Colour', icon: pi(ICONS.colour) },
  effects: { id: 'effects', label: 'Effects', icon: pi(ICONS.effects) },
  position: { id: 'position', label: 'Position', icon: pi(ICONS.position) },
  more: { id: 'more', label: 'More', icon: pi(ICONS.more) },
  frame: { id: 'frame', label: 'Frame', icon: pi(ICONS.frame) },
  imgadjust: { id: 'imgadjust', label: 'Adjust', icon: pi(ICONS.adjust) },
};

const IDS: Record<StripMode, string[]> = {
  idle: ['add', 'background', 'crop', 'adjust', 'text', 'layers'],
  text: ['edit', 'font', 'size', 'colour', 'effects', 'position', 'layers', 'more'],
  image: ['imgadjust', 'effects', 'frame', 'position', 'layers', 'more'],
  shape: ['colour', 'effects', 'position', 'layers', 'more'],
  object: ['effects', 'position', 'layers', 'more'],
  multi: ['position', 'layers', 'more'],
};

/** The strip's items for a mode, some disabled (nothing to move in live text that is not a layer yet, say). */
export function stripItems(mode: StripMode, c: Pick<PhoneCtx, 'isVirtual' | 'cutting' | 'exporting'>): StripItem[] {
  return IDS[mode].map((id) => {
    const it = ITEM[id]!;
    if (c.isVirtual && (id === 'position')) return { ...it, disabled: true };
    return it;
  });
}

/** Sheets that stay open whatever is selected; a tool of one selection closes when the selection changes to one without it. */
const ALWAYS = new Set<SheetId>(['add', 'layers', 'pages', 'export', 'cutout', 'crop', 'more', 'adjust', 'text']);

const insideRect = (p: { x: number; y: number }, b: { x0: number; y0: number; x1: number; y1: number }, pad: number): boolean => p.x >= b.x0 - pad && p.x <= b.x1 + pad && p.y >= b.y0 - pad && p.y <= b.y1 + pad;

/** How far a transform handle's touch area reaches past the box, px (44px handles centred on the edge). */
export const HANDLE_REACH = 22;

const FALLBACK: Size = { w: 360, h: 480 };

type Session =
  | { kind: 'move'; ids: string[]; base: import('../../photo/doc.ts').PhotoLayer[]; rect: { x: number; y: number; w: number; h: number }; others: ReturnType<typeof boxOfLayer>[] }
  | { kind: 'pan'; pan0: Pan }
  | { kind: 'pinch'; id: string; base: import('../../photo/doc.ts').PhotoLayer }
  | { kind: 'zoom'; zoom0: number; pan0: Pan; focus: Pan };

/**
 * One page of the phone photo editor: a grey stage with the picture, a slim bar on top (undo, redo, pages, Download), a thumbnail row,
 * and the tool strip, with ONE bottom sheet for whichever tool is open. It draws and drives the page through `PhoneCtx` (the state
 * and actions of PagePane in photo/PhotoEditor.tsx): the layers, history, saving, text finding, cut-out and export are the desktop's own.
 */
export default function PhonePageView({ ctx: c }: { ctx: PhoneCtx }) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [lastSheet, setLastSheet] = useState<SheetId>('add');
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [gesturing, setGesturing] = useState(false);
  const [measured, setMeasured] = useState<Size>({ w: 0, h: 0 });
  const stageEl = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const session = useRef<Session | null>(null);
  /** The zoom as the gesture last set it: events can arrive faster than a render, so the handlers must not read a stale one. */
  const zoomNow = useRef(1);
  zoomNow.current = zoom;
  const kb = useKeyboardInset();

  const stage: Size = measured.w > 0 && measured.h > 0 ? measured : FALLBACK;
  const at = placement(stage, c.shownSize, zoom, pan);

  useLayoutEffect(() => {
    const n = stageEl.current;
    if (!n) return;
    const read = () => setMeasured((m) => (m.w === n.clientWidth && m.h === n.clientHeight ? m : { w: n.clientWidth, h: n.clientHeight }));
    read();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    ro?.observe(n);
    window.addEventListener('resize', read);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', read);
    };
  }, []);

  // A smaller stage (a sheet came up) or a smaller zoom must not leave the picture out of reach.
  useEffect(() => {
    setPan((p) => {
      const q = clampPan(stage, { w: at.width, h: at.height }, p);
      return q.x === p.x && q.y === p.y ? p : q;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.w, stage.h, zoom, c.shownSize.w, c.shownSize.h]);

  // ---- which tools are shown ----
  const mode = stripModeOf(c);
  const items = stripItems(mode, c);
  const derived: SheetId | null = c.shell.exportNode ? 'export' : c.cutting ? 'cutout' : c.crop ? 'crop' : c.shell.pagesOpen ? 'pages' : sheet;
  const stripIds = new Set(IDS[mode]);
  useEffect(() => {
    if (sheet && !ALWAYS.has(sheet) && !stripIds.has(sheet)) setSheet(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  useEffect(() => {
    if (derived) setLastSheet(derived);
  }, [derived]);
  const shown: SheetId = derived ?? lastSheet;

  const closeSheet = () => {
    if (c.shell.exportNode) c.shell.onExportClose();
    else if (c.cutting) c.cancelCutout();
    else if (c.crop) c.setCrop(null);
    else if (c.shell.pagesOpen) c.shell.setPagesOpen(false);
    else setSheet(null);
  };
  const toggle = (id: SheetId) => {
    if (id === 'pages') c.shell.setPagesOpen(!c.shell.pagesOpen);
    else setSheet((s) => (s === id ? null : id));
  };

  const onStrip = (id: string) => {
    if (id === 'edit') {
      setSheet(null);
      c.startTyping();
    } else if (id === 'background') c.startCutout();
    else if (id === 'crop') {
      setSheet(null);
      c.startCrop();
    } else toggle(id as SheetId);
  };

  // ---- the picture's own box on screen: the floating bar sits by it ----
  const selection = useMemo(() => {
    const ids = c.isVirtual ? c.activeIds : c.sel;
    const pool = c.isVirtual ? c.textActive : c.layers;
    if (ids.length === 0) return null;
    return boundsOfSelection(pool, ids, c.measureCtx ?? undefined);
  }, [c.isVirtual, c.activeIds, c.sel, c.textActive, c.layers, c.measureCtx]);
  const rawAnchor = selection ? toStageRect(selection, at) : null;
  // A picture or shape has transform handles whose 44px touch areas reach 22px past its edges; the bar keeps clear of them
  // (otherwise its top row of pixels sat on the bottom handles and taps there turned into a resize).
  const pad = c.boxed && !c.crop ? HANDLE_REACH : 0;
  const anchor = rawAnchor ? { x: rawAnchor.x - pad, y: rawAnchor.y - pad, width: rawAnchor.width + pad * 2, height: rawAnchor.height + pad * 2 } : null;
  const barShown = !!anchor && !gesturing && !c.typing && !c.crop && !c.cutting && !c.shell.exportNode;

  // ---- text typing: the picture slides up above the keyboard ----
  useEffect(() => {
    if (!c.typing) return;
    if (!anchor) return;
    setPan((p) => revealPan(stage, anchor, p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.typing, stage.h, kb]);

  /** Ends typing; a text left empty is removed (it would be an invisible layer that cannot be hit or seen). */
  const stopTyping = () => {
    if (c.typing && emptyTextToRemove(c.layer, c.isVirtual)) c.removeSel();
    else c.setTyping(false);
  };
  // iOS scrolls the editor's boxes and the page to reveal the typing box: hold everything in place while typing.
  useEffect(() => {
    if (!c.typing) return;
    return holdInPlace([root, stageEl.current]);
  }, [c.typing, root]);

  // ---- touch ----
  const slack = Math.max(HIT_SLACK, 12 / at.k);
  const hitAt = (p: Pan): string | null => {
    const g = toPage(p, at);
    const id = hitPage(c.layers, g.x, g.y, c.measureCtx ?? undefined, slack);
    return id && selectable(c.layers).includes(id) ? id : null;
  };

  useGestures(
    surface,
    {
      onTap: (p) => {
        const wasTyping = c.typing;
        if (wasTyping) stopTyping();
        const id = hitAt(p);
        if (id) {
          c.pickLayers([id]);
          return;
        }
        const g = toPage(p, at);
        if (c.liveOn && c.live.length > 0) {
          const line = c.lineAreas.find((a) => insideRect(g, a.box, 6));
          const near = line ? nearestGlyph(c.live, g) : null;
          if (near !== null) {
            const word = wordAround(c.live, near);
            const same = !!c.picked && c.picked[0] === word[0] && c.picked[1] === word[1];
            c.setSelectedIds([]);
            c.setPicked(same ? lineAround(c.live, near) : word);
            return;
          }
        }
        c.clear();
      },
      onDoubleTap: (p) => {
        const id = hitAt(p);
        const hit = id ? c.layers.find((l) => l.id === id) : null;
        if (hit && !isImage(hit) && !isShape(hit)) {
          c.pickLayers([hit.id]);
          c.setTyping(true);
        }
        // Found text is not edited by a double tap: its second tap already means "the whole line" (and Edit is on the bar).
      },
      onLongPress: (p) => {
        const id = hitAt(p);
        if (!id) return;
        c.pickLayers([id]);
        setSheet('more');
      },
      onDragStart: (e) => {
        if (c.typing) return;
        const start = { x: e.x - e.dx, y: e.y - e.dy };
        const id = hitAt(start);
        if (id) {
          const chosen = c.sel.includes(id) ? c.sel : [id];
          if (!c.sel.includes(id)) c.pickLayers([id]);
          const ids = movable(c.layers, chosen);
          const rect = ids.length > 0 ? boundsOfSelection(c.layers, ids, c.measureCtx ?? undefined) : null;
          if (rect) {
            const others = c.layers.filter((l) => !ids.includes(l.id) && !isHidden(l)).map((l) => boxOfLayer(l, c.measureCtx ?? undefined));
            session.current = { kind: 'move', ids, base: c.layers, rect, others };
            setGesturing(true);
            return;
          }
        }
        session.current = zoom > 1 ? { kind: 'pan', pan0: pan } : null;
      },
      onDrag: (e) => {
        const s = session.current;
        if (!s) return;
        if (s.kind === 'pan') {
          setPan(clampPan(stage, { w: at.width, h: at.height }, { x: s.pan0.x + e.dx, y: s.pan0.y + e.dy }));
        } else if (s.kind === 'move') {
          const plan = planMove({ base: s.base, ids: s.ids, rect: s.rect, others: s.others, dx: e.dx / at.k, dy: e.dy / at.k, page: c.page, k: at.k });
          c.setGuides(plan.guides);
          c.edit((d) => ({ ...d, layers: plan.layers }), 'preview');
        }
      },
      onDragEnd: () => {
        const s = session.current;
        session.current = null;
        if (s?.kind === 'move') {
          c.setGuides([]);
          c.edit((d) => d, 'end');
        }
        setGesturing(false);
      },
      onTransformStart: (e) => {
        if (c.typing || c.crop) return;
        const ids = movable(c.layers, c.sel);
        const rect = ids.length === 1 && !c.isVirtual ? boundsOfSelection(c.layers, ids, c.measureCtx ?? undefined) : null;
        const g = toPage({ x: e.cx, y: e.cy }, at);
        const onIt = !!rect && g.x >= rect.x - 24 / at.k && g.x <= rect.x + rect.w + 24 / at.k && g.y >= rect.y - 24 / at.k && g.y <= rect.y + rect.h + 24 / at.k;
        const base = onIt ? c.layers.find((l) => l.id === ids[0]) : undefined;
        if (base) {
          session.current = { kind: 'pinch', id: base.id, base };
          setGesturing(true);
        } else {
          session.current = { kind: 'zoom', zoom0: zoom, pan0: pan, focus: { x: e.cx, y: e.cy } };
        }
      },
      onTransform: (e) => {
        const s = session.current;
        if (!s) return;
        if (s.kind === 'zoom') {
          const z = zoomAbout(stage, c.shownSize, s.zoom0, s.pan0, e.scale, s.focus, { x: e.dx, y: e.dy });
          zoomNow.current = z.zoom;
          setZoom(z.zoom);
          setPan(z.pan);
        } else if (s.kind === 'pinch') {
          const next = pinchLayer(s.base, { scale: e.scale, rotation: softRotation(e.rotation), dx: e.dx / at.k, dy: e.dy / at.k }, c.measure, c.page);
          c.edit((d) => ({ ...d, layers: d.layers.map((l) => (l.id === s.id ? next : l)) }), 'preview');
        }
      },
      onTransformEnd: () => {
        const s = session.current;
        session.current = null;
        if (s?.kind === 'pinch') c.edit((d) => d, 'end');
        if (s?.kind === 'zoom' && zoomNow.current <= 1.02) {
          zoomNow.current = 1;
          setZoom(1);
          setPan({ x: 0, y: 0 });
        }
        setGesturing(false);
      },
    },
    !c.crop && !c.exporting,
  );

  // ---- what the sheet holds ----
  const layer = c.layer;
  /** Deletes one layer from the Layers sheet (hidden and locked ones cannot be picked on the picture, so this is their only way out); one undo step. */
  const deleteLayer = (id: string) => {
    c.commit(remove(c.layers, [id]));
    if (c.sel.includes(id)) c.setSelectedIds(c.sel.filter((x) => x !== id));
  };
  const done = () => setSheet(null);
  const objectPatch = (patch: Record<string, unknown>, mode: 'commit' | 'preview' | 'end') => c.objectChange(patch, mode);
  const objectSheet = (only: readonly ObjectPart[]) =>
    c.objectSel[0] ? (
      <ObjectInspector layer={c.objectSel[0]} page={c.page} only={only} onChange={objectPatch} onOrder={c.orderSel} onAlign={c.align} onDuplicate={c.duplicateSel} onDelete={c.removeSel} />
    ) : null;
  const imageSelected = c.objectSel.length === 1 && isImage(c.objectSel[0]!);

  const notes = c.notes.length > 0 && (
    <ul className="pp-notes" aria-label="Notes">
      {c.notes.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ul>
  );

  const adjustPanel = (
    <AdjustPanel adjust={c.adjust.adjust ?? {}} preset={c.adjust.preset} presetAmount={c.adjust.presetAmount} source={c.pic.base} onChange={c.adjustChange} onAuto={c.autoAdjust} onReset={c.resetColour} onCompare={c.setCompare} />
  );

  const content = (() => {
    switch (shown) {
      case 'add':
        return (
          <AddSheet
            onPickFiles={(f) => void c.addImageFiles(f)}
            onAddText={c.addText}
            onAddShape={c.addShape}
            onAddSticker={c.addSticker}
            onPickFrame={imageSelected ? (frame) => c.objectChange({ frame }, 'commit') : undefined}
            done={done}
          />
        );
      case 'adjust':
        return (
          <>
            {c.hasBackground && (
              <section className="inspector is-idle" aria-label="Background">
                <p className="pp-note">The background has been replaced. The original picture is kept.</p>
                <button type="button" className="pp-chip" onClick={c.restoreBackground}>
                  Restore the background
                </button>
              </section>
            )}
            {adjustPanel}
          </>
        );
      case 'imgadjust':
        return objectSheet(['fx']);
      case 'text':
        return (
          <TextSheet
            note={c.readingNote}
            canSelectAll={c.live.length > 0 && c.liveOn}
            onSelectAll={c.selectAll}
            lang={c.lang}
            onLang={c.changeLang}
            script={c.script}
            onScript={c.setScript}
            onAddText={c.addText}
            hint={
              c.geometryHint && (
                <p className="pp-note" data-testid="geometry-hint">
                  The picture is cropped or turned, so its words cannot be selected.{' '}
                  <button type="button" className="pp-chip" onClick={c.resetGeometry}>
                    Reset crop and rotation
                  </button>
                </p>
              )
            }
            error={
              c.readError && (
                <p className="pp-note is-error" role="alert">
                  The text in the picture could not be read: {c.readError}{' '}
                  <button type="button" className="pp-chip" onClick={c.retryRead}>
                    Try again
                  </button>
                </p>
              )
            }
            done={done}
          />
        );
      case 'layers':
        return (
          <>
            {notes}
            <LayersSheet layers={c.layers} selected={c.sel} onSelect={(id) => c.pickLayers([id])} onChange={(next) => c.edit((d) => ({ ...d, layers: next }))} onDelete={deleteLayer} />
          </>
        );
      case 'font':
        return layer && <Inspector layer={layer} frame={c.page} only={['font', 'format', 'styles']} {...c.text} />;
      case 'size':
        return layer && <Inspector layer={layer} frame={c.page} only={['size', 'spacing']} {...c.text} />;
      case 'colour':
        if (layer) return <ColourSheet value={layer.style.color} onPick={(color) => c.text.onStyle({ color })} />;
        return objectSheet(['shape']);
      case 'effects':
        if (layer)
          return (
            <>
              <Inspector layer={layer} frame={c.page} only={['effects']} {...c.text} />
              <TextEffectsPanel style={layer.style} onChange={c.text.onEffects} />
            </>
          );
        return objectSheet(['look', 'border', 'shadow']);
      case 'frame':
        return objectSheet(['frame']);
      case 'position':
        return (
          <PositionSheet
            rotation={c.selLayers[0] ? ((c.selLayers[0] as { rotation?: number }).rotation ?? 0) : 0}
            canMove={movable(c.layers, c.sel).length > 0 && !c.isVirtual}
            onAlign={c.align}
            onOrder={c.orderSel}
            onNudge={c.nudge}
            onRotate={(deg, m) => c.patchSel({ rotation: deg }, m)}
          />
        );
      case 'more': {
        const text = c.textActive.length > 0;
        const real = c.sel.length > 0 && !c.isVirtual;
        const list = [
          text && { id: 'translate', label: 'Translate to Interslavic', icon: ic('translate'), onClick: () => void c.translate(), disabled: c.busy },
          text && { id: 'edit', label: 'Edit the text', icon: ic('edit'), onClick: c.startTyping },
          real && { id: 'duplicate', label: 'Duplicate', icon: ic('copy'), onClick: c.duplicateSel },
          real && { id: 'copy', label: 'Copy', icon: ic('clipboard'), onClick: c.copyLayers },
          text && { id: 'copytext', label: 'Copy the text', icon: ic('copy'), onClick: () => void c.copyText() },
          !!c.restoreOriginal && { id: 'restore', label: 'Restore original', icon: ic('undo'), onClick: c.restoreOriginal },
          { id: 'all', label: 'Select all', icon: pi(ICONS.layers), onClick: c.selectAll },
          (c.sel.length > 0 || !!c.picked) && { id: 'deselect', label: 'Deselect', icon: ic('close'), onClick: c.clear },
          real && { id: 'delete', label: 'Delete', icon: ic('trash'), onClick: c.removeSel, danger: true },
        ].filter(Boolean) as Parameters<typeof MoreSheet>[0]['items'];
        return <MoreSheet items={list} done={done} />;
      }
      case 'pages':
        return <PagesSheet pages={c.shell.pages} currentId={c.shell.currentId} onShow={c.shell.onShow} onAddFiles={c.shell.onAddFiles} onDuplicate={c.shell.onDuplicate} onRemove={c.shell.onRemove} onMove={c.shell.onMove} />;
      case 'export':
        return c.shell.exportNode;
      case 'cutout':
        return c.cutting ? (
          <Suspense fallback={<p className="pp-note">Loading…</p>}>
            <CutoutDialog inline source={c.file} onKeep={c.keepCutout} onReplace={c.replaceBackground} onClose={c.cancelCutout} />
          </Suspense>
        ) : null;
      case 'crop':
        return <div ref={setHost} className="pp-crop-host" />;
    }
  })();

  const detents: Detent[] = shown === 'export' || shown === 'cutout' ? ['full'] : shown === 'crop' ? ['half'] : ['half', 'full'];
  const header =
    shown === 'crop' ? (
      <div className="pp-head-actions">
        <button type="button" className="pp-chip" onClick={() => c.setCrop(null)}>
          Cancel
        </button>
        <button type="button" className="pp-chip is-primary" onClick={c.applyCrop}>
          Apply
        </button>
      </div>
    ) : (
      <button type="button" className="pp-chip is-primary" onClick={closeSheet}>
        Done
      </button>
    );

  const message = c.error ?? c.shell.problem ?? c.status ?? c.shell.note;
  const isError = !!(c.error ?? c.shell.problem);
  const pageIndex = Math.max(0, c.shell.pages.findIndex((p) => p.id === c.shell.currentId));
  const typingKb = c.typing && kb > 0;
  // The shell is already pinned to the visible part of the screen while a keyboard is up (viewportLock: height = --vvh), so only the
  // keyboard bar's own height is reserved here; adding the keyboard's height again squeezed the stage to nothing (the picture vanished).
  const rootStyle: CSSProperties = typingKb ? { paddingBottom: typingPadding(c.typing, kb) } : {};
  const sheetOpen = derived !== null;

  return (
    <div className={`pp${c.typing ? ' is-typing' : ''}`} ref={setRoot} style={rootStyle} inert={c.exporting}>
      <header className="pp-bar">
        <Link href="/studio" className="pp-icon-btn" aria-label="Back to Studio">
          <Icon name="arrowLeft" size="1.4rem" />
        </Link>
        <button type="button" className="pp-icon-btn" aria-label="Undo" disabled={!c.canUndo || !!c.crop} onClick={c.undo}>
          <Icon name="undo" size="1.4rem" />
        </button>
        <button type="button" className="pp-icon-btn" aria-label="Redo" disabled={!c.canRedo || !!c.crop} onClick={c.redo}>
          <Icon name="redo" size="1.4rem" />
        </button>
        <button type="button" className="pp-page-indicator" aria-label={`Pages: ${pageIndex + 1} of ${c.shell.pages.length}`} onClick={() => toggle('pages')}>
          {pageIndex + 1} / {c.shell.pages.length}
        </button>
        <button type="button" className="pp-download" disabled={!!c.crop || c.exporting} onClick={c.onExport}>
          Download
        </button>
      </header>

      <div className="pp-stage" ref={stageEl}>
        <div className="pp-surface" ref={surface} data-testid="photo-surface" role="img" aria-label="The picture. Tap a layer to select it, drag to move it, pinch to resize and turn it, pinch the empty picture to zoom, double-tap text to edit it." />
        <div className="pp-wrap" ref={c.wrap} style={{ width: at.width, height: at.height, transform: `translate3d(${at.left}px, ${at.top}px, 0)` }}>
          <PhotoCanvas
            ref={c.scene}
            doc={c.shownDoc}
            base={c.drawBase}
            images={c.images}
            imagesVersion={c.picsVersion}
            size={c.shownSize}
            selectedIds={c.crop ? [] : c.outlined}
            interactive={false}
            boxMode={false}
            presets={presetsFor}
            guides={c.guides}
            onPick={() => {}}
            onPickMany={() => {}}
            onDragLayers={() => {}}
            onDragEnd={() => {}}
            onDragCancel={() => {}}
            onGuides={() => {}}
            onActivate={() => {}}
            label="The picture"
          />
          {c.liveOn && !c.typing && (
            <div className="pp-bands" aria-hidden="true">
              {c.bands.map((b, i) => (
                <div key={i} className="live-band" style={{ left: b.x0 * at.k, top: b.y0 * at.k, width: (b.x1 - b.x0) * at.k, height: (b.y1 - b.y0) * at.k }} />
              ))}
            </div>
          )}
          <SelectionOverlay
            scene={c.scene as React.RefObject<SceneHandle | null>}
            wrap={c.wrap}
            active={c.textActive}
            watch={[c.virtual, c.sel, c.layers, c.pic, c.shownSize.w, c.shownSize.h, c.crop, at.width, at.height, at.left, at.top, c.typing]}
            typing={c.typing}
            onType={c.text.onType}
            onStopTyping={stopTyping}
            minFontPx={16}
            onView={c.setView}
            toolbar={null}
          />
          {c.boxed && c.view && !c.crop && <TransformBox box={boxOfMedia(c.boxed)} view={c.view} frame={c.page} label={isImage(c.boxed) ? 'Selected picture' : 'Selected shape'} onChange={c.transform} />}
          {c.crop && c.view && <CropTool src={{ w: c.pic.w, h: c.pic.h }} geometry={c.crop} view={c.view} onChange={(g) => c.setCrop(g)} onApply={c.applyCrop} onCancel={() => c.setCrop(null)} controlsHost={host} />}
        </div>

        {c.reading !== null && (
          <p className="pp-pill" role="status">
            {c.readingNote}
          </p>
        )}

        {barShown && anchor && (
          <FloatingBar anchor={anchor} bounds={{ width: stage.w, height: stage.h }} label={c.isVirtual ? 'Selected text' : 'Selection'}>
            {c.isVirtual ? (
              <>
                <button type="button" className="is-main" disabled={c.busy} onClick={() => void c.translate()}>
                  <Icon name="translate" size="1.2rem" /> Translate
                </button>
                <button type="button" onClick={c.startTyping}>
                  <Icon name="edit" size="1.2rem" /> Edit
                </button>
                <button type="button" aria-label="Copy the text" onClick={() => void c.copyText()}>
                  <Icon name="copy" size="1.2rem" />
                </button>
              </>
            ) : (
              <>
                <button type="button" aria-label="Duplicate" onClick={c.duplicateSel}>
                  <Icon name="copy" size="1.2rem" />
                </button>
                <button type="button" aria-label="Delete" onClick={c.removeSel}>
                  <Icon name="trash" size="1.2rem" />
                </button>
                <button type="button" aria-label="More" onClick={() => setSheet('more')}>
                  <PathIcon d={ICONS.more} size="1.2rem" />
                </button>
              </>
            )}
          </FloatingBar>
        )}

        {message && (
          <p className={isError ? 'pp-toast is-error' : 'pp-toast'} role={isError ? 'alert' : 'status'}>
            <span>{message}</span>
            <button type="button" className="pp-icon-btn" aria-label="Dismiss" onClick={c.dismissMessages}>
              <Icon name="close" size="1rem" />
            </button>
          </p>
        )}
      </div>

      {!sheetOpen && !typingKb && (
        <>
          <button type="button" className="pp-pages" aria-label={`Pages (${c.shell.pages.length})`} onClick={() => toggle('pages')}>
            <span className="pp-pages-row">
              {c.shell.pages.map((p) => (
                <span key={p.id} className={p.id === c.shell.currentId ? 'pp-thumb is-current' : 'pp-thumb'}>
                  {p.thumb ? <img src={p.thumb} alt="" /> : <span className="pp-page-blank" aria-hidden="true" />}
                </span>
              ))}
            </span>
          </button>
          <ToolStrip items={items} selected={null} onSelect={onStrip} mode={mode} label="Photo tools" />
        </>
      )}

      {c.typing && (
        <KeyboardBar>
          {(['font', 'size', 'colour'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className="pp-kb-btn"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                c.setTyping(false);
                setSheet(id);
              }}
            >
              {id === 'font' ? 'Font' : id === 'size' ? 'Size' : 'Colour'}
            </button>
          ))}
          <span className="pp-kb-gap" />
          <button type="button" className="pp-kb-btn is-primary" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={stopTyping}>
            Done
          </button>
        </KeyboardBar>
      )}

      {root && (
        <BottomSheet open={sheetOpen} onClose={closeSheet} title={TITLES[shown]} detents={detents} headerAction={header} heightTarget={root}>
          <div className="pp-sheet-content" data-sheet={shown}>
            {content}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
