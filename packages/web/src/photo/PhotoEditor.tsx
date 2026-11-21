import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { track } from '../analytics.ts';
import { DropZone, matchesAccept } from '../components/DropZone.tsx';
import { Icon } from '../components/Icon.tsx';
import { Tip } from '../components/Tip.tsx';
import { useToolActive } from '../studio/active.tsx';
import { useLibrary, usePhotoLibraryOpen, useReportPhotoTarget, type LibraryItem } from '../studio/library.tsx';
import { downloadBlob } from '../download.ts';
import { Inspector } from '../editor/Inspector.tsx';
import { TextEffectsPanel } from '../editor/TextEffectsPanel.tsx';
import { SelectionOverlay, type View } from '../editor/SelectionOverlay.tsx';
import { TransformBox } from '../editor/TransformBox.tsx';
import { boxOfMedia, patchOfBox } from '../editor/transform-math.ts';
import type { SceneHandle } from '../editor/LayerCanvas.tsx';
import * as H from '../editor/history.ts';
import { boundsOf, newId, newLayer, type StepKind, type TextLayer } from '../editor/layers.ts';
import { inkColor, inkFraction, ringColor, withRegion } from '../editor/sample.ts';
import { applyPreset, DEFAULT_STYLE, layoutText } from '../editor/text-style.ts';
import type { LayerBox } from '../video/contracts.ts';
import { translateTexts, type Script } from '../subtitles/translate.ts';
import { AddPanel, onlyImages } from './AddPanel.tsx';
import { AdjustPanel, type AdjustPatch } from './AdjustPanel.tsx';
import { CropTool } from './CropTool.tsx';
import { decodePicture, downscaleSize, PictureError, sourceSizeOf } from './decode.ts';
import { docEdited, emptyDoc, isImage, isText, outputSize, type PageDoc, type PhotoLayer } from './doc.ts';
import { exportPage, exportPdf, exportZip, fileNameFor, type ExportRequest, type ExportResult } from './export.ts';
import { ExportDialog, type ExportPageInfo } from './ExportDialog.tsx';
import { autoEnhance } from './auto-enhance.ts';
import { canvasProber, matchFont } from './font-match.ts';
import { retargetLayers } from './geometry.ts';
import { snapMove, snapResize, type Guide } from './guides.ts';
import { boxOfLayer, hitPage, isHidden as hiddenIn } from './hit.ts';
import { addImage, addShape, addSticker, alignToPage, copyPayload, duplicate, estimateText, parsePayload, patchLayers, paste, remove, reorder, type AlignKind, type Measure } from './layer-ops.ts';
import { LayersPanel } from './LayersPanel.tsx';
import type { PhoneCtx, PhoneShell } from '../phone/photo/types.ts';
import { caretAt, glyphsFrom, isCovered, layersFromRuns, lineAround, nearestGlyph, runsIn, stretch, unionBox, wordAround, type Glyph } from './live-text.ts';
import { ObjectInspector, type ObjectLayer } from './ObjectInspector.tsx';
import { tesseractRecognizer, type OcrLang, type Recognizer } from './ocr.ts';
import { applyAdjustPatch, geometryOf, inferHandle, isIdentityGeometry, mapText, movable, patchObjects, presetsFor, selectable, srcsOf, withGeometry, withoutColour, withoutCrop } from './page-ops.ts';
import { PhotoCanvas, type PhotoCanvasHandle } from './PhotoCanvas.tsx';
import { PathIcon } from './path-icon.tsx';
import { createRenderCache, disposeRenderCache, pageSize, renderPage, type PictureSource } from './render.ts';
import type { CutoutOutput } from './CutoutDialog.tsx';
import { samplePicture } from './sample-picture.ts';
import { thumbnailOf } from './thumb.ts';
import { askToKeep, defaultStore, type PageRecord, type PhotoStore, type SavedPage } from './store.ts';
import './photo-editor.css';
import './mobile-photo.css';

/** The background-removal dialog (and the model code behind it) is fetched only when it is first opened. */
const CutoutDialog = lazy(() => import('./CutoutDialog.tsx'));

/** The phone's page view (phone/photo): the same page state, drawn and driven by touch. Fetched only on a phone. */
const PhonePageView = lazy(() => import('../phone/photo/PhonePageView.tsx'));

/** The longest side of the working picture: larger photos are scaled down so editing stays quick. */
const MAX_SIDE = 2400;

const LANGS: { value: OcrLang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
  { value: 'uk', label: 'Ukrainian' },
];

/**
 * A picture at working size, held as one canvas. The photo as the camera made it
 * (up to 48 MB decoded) is drawn into this once and let go, so a page costs the
 * working size and no more - and none of that once the page is not on screen.
 */
interface Picture {
  base: HTMLCanvasElement;
  w: number;
  h: number;
  name: string;
  scaled: boolean;
}

const loadPicture = (file: File): Promise<Picture> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(el.naturalWidth, el.naturalHeight));
      const w = Math.round(el.naturalWidth * k);
      const h = Math.round(el.naturalHeight * k);
      const base = document.createElement('canvas');
      base.width = w;
      base.height = h;
      // Colours are read back from it in small pieces, which is what this hint is for.
      base.getContext('2d', { willReadFrequently: true })!.drawImage(el, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ base, w, h, name: file.name, scaled: k < 1 });
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be opened as a picture.'));
    };
    el.src = url;
  });

/** Gives the picture's memory back: a canvas keeps its pixels until it is made empty. */
const releasePicture = (p: Picture): void => {
  p.base.width = 0;
  p.base.height = 0;
};

/** Gives back what a decoded layer picture holds: an ImageBitmap is closed, a canvas made empty (MDN: ImageBitmap.close). */
function releaseSource(s: unknown): void {
  const x = s as { close?: () => void; getContext?: unknown; width?: number; height?: number };
  if (typeof x.close === 'function') x.close();
  else if (typeof x.getContext === 'function') {
    x.width = 0;
    x.height = 0;
  }
}

const toBlob = (c: HTMLCanvasElement, type = 'image/png'): Promise<Blob> =>
  new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be saved.'))), type));

/** What a page tells the strip of pages about itself: a small picture of it as it now is, and whether it has edits that are not saved. */
interface PageInfo {
  thumb?: string;
  /** Whether the page has any change in it (text, pictures, shapes, crop or colour). */
  edited: boolean;
  /** The page's size in pixels after its crop and turn: what an export is made at (scale 1). */
  size?: { w: number; h: number };
  /** What would bring the page back after a reload. */
  snapshot: Pick<PageRecord, 'lang' | 'script' | 'hist' | 'glyphs' | 'read' | 'layerFiles'>;
}

/** What a page is given when it is brought back from the saved copy. */
type Restored = Pick<SavedPage, 'lang' | 'script' | 'hist' | 'glyphs' | 'read'>;

/** What the parent asks a page to do. */
interface PageHandle {
  /** The page as a finished file (or, for a PDF, a JPG to put in one), made from the page as it is now - on screen or not. */
  exportPage(req: ExportRequest): Promise<ExportResult>;
  /** A picture to put on the page as a layer (Uploads: "Add to this picture"). */
  addImageFile(file: File): Promise<void>;
}

type Tool = 'select' | 'add' | 'adjust' | 'layers';

/** Pictures put on pages in this tab, kept for a copy and paste between pages: the layers and the files their pictures come from. */
let copied: { layers: PhotoLayer[]; files: Map<string, File> } | null = null;

/** A tool-strip button: icon only, its name in a tooltip that opens to the right (the strip is a left sidebar). */
function StripButton(props: { label: string; pressed?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tip label={props.label} side="right">
      <button type="button" className="strip-button" aria-label={props.label} aria-pressed={props.pressed} disabled={props.disabled} onClick={props.onClick}>
        {props.children}
      </button>
    </Tip>
  );
}

/** Zoom steps for the picture, and how far one tap of a nudge button moves a layer (picture pixels). */
const ZOOMS = [1, 1.5, 2, 3, 4];
const NUDGE = 5;

const ICON_SELECT = 'M5 3l14 8-6 2-3 6z';
const ICON_BOX = 'M4 4h3M10.5 4h3M17 4h3M4 20h3M10.5 20h3M17 20h3M4 10.5v3M20 10.5v3';
const ICON_CROP = 'M7 3v14h14M3 7h14v14';
const ICON_ADJUST = 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4';
const ICON_FX = 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z';
const ICON_LAYERS = 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5';
/** A head and shoulders with the page behind it taken away. */
const ICON_CUTOUT = 'M12 4a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4';

/**
 * One page of the photo editor: a picture, its text and objects, its own undo history. The text is found as soon as the picture
 * opens and left exactly as it is; drag across any of it, from where you choose to where you choose, to select it. Translate,
 * retype or restyle only what was selected, and save the result. Pictures, shapes and stickers can be put on the page, and the
 * picture itself can be cropped, turned and colour-adjusted. Everything happens on the user's device.
 *
 * The page is one value (`PageDoc`, doc.ts) in an undo history; the canvas, the thumbnail and the export all draw it with
 * `renderPage`, so what is shown is what is saved. Layer positions are in OUTPUT pixels (after the crop and turn).
 *
 * Live Text and geometry: the letters found in the picture (and the OCR that found them) belong to the ORIGINAL pixels. While the
 * picture is cropped, turned, flipped or straightened they would sit in the wrong place, so the Live Text overlay is switched
 * off and the page says so ("Reset the crop to select text in the picture", with a button that does it). Text that was already
 * made into a layer is a layer like any other and follows the geometry (`retargetLayers`). This is the simplest behaviour that is
 * always right; mapping the letters through the geometry would not be, for a straighten (a letter box stays upright).
 */
const PagePane = forwardRef<
  PageHandle,
  {
    file: File;
    recognizer: Recognizer;
    restored?: Restored;
    warnOnLeave: boolean;
    /** Only the page on screen holds its picture; the others keep their text and history and nothing else. */
    onScreen: boolean;
    onInfo: (info: PageInfo) => void;
    pageId: string;
    /** The files of the pictures on this page, by the id a picture layer names (shared with the parent, which keeps them for a reload). */
    objects: Map<string, File>;
    store: PhotoStore | null;
    keep: (job: () => Promise<void>) => void;
    /** A dialog is open: keys and the pointer belong to it. */
    dialogOpen: boolean;
    /** An export is being made: the editing surface is inert. */
    exporting: boolean;
    onExport: () => void;
    /** Given on a phone: the page is drawn by the phone view (phone/photo/PhonePageView.tsx) instead of the desktop layout. */
    phone?: PhoneShell;
  }
>(function PagePane({ file, recognizer, restored, warnOnLeave, onScreen, onInfo, pageId, objects, store, keep, dialogOpen, exporting, onExport, phone }, handle) {
  const [pic, setPic] = useState<Picture | null>(null);
  const [hist, setHist] = useState<H.History<PageDoc>>(() => restored?.hist ?? H.start(emptyDoc()));
  /** The picture's letters, found as soon as it opens. They stay part of the picture until some are picked and changed. */
  const [glyphs, setGlyphs] = useState<Glyph[]>(() => restored?.glyphs ?? []);
  /** What the user has dragged over: the gap it starts at and the gap it ends at, between the letters not yet replaced. Null when nothing is picked. */
  const [picked, setPicked] = useState<[number, number] | null>(null);
  /** Layers that are selected: text made from words earlier or added by hand, pictures, shapes. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lang, setLang] = useState<OcrLang>(() => restored?.lang ?? 'en');
  const [script, setScript] = useState<Script>(() => restored?.script ?? 'standard');
  /** How far reading the picture has got (0 to 1), or null when it is not being read. */
  const [reading, setReading] = useState<number | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  /** The crop tool is open: the geometry being worked on (nothing is changed on the page until Apply). */
  const [crop, setCrop] = useState<ReturnType<typeof geometryOf> | null>(null);
  /** The Compare button is held: the page is drawn without its colour edits. */
  const [compare, setCompare] = useState(false);
  /** 'Select layers' mode: a drag on empty space makes a marquee and the picture's text is not selectable. */
  const [boxMode, setBoxMode] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [dropping, setDropping] = useState(false);
  const [picsVersion, setPicsVersion] = useState(0);
  /** The background-removal dialog is open. */
  const [cutting, setCutting] = useState(false);
  /** The decoded picture that stands in for the original (`base.background`), by the file id it came from; only while the page is on screen. */
  const [bg, setBg] = useState<{ id: string; src: unknown } | null>(null);
  const bgRef = useRef<{ id: string; src: unknown } | null>(null);
  const [bgFailed, setBgFailed] = useState<string | null>(null);
  const [failedPics, setFailedPics] = useState<Record<string, string>>({});
  const scene = useRef<PhotoCanvasHandle>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLElement>(null);
  const picRef = useRef<Picture | null>(null);
  const activeRef = useRef(onScreen);
  activeRef.current = onScreen;
  /** Whether the picture's text is known, so a page coming back on screen does not read it again. */
  const [readOk, setReadOk] = useState(() => !!restored?.read);
  const readDone = useRef(!!restored?.read);
  readDone.current = readOk;
  const loading = useRef(false);
  const reads = useRef(0);
  /** The document as it was when a drag or a slider began, so the whole drag is one undo step. */
  const dragBase = useRef<PageDoc | null>(null);
  const lastCommit = useRef<{ key: string; at: number } | null>(null);
  const picking = useRef<number | null>(null);
  /** What kind of pointer last pressed the picture's text: a finger selects a word by tapping instead of by dragging. */
  const lastPointer = useRef<string>('mouse');
  const [zoom, setZoom] = useState(1);
  const altDown = useRef(false);
  /** The decoded pictures of the picture layers on the page on screen, by file id. */
  const pics = useRef(new Map<string, unknown>());
  const loadingPics = useRef(new Set<string>());
  const images = useMemo(() => ({ pictureOf: (id: string) => (pics.current.get(id) as CanvasImageSource | undefined) ?? null }), []);
  const prober = useMemo(() => canvasProber(), []);
  const measureCtx = useMemo(() => (typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')), []); // no page to draw on when the site is pre-rendered
  const active = useToolActive();

  const doc = hist.present;
  const layers = doc.layers;
  const histRef = useRef(hist);
  histRef.current = hist;
  const cropping = crop !== null;

  // ---- changing the document ----

  /**
   * One change to the document. 'preview' (a drag or slider on its way) replaces the present and remembers where it began;
   * 'end' makes ONE undo step from there (none if nothing changed); 'commit' is a finished change on its own.
   */
  const edit = (apply: (d: PageDoc) => PageDoc, mode: 'commit' | 'preview' | 'end' = 'commit') => {
    lastCommit.current = null;
    if (mode === 'preview') {
      dragBase.current ??= histRef.current.present;
      setHist((h) => H.replace(h, apply(h.present)));
      return;
    }
    const base = dragBase.current;
    dragBase.current = null;
    setHist((h) => {
      const next = apply(h.present);
      if (base) return H.commitFrom(H.replace(h, next), base);
      return H.sameValue(next, h.present) ? h : H.push(h, next);
    });
  };
  /** A drag that is cancelled puts the document back and makes no step. */
  const cancelEdit = () => {
    const base = dragBase.current;
    dragBase.current = null;
    if (base) setHist((h) => H.replace(h, base));
  };
  /** Like a commit, but a run of changes to the same thing within a moment (typing, a number being typed) is ONE undo step. */
  const editMerge = (key: string, apply: (d: PageDoc) => PageDoc) => {
    const now = Date.now();
    const same = lastCommit.current?.key === key && now - lastCommit.current.at < 600;
    lastCommit.current = { key, at: now };
    setHist((h) => {
      const next = apply(h.present);
      if (H.sameValue(next, h.present)) return h;
      return same ? H.replace(h, next) : H.push(h, next);
    });
  };
  const commit = (next: PhotoLayer[]) => edit((d) => ({ ...d, layers: next }));
  const undo = () => {
    lastCommit.current = null;
    setHist(H.undo);
    setPicked(null);
  };
  const redo = () => {
    lastCommit.current = null;
    setHist(H.redo);
    setPicked(null);
  };

  // Letters a text layer already sits over are the layer's business now, not the picture's (unless it is hidden: then it covers nothing).
  const live = useMemo<Glyph[]>(() => {
    const covers = layers.flatMap((l) => (isText(l) && l.erase && !hiddenIn(l) ? [{ x: l.erase.x, y: l.erase.y, w: l.erase.w, h: l.erase.h }] : []));
    return glyphs.filter((g) => !isCovered(g, covers)).map((g, index) => ({ ...g, index }));
  }, [glyphs, layers]);

  /** Where each line of text sits, for the areas that take the pointer and the bands that show what is picked. */
  const lineAreas = useMemo(() => {
    const by = new Map<number, Glyph[]>();
    for (const g of live) by.set(g.line, [...(by.get(g.line) ?? []), g]);
    return [...by.entries()].map(([line, gs]) => ({ line, box: unionBox(gs) }));
  }, [live]);

  /** What is picked, as one stretch for each line it touches. */
  const bands = useMemo(
    () =>
      picked
        ? runsIn(live, picked).map((run) => {
            const b = unionBox(run);
            const row = lineAreas.find((a) => a.line === run[0]!.line)!.box;
            return { x0: b.x0, x1: b.x1, y0: row.y0, y1: row.y1 };
          })
        : [],
    [picked, live, lineAreas],
  );

  /** What turning chosen words into text would make: shown in the panel, and made for real the first time something is changed. */
  const virtual = useMemo<TextLayer[]>(() => {
    if (!picked || !pic) return [];
    return layersFromRuns(runsIn(live, picked), {
      ringColorOf: (r) => withRegion(pic.base, r, 8, (img, at) => ringColor(img, at)) ?? 'rgb(128, 128, 128)',
      inkOf: (r, bg) => withRegion(pic.base, r, 0, (img, at) => inkColor(img, at, bg)),
      widthAt: (text, size) => (measureCtx ? layoutText(measureCtx, text, { ...DEFAULT_STYLE, size, bold: false }, 0).width : 0),
      // Which font, weight and size the words are set in, so what replaces them looks like them.
      matchStyle: ({ text, box, background }) => {
        const rect = { x: box.x0, y: box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0 };
        const ink = withRegion(pic.base, rect, 0, (img, at) => inkFraction(img, at, background));
        return matchFont({ text, width: rect.w, height: rect.h, ink: ink ?? null }, prober);
      },
    });
  }, [picked, live, pic, measureCtx, prober]);

  const isVirtual = virtual.length > 0;
  const layerIds = useMemo(() => new Set(layers.map((l) => l.id)), [layers]);
  const sel = useMemo(() => selectedIds.filter((id) => layerIds.has(id)), [selectedIds, layerIds]);
  const selLayers = layers.filter((l) => sel.includes(l.id));
  const objectSel = selLayers.filter((l): l is ObjectLayer => !isText(l));
  const textSel = selLayers.filter(isText);
  const textActive: TextLayer[] = isVirtual ? virtual : textSel;
  const layer = textActive[0] ?? null;
  const activeIds = textActive.map((l) => l.id);

  /** Change the selected text. Chosen words become layers the first time, as one undo step with the change. `merge` joins quick runs of the same change into one step. */
  const mutate = (fn: (all: PhotoLayer[], ids: string[]) => PhotoLayer[], snap = { virtual, ids: activeIds }, merge?: string) => {
    const now = Date.now();
    const same = !!merge && lastCommit.current?.key === merge && now - lastCommit.current.at < 600;
    lastCommit.current = merge ? { key: merge, at: now } : null;
    setHist((h) => {
      const next = { ...h.present, layers: fn([...h.present.layers, ...snap.virtual.filter((v) => !h.present.layers.some((l) => l.id === v.id))], snap.ids) };
      return same ? H.replace(h, next) : H.push(h, next);
    });
    if (snap.virtual.length > 0) {
      setSelectedIds(snap.ids);
      setPicked(null);
    }
  };
  const patchText = (all: PhotoLayer[], ids: string[], patch: Partial<TextLayer>) => mapText(all, ids, (l) => ({ ...l, ...patch }));

  /** The page as the layers see it: the output picture's size. */
  const page = useMemo(() => (pic ? (pageSize(doc, { width: pic.w, height: pic.h }) ?? { w: pic.w, h: pic.h }) : { w: 1000, h: 1000 }), [doc.base, pic]); // eslint-disable-line react-hooks/exhaustive-deps

  /** What is drawn: the crop tool shows the whole picture (turned, no crop, no layers); Compare shows it without its colour edits. */
  const shownDoc = useMemo<PageDoc>(() => {
    if (crop) return { ...doc, base: withGeometry(doc.base, withoutCrop(crop)), layers: [] };
    if (compare) return { ...doc, base: withoutColour(doc.base) };
    return doc;
  }, [doc, crop, compare]);
  const shownSize = useMemo(() => (pic ? (pageSize(shownDoc, { width: pic.w, height: pic.h }) ?? { w: pic.w, h: pic.h }) : { w: 1000, h: 1000 }), [shownDoc, pic]);

  /** Measures text with the page's own canvas, for layer-ops and snapping. */
  const measure = useCallback<Measure>(
    (l) => {
      if (!measureCtx) return estimateText(l);
      const b = boundsOf(measureCtx, l);
      return { w: b.w, h: b.h };
    },
    [measureCtx],
  );

  // ---- the layer pictures: loaded only for the page on screen, and let go with it ----

  const lost = srcsOf(layers).filter((id) => !objects.has(id));
  useEffect(() => {
    if (!pic) return;
    const needed = new Set(srcsOf(layers));
    for (const [id, src] of pics.current) {
      if (!needed.has(id)) {
        releaseSource(src);
        pics.current.delete(id);
      }
    }
    for (const id of needed) {
      const f = objects.get(id);
      if (!f || pics.current.has(id) || loadingPics.current.has(id) || failedPics[id]) continue;
      loadingPics.current.add(id);
      decodePicture(f)
        .then((dec) => {
          loadingPics.current.delete(id);
          if (!activeRef.current || !srcsOf(histRef.current.present.layers).includes(id)) {
            releaseSource(dec.source); // the page went off screen, or the layer was removed, while it was decoding
            return;
          }
          pics.current.set(id, dec.source);
          setPicsVersion((v) => v + 1);
        })
        .catch((e) => {
          loadingPics.current.delete(id);
          setFailedPics((m) => ({ ...m, [id]: e instanceof PictureError ? e.message : 'It could not be read as a picture.' }));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pic, layers]);

  const releaseLayerPictures = () => {
    for (const src of pics.current.values()) releaseSource(src);
    pics.current.clear();
    setFailedPics({});
    if (bgRef.current) releaseSource(bgRef.current.src);
    bgRef.current = null;
    setBg(null);
    setBgFailed(null);
  };

  // The replaced background (a cut-out kept as a file next to the page): decoded while the page is on screen, let go with it.
  // A missing or unreadable file is said so in a note, and the original pixels are drawn instead.
  const bgId = doc.base.background;
  const bgLost = !!bgId && !objects.has(bgId);
  useEffect(() => {
    if (!pic || !bgId) {
      if (bgRef.current) {
        releaseSource(bgRef.current.src);
        bgRef.current = null;
        setBg(null);
      }
      setBgFailed(null);
      return;
    }
    if (bgRef.current?.id === bgId) return;
    const f = objects.get(bgId);
    if (!f) return;
    setBgFailed(null);
    decodePicture(f)
      .then((dec) => {
        if (!activeRef.current || histRef.current.present.base.background !== bgId) {
          releaseSource(dec.source); // the page went off screen, or the background was restored, while it was decoding
          return;
        }
        const old = bgRef.current;
        bgRef.current = { id: bgId, src: dec.source };
        setBg(bgRef.current);
        if (old) releaseSource(old.src);
      })
      .catch((e) => setBgFailed(e instanceof PictureError ? e.message : 'It could not be read as a picture.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pic, bgId]);
  /** What the page draws as its picture: the replaced background once it is ready, otherwise the original pixels. */
  const drawBase: PictureSource | null = pic ? ((bgId && bg?.id === bgId ? (bg.src as PictureSource) : null) ?? pic.base) : null;

  /** Reads the words in a picture. A newer read (another picture, another language) makes an older one's answer be ignored. */
  const detect = async (p: Picture, l: OcrLang) => {
    const mine = ++reads.current;
    setReading(0);
    setReadError(null);
    setGlyphs([]);
    setPicked(null);
    setReadOk(false);
    try {
      const result = await recognizer.recognize(await toBlob(p.base), l, (f) => {
        if (mine === reads.current) setReading(f);
      });
      if (mine !== reads.current) return;
      const found = glyphsFrom(result.lines);
      setGlyphs(found);
      setReadOk(true);
      setReading(null);
      track('photo-find-text', { lang: l, lines: new Set(found.map((g) => g.line)).size });
    } catch (e) {
      if (mine !== reads.current) return;
      setReading(null);
      setReadError(e instanceof Error ? e.message : String(e));
    }
  };

  const open = async () => {
    if (loading.current || picRef.current) return;
    loading.current = true;
    setError(null);
    try {
      const p = await loadPicture(file);
      if (!activeRef.current) {
        releasePicture(p); // the page went off screen while its picture was loading
        return;
      }
      picRef.current = p;
      setPic(p);
      if (!readDone.current) void detect(p, lang);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      loading.current = false;
    }
  };

  // Only the page on screen holds its picture. Going off screen gives the memory back; the text and the undo steps stay.
  useEffect(() => {
    if (onScreen) {
      void open();
    } else {
      if (picRef.current) {
        releasePicture(picRef.current);
        picRef.current = null;
        setPic(null);
        setView(null);
      }
      releaseLayerPictures();
      setCrop(null);
      setCompare(false);
      setGuides([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onScreen]);
  useEffect(
    () => () => {
      if (picRef.current) releasePicture(picRef.current);
      for (const src of pics.current.values()) releaseSource(src);
      pics.current.clear();
      if (bgRef.current) releaseSource(bgRef.current.src);
    },
    [],
  );

  // A page added behind another (several photos at once) is not decoded for its thumbnail until it is looked at: it gets a small one, made and let go at once.
  useEffect(() => {
    if (onScreen || restored || picRef.current) return;
    let live = true;
    void thumbnailOf(file).then((thumb) => live && thumb && onInfo({ thumb, edited: false, snapshot: { lang, script, hist, glyphs, read: false } }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeLang = (l: OcrLang) => {
    setLang(l);
    if (pic) void detect(pic, l);
  };

  const translate = async () => {
    const targets = textActive.filter((l) => l.text.trim() !== '');
    if (targets.length === 0 || !pic) return;
    const snap = { virtual, ids: activeIds };
    setBusy(true);
    setError(null);
    setStatus('Translating…');
    try {
      const out = await translateTexts(targets.map((l) => l.text), { lang, script });
      mutate((all, ids) => {
        let next = all;
        targets.forEach((l, i) => {
          if (!ids.includes(l.id)) return;
          const text = out[i]!.text;
          // Keep the size the words had; only if the translation runs off the picture is it made smaller to fit.
          let size = l.style.size;
          const width = measureCtx ? layoutText(measureCtx, text, { ...l.style, size }, 0).width : 0;
          const room = page.w - l.x - 8;
          if (width > room && room > 40) size = Math.max(10, Math.floor((size * room) / width));
          next = mapText(next, [l.id], (t) => ({ ...t, text, original: t.original ?? t.text, style: { ...t.style, size } }));
        });
        return next;
      }, snap);
      const doubtful = out.filter((r) => r.flagged).length;
      setStatus(`Translated ${targets.length} ${targets.length === 1 ? 'line' : 'lines'} into Interslavic.${doubtful ? ` ${doubtful} may be wrong - read ${doubtful === 1 ? 'it' : 'them'} before you save.` : ''}`);
      track('photo-translate', { lang, script, texts: targets.length });
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // ---- selection ----

  const pickLayers = (ids: string[]) => {
    setPicked(null);
    setTyping(false);
    setSelectedIds(ids);
    if (ids.length > 0) setTool((t) => (t === 'adjust' ? 'select' : t));
  };
  const toggleIn = (prev: string[], id: string) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const clear = () => {
    setPicked(null);
    setSelectedIds([]);
    setTyping(false);
  };

  // ---- adding things to the page ----

  const addText = () => {
    if (!pic) return;
    const size = Math.max(24, Math.round(page.h / 14));
    const l = newLayer({ x: page.w * 0.1, y: page.h * 0.4, maxWidth: page.w * 0.8, style: { ...applyPreset(DEFAULT_STYLE, 'subtitle'), size } });
    commit([...layers, l]);
    setPicked(null);
    setSelectedIds([l.id]);
    setTool('select');
  };

  /** Puts `next` (the layers with new ones at the end, as layer-ops makes them) on the page and selects what was added. */
  const commitAdded = (next: PhotoLayer[], before: PhotoLayer[] = layers) => {
    commit(next);
    setPicked(null);
    setTyping(false);
    setSelectedIds(next.slice(before.length).map((l) => l.id));
    setTool('select');
  };

  /** Decodes picture files and puts them on the page as layers (one undo step for all), keeping each file next to the page. */
  const addImageFiles = async (files: File[]) => {
    if (!picRef.current) return;
    setError(null);
    const made: { id: string; name: string; w: number; h: number }[] = [];
    const problems: string[] = [];
    for (const f of files) {
      try {
        const dec = await decodePicture(f);
        if (!activeRef.current) {
          releaseSource(dec.source);
          return;
        }
        const id = newId('f');
        objects.set(id, f);
        pics.current.set(id, dec.source);
        made.push({ id, name: f.name, w: dec.width, h: dec.height });
        if (store) keep(() => store.saveObjectFile(pageId, id, f));
      } catch (e) {
        problems.push(e instanceof PictureError ? e.message : `${f.name} could not be added.`);
      }
    }
    if (made.length > 0) {
      const before = histRef.current.present.layers;
      const pg = pageSize(histRef.current.present, { width: picRef.current!.w, height: picRef.current!.h }) ?? page;
      const next = made.reduce((ls, m) => addImage(ls, m.id, { w: m.w, h: m.h }, pg, { name: m.name }), before);
      setPicsVersion((v) => v + 1);
      commitAdded(next, before);
    }
    if (problems.length > 0) setError(problems.join(' '));
  };

  const copyLayers = () => {
    const ids = movable(layers, sel).length > 0 ? sel : [];
    if (ids.length === 0) return;
    const chosen = layers.filter((l) => ids.includes(l.id));
    const files = new Map<string, File>();
    for (const l of chosen) if (isImage(l)) {
      const f = objects.get(l.src);
      if (f) files.set(l.src, f);
    }
    copied = { layers: chosen, files };
    void navigator.clipboard?.writeText(copyPayload(layers, ids)).catch(() => {}); // the copy kept in this tab works without it
    setStatus(`Copied ${chosen.length} ${chosen.length === 1 ? 'layer' : 'layers'}.`);
  };

  /** Pasted layers: pictures whose file this page does not have yet are given the file kept at copy time; those with none are left out. */
  const pasteLayers = (pasted: PhotoLayer[]) => {
    const usable = pasted.filter((l) => {
      if (!isImage(l)) return true;
      if (objects.has(l.src)) return true;
      const f = copied?.files.get(l.src);
      if (!f) return false;
      objects.set(l.src, f);
      if (store) keep(() => store.saveObjectFile(pageId, l.src, f));
      return true;
    });
    if (usable.length === 0) {
      setError('Nothing could be pasted: the pictures in it are not on this page.');
      return;
    }
    commitAdded(paste(layers, usable), layers);
  };

  const duplicateSel = () => {
    if (sel.length === 0) return;
    commitAdded(duplicate(layers, sel), layers);
  };

  const removeSel = () => {
    if (sel.length === 0) return;
    commit(remove(layers, sel));
    clear();
  };

  /** What Cmd/Ctrl+A does, for a thumb: all the text found in the picture, or else all the layers. */
  const selectAll = () => {
    if (live.length > 0 && !(sel.length > 0 && !isVirtual) && liveOn) {
      setSelectedIds([]);
      setPicked([0, live.length]);
    } else if (selectable(layers).length > 0) {
      pickLayers(selectable(layers));
    }
  };
  /** What the arrow keys do, for a thumb: move the selected layers a few pixels. */
  const nudge = (dx: number, dy: number) => {
    const ids = movable(layers, sel);
    if (ids.length === 0 || isVirtual) return;
    editMerge(`nudge:${ids.join()}`, (d) => ({ ...d, layers: d.layers.map((l) => (ids.includes(l.id) ? { ...l, x: l.x + dx, y: l.y + dy } : l)) }));
  };

  const orderSel = (kind: StepKind) => {
    if (sel.length === 0) return;
    const next = reorder(layers, sel, kind);
    if (next.every((l, i) => l === layers[i])) return;
    commit(next);
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(textActive.map((l) => l.text).join('\n'));
      setStatus('Copied.');
    } catch {
      setStatus('The browser would not let the text be copied.');
    }
  };

  const startTyping = () => {
    if (isVirtual) mutate((all) => all);
    setTyping(true);
  };

  // ---- the picture itself: crop, turn, colour ----

  const startCrop = () => {
    clear();
    setTool('select');
    setCrop(geometryOf(doc.base));
  };
  const applyCrop = () => {
    if (!crop || !pic) return;
    const [moved, droppedErase] = retargetLayers(layers, { w: pic.w, h: pic.h }, geometryOf(doc.base), crop, measureCtx ?? undefined);
    edit((d) => ({ ...d, base: withGeometry(d.base, crop), layers: moved }));
    setCrop(null);
    clear();
    setStatus(eraseNote(droppedErase.length));
  };
  /** Back to the picture as it came: no crop, turn, flip or straighten. Layers stay on the same parts of the picture. */
  const resetGeometry = () => {
    if (!pic) return;
    const [moved, droppedErase] = retargetLayers(layers, { w: pic.w, h: pic.h }, geometryOf(doc.base), {}, measureCtx ?? undefined);
    edit((d) => ({ ...d, base: withGeometry(d.base, {}), layers: moved }));
    clear();
    setStatus(eraseNote(droppedErase.length));
  };

  const adjustChange = (patch: AdjustPatch, mode: 'preview' | 'end') => edit((d) => ({ ...d, base: applyAdjustPatch(d.base, patch) }), mode);
  const autoAdjust = () => {
    if (!pic) return;
    const k = Math.min(1, 256 / Math.max(pic.w, pic.h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(pic.w * k));
    c.height = Math.max(1, Math.round(pic.h * k));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(pic.base, 0, 0, c.width, c.height);
    const auto = autoEnhance(ctx.getImageData(0, 0, c.width, c.height));
    edit((d) => ({ ...d, base: { ...d.base, adjust: { ...d.base.adjust, brightness: auto.brightness ?? 0, contrast: auto.contrast ?? 0, saturation: auto.saturation ?? 0 } } }));
  };
  const resetColour = () => edit((d) => ({ ...d, base: withoutColour(d.base) }));

  // ---- removing the background (CutoutDialog) ----

  const startCutout = () => {
    if (!pic || cropping || exporting) return;
    // The cut-out is made from the whole picture and kept where the picture is. With a crop, turn or straighten that place is no
    // longer the same as the page's, so the person is asked to reset it first rather than have the cut-out land somewhere wrong.
    if (!isIdentityGeometry(doc.base)) {
      setStatus('Remove the background from the whole picture: reset the crop and rotation first (the button under the picture), then try again.');
      return;
    }
    setStatus(null);
    setError(null);
    setCutting(true);
  };

  /** Stores a cut-out PNG next to the page like any picture layer's file, and returns its id. */
  const storeCutout = (out: CutoutOutput, name: string): { id: string; file: File } => {
    const f = new File([out.png], name, { type: 'image/png' });
    const id = newId('f');
    objects.set(id, f);
    if (store) keep(() => store.saveObjectFile(pageId, id, f));
    return { id, file: f };
  };

  /** "Keep as picture layer": the trimmed subject goes above the original at the place it was cut from, selected; one undo step. */
  const keepCutout = async (out: CutoutOutput) => {
    setCutting(false);
    const p = picRef.current;
    if (!p) return;
    const now = histRef.current.present;
    if (!isIdentityGeometry(now.base)) {
      setError('The crop or rotation changed, so the cut-out could not be placed. Reset it and try again.');
      return;
    }
    const { id, file: f } = storeCutout(out, 'cutout.png');
    try {
      const dec = await decodePicture(f);
      if (!activeRef.current) {
        releaseSource(dec.source);
        return;
      }
      pics.current.set(id, dec.source);
    } catch (e) {
      objects.delete(id);
      if (store) keep(() => store.removeObjectFile(pageId, id));
      setError(e instanceof PictureError ? e.message : 'The cut-out could not be added.');
      return;
    }
    // The box is in the working picture the dialog made (at most 2400 px, like this one); with the page at identity geometry the
    // page is that picture, so only a rounding difference of a pixel between the two sizes is scaled away.
    const kx = p.w / out.picture.w;
    const ky = p.h / out.picture.h;
    const before = histRef.current.present.layers;
    const added = addImage(before, id, { w: out.width, h: out.height }, { w: p.w, h: p.h }, { name: 'Cutout' });
    const placed: PhotoLayer = { ...(added[added.length - 1] as PhotoLayer), x: out.box.x * kx, y: out.box.y * ky, w: out.box.w * kx, h: out.box.h * ky, cutoutOf: 'base' } as PhotoLayer;
    setPicsVersion((v) => v + 1);
    commitAdded([...before, placed], before);
    track('photo-cutout', { how: 'keep' });
  };

  /** "Replace the background": the whole-picture PNG is drawn instead of the original pixels (the file and the text found in it stay as they were). */
  const replaceBackground = (out: CutoutOutput) => {
    setCutting(false);
    const { id } = storeCutout(out, 'background.png');
    edit((d) => ({ ...d, base: { ...d.base, background: id } }));
    setPicsVersion((v) => v + 1);
    track('photo-cutout', { how: 'replace' });
  };
  const restoreBackground = () =>
    edit((d) => {
      const { background: _b, ...rest } = d.base;
      return { ...d, base: rest };
    });

  /** The note and button for a replaced background, shown with the colour controls. */
  const backgroundSection = bgId ? (
    <section className="inspector is-idle" aria-label="Background">
      <p className="note">The background has been replaced. The original picture is kept.</p>
      <button type="button" className="text-button" onClick={restoreBackground}>
        Restore the background
      </button>
    </section>
  ) : null;

  // ---- the page as a file ----

  /** The page as it now is as a file. A page that is not on screen has no picture in memory, so it is loaded for the moment and let go again. */
  const exportThis = async (req: ExportRequest): Promise<ExportResult> => {
    const d = histRef.current.present;
    const p = picRef.current ?? (await loadPicture(file));
    const temporary = p !== picRef.current;
    const held = new Map<string, CanvasImageSource>();
    const temps: unknown[] = [];
    const cache = createRenderCache(); // its own, so the export does not disturb the screen's
    try {
      for (const l of d.layers) {
        if (!isImage(l) || hiddenIn(l) || held.has(l.src)) continue;
        const have = pics.current.get(l.src);
        if (have) held.set(l.src, have as CanvasImageSource);
        else {
          const f = objects.get(l.src);
          if (!f) continue;
          try {
            const dec = await decodePicture(f);
            temps.push(dec.source);
            held.set(l.src, dec.source as CanvasImageSource);
          } catch {
            /* a picture that cannot be read is left out, as on screen */
          }
        }
      }
      // A replaced background is drawn in place of the original pixels, exactly as on screen (the original file is untouched).
      let base: PictureSource = p.base;
      if (d.base.background) {
        if (bgRef.current?.id === d.base.background) base = bgRef.current.src as PictureSource;
        else {
          const f = objects.get(d.base.background);
          if (f) {
            try {
              const dec = await decodePicture(f);
              temps.push(dec.source);
              base = dec.source as PictureSource;
            } catch {
              /* unreadable: the original pixels, as on screen */
            }
          }
        }
      }
      const out = outputSize(p.w, p.h, d.base);
      return await exportPage(
        (ctx, s) => renderPage(ctx, { doc: d, base, images: { pictureOf: (id) => held.get(id) ?? null }, size: { w: s.width, h: s.height }, presets: presetsFor, cache }),
        { format: req.format === 'pdf' ? 'jpeg' : req.format, quality: req.quality, scale: req.scale, transparent: req.transparent, name: `${p.name.replace(/\.[^.]+$/, '')}-edited`, width: out.w, height: out.h },
      );
    } finally {
      disposeRenderCache(cache);
      for (const t of temps) releaseSource(t);
      if (temporary) releasePicture(p);
    }
  };
  useImperativeHandle(handle, () => ({ exportPage: exportThis, addImageFile: (f) => addImageFiles([f]) }));

  // Tell the strip of pages how this page looks now, and what would bring it back, a moment after the last change.
  const read = reading === null && readError === null && readOk;
  const pendingInfo = useRef<Parameters<typeof onInfo>[0] | null>(null);
  useEffect(() => {
    if (!pic) return;
    // What the strip and the store are owed if this page goes away before the timer fires.
    pendingInfo.current = { edited: docEdited(doc), size: pageSize(doc, { width: pic.w, height: pic.h }) ?? undefined, snapshot: { lang, script, hist, glyphs, read, layerFiles: [...objects.keys()] } };
    const t = setTimeout(() => {
      pendingInfo.current = null;
      let thumb: string | undefined;
      const cache = createRenderCache();
      try {
        const out = pageSize(doc, { width: pic.w, height: pic.h }) ?? { w: pic.w, h: pic.h };
        const k = Math.min(1, 240 / Math.max(out.w, out.h));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(out.w * k));
        c.height = Math.max(1, Math.round(out.h * k));
        renderPage(c.getContext('2d')!, { doc, base: drawBase, images, size: { w: c.width, h: c.height }, presets: presetsFor, cache });
        thumb = c.toDataURL('image/jpeg', 0.7);
      } catch {
        /* no thumbnail where the browser cannot make one: the strip shows a plain tile */
      } finally {
        disposeRenderCache(cache);
      }
      onInfo({ thumb, edited: docEdited(doc), size: pageSize(doc, { width: pic.w, height: pic.h }) ?? undefined, snapshot: { lang, script, hist, glyphs, read, layerFiles: [...objects.keys()] } });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pic, hist, glyphs, lang, script, read, picsVersion, bg]);

  // Leaving the page (another page is shown, or the editor closes) within the 250 ms must not drop the last edit: save it now, without a new thumbnail.
  const onInfoRef = useRef(onInfo);
  onInfoRef.current = onInfo;
  useEffect(
    () => () => {
      const owed = pendingInfo.current;
      pendingInfo.current = null;
      if (owed) onInfoRef.current(owed);
    },
    [pic],
  );

  useEffect(() => {
    if (!layer) setTyping(false);
  }, [layer]);

  // Where nothing is saved between visits, a reload or a closed tab would lose the work: ask first.
  const unsaved = warnOnLeave && docEdited(doc);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  // ---- picking text by dragging over it ----
  const toPicture = (e: { clientX: number; clientY: number }) => {
    const c = scene.current!.canvas()!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / (r.width || c.width), y: ((e.clientY - r.top) * c.height) / (r.height || c.height) };
  };

  // ---- keys ----

  /**
   * Keys that work anywhere on the page while this tool is shown, except while typing (Escape still clears) and except where a
   * control has its own use of the key (a slider and the layer list take the arrows). Delete, Cmd+Z, Cmd+D and the others work
   * even when a panel button has the focus, which is where the focus is after most clicks. The crop tool has its own Enter and Escape.
   */
  const onKeys = (e: KeyboardEvent) => {
    if (!pic || cropping || cutting || dialogOpen || exporting) return;
    const t = e.target instanceof Element ? e.target : null;
    const inField = !!t?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
    if (inField && e.key !== 'Escape') return;
    const onControl = !!t?.closest('button, a, [role=slider], [role=radio], .tbox, .lp-list');
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (mod && key === 'a') {
      if (live.length > 0 && !(sel.length > 0 && !isVirtual) && liveOn) {
        e.preventDefault();
        setSelectedIds([]);
        setPicked([0, live.length]);
      } else if (selectable(layers).length > 0) {
        e.preventDefault();
        pickLayers(selectable(layers));
      }
    } else if (e.key === 'Escape') {
      clear();
      setTool((x) => (x === 'add' || x === 'layers' ? 'select' : x));
      scene.current?.canvas()?.focus();
    } else if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && key === 'y') {
      e.preventDefault();
      redo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isVirtual && sel.length > 0) {
      e.preventDefault();
      removeSel();
    } else if (mod && key === 'd' && sel.length > 0 && !isVirtual) {
      e.preventDefault();
      duplicateSel();
    } else if (mod && key === 'c') {
      if (isVirtual) {
        e.preventDefault();
        void copyText();
      } else if (sel.length > 0 && !window.getSelection()?.toString()) {
        e.preventDefault();
        copyLayers();
      }
    } else if (!mod && !e.altKey && (e.key === '[' || e.key === ']') && sel.length > 0) {
      e.preventDefault();
      orderSel(e.key === '[' ? 'backward' : 'forward');
    } else if (mod && !e.altKey && (e.key === '[' || e.key === ']') && sel.length > 0) {
      e.preventDefault();
      orderSel(e.key === '[' ? 'back' : 'front');
    } else if (!mod && !onControl && sel.length > 0 && !isVirtual && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      const ids = movable(layers, sel);
      if (ids.length === 0) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]!;
      editMerge(`nudge:${ids.join()}`, (d) => ({ ...d, layers: d.layers.map((l) => (ids.includes(l.id) ? { ...l, x: l.x + dx!, y: l.y + dy! } : l)) }));
    }
  };
  const onPaste = (e: ClipboardEvent) => {
    if (!pic || cropping || cutting || dialogOpen || exporting) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return; // text pasted into a field is the field's business
    const files = onlyImages([...(e.clipboardData?.files ?? [])]);
    if (files.length > 0) {
      e.preventDefault();
      void addImageFiles(files);
      return;
    }
    const text = e.clipboardData?.getData('text/plain') ?? '';
    const pasted = parsePayload(text);
    if (pasted) {
      e.preventDefault();
      pasteLayers(pasted);
    } else if (!text && copied) {
      e.preventDefault();
      pasteLayers(copied.layers);
    }
  };
  const handlers = useRef({ onKeys, onPaste });
  handlers.current = { onKeys, onPaste };
  useEffect(() => {
    if (!active || !onScreen) return;
    const k = (e: KeyboardEvent) => {
      altDown.current = e.altKey;
      handlers.current.onKeys(e);
    };
    const u = (e: KeyboardEvent) => {
      altDown.current = e.altKey;
    };
    const p = (e: ClipboardEvent) => handlers.current.onPaste(e);
    window.addEventListener('keydown', k);
    window.addEventListener('keyup', u);
    window.addEventListener('paste', p);
    return () => {
      window.removeEventListener('keydown', k);
      window.removeEventListener('keyup', u);
      window.removeEventListener('paste', p);
    };
  }, [active, onScreen]);

  // ---- the transform box of a picture or shape ----

  const single = objectSel.length === 1 && textSel.length === 0 ? objectSel[0]! : null;
  const boxed = single && !crop && !(single as { locked?: boolean }).locked && !hiddenIn(single) ? single : null;
  /** A box dragged or resized by its handles: snapped to the page and the other layers (Alt holds the snapping off), one undo step per drag. */
  const transform = (box: LayerBox, mode: 'preview' | 'end') => {
    if (!boxed) return;
    let b = box;
    let gs: Guide[] = [];
    const start = (dragBase.current?.layers ?? layers).find((l) => l.id === boxed.id);
    if (start && !altDown.current) {
      const startBox = boxOfMedia(start as ObjectLayer);
      const others = layers.filter((l) => l.id !== boxed.id && !hiddenIn(l)).map((l) => boxOfLayer(l, measureCtx ?? undefined));
      const zoom = view?.k ?? 1;
      if (b.w === startBox.w && b.h === startBox.h && b.rotation === startBox.rotation) {
        const s = snapMove(b, others, page, 6, zoom);
        b = { ...b, cx: s.cx, cy: s.cy };
        gs = s.guides;
      } else {
        const handle = inferHandle(startBox, b);
        if (handle) {
          const r = snapResize(b, handle, others, page, 6, zoom);
          b = r.box;
          gs = r.guides;
        }
      }
    }
    setGuides(mode === 'end' ? [] : gs);
    edit((d) => ({ ...d, layers: patchObjects(d.layers, [boxed.id], patchOfBox(b)) }), mode);
  };

  // ---- the glue to what is drawn ----

  const measureForAlign = measure;
  const liveOn = !cropping && !boxMode && isIdentityGeometry(doc.base);
  const showLive = !!view && !typing && liveOn;
  const outlined = useMemo(() => (boxed ? sel.filter((id) => id !== boxed.id) : sel), [sel, boxed]);
  const k = view?.k ?? 1;
  const readingNote = readError
    ? null
    : reading !== null
      ? `Reading the text… ${Math.round(reading * 100)}%`
      : glyphs.length === 0
        ? 'No text found. You can still add text.'
        : 'Text found. Drag over it to select the part you want.';

  const panel = cropping ? 'crop' : tool === 'adjust' ? 'adjust' : objectSel.length > 0 ? 'object' : layer ? 'text' : 'idle';
  const layersPanel = (
    <LayersPanel
      layers={layers}
      selected={sel}
      onSelect={(ids, additive) => {
        setPicked(null);
        setTyping(false);
        setSelectedIds((prev) => (additive ? toggleIn(prev, ids[0]!) : ids));
      }}
      onChange={(next, mode) => edit((d) => ({ ...d, layers: next }), mode === 'commit' ? 'commit' : mode)}
    />
  );
  const showLayersFlyout = tool === 'layers' && !cropping;
  const geometryHint = !isIdentityGeometry(doc.base) && !cropping && glyphs.length > 0;

  if (phone) {
    if (!onScreen) return null;
    if (!pic) {
      return (
        <p className={error ? 'error-line' : 'note'} role={error ? 'alert' : 'status'}>
          {error ?? 'Opening the picture…'}
        </p>
      );
    }
    const objectIds = objectSel.map((l) => l.id);
    const restorable = textActive.filter((l) => l.erase && l.original !== undefined);
    const ctx: PhoneCtx = {
      shell: phone,
      file,
      pic,
      shownDoc,
      shownSize,
      page,
      drawBase,
      images,
      picsVersion,
      outlined,
      guides,
      scene,
      wrap,
      view,
      setView,
      measureCtx,
      measure,
      canUndo: H.canUndo(hist),
      canRedo: H.canRedo(hist),
      undo,
      redo,
      edit,
      editMerge,
      commit,
      commitAdded,
      cancelEdit,
      setGuides,
      layers,
      sel,
      selLayers,
      objectSel,
      textSel,
      textActive,
      virtual,
      layer,
      isVirtual,
      boxed,
      activeIds,
      pickLayers,
      clear,
      selectAll,
      typing,
      setTyping,
      startTyping,
      translate,
      copyText,
      busy,
      restoreOriginal:
        restorable.length > 0
          ? () => {
              // The picture's own words come back, exactly as they were: the text that stood in for them goes.
              const gone = restorable.map((l) => l.id);
              mutate((all) => all.filter((l) => !gone.includes(l.id)));
              setStatus(null);
              clear();
            }
          : null,
      text: {
        onText: ({ text, ...rest }) =>
          mutate(
            (all, ids) => {
              const spread = Object.keys(rest).length > 0 ? patchText(all, ids, rest) : all;
              return text === undefined ? spread : patchText(spread, [ids[0]!], { text });
            },
            undefined,
            `x:${activeIds.join()}:${Object.keys(rest).join()}`,
          ),
        onStyle: (patch) => mutate((all, ids) => mapText(all, ids, (l) => ({ ...l, style: { ...l.style, ...patch } })), undefined, `s:${activeIds.join()}:${Object.keys(patch).join()}`),
        onPreset: (id) => mutate((all, ids) => mapText(all, ids, (l) => ({ ...l, style: applyPreset(l.style, id) }))),
        onDuplicate: () => {
          if (!layer) return;
          const all = isVirtual ? [...layers, ...virtual] : layers;
          commitAdded(duplicate(all, [layer.id]), all);
        },
        onDelete: () => {
          if (!layer) return;
          commit(remove(layers, [layer.id]));
          clear();
        },
        onFront: () => layer && mutate((all) => reorder(all, [layer.id], 'front')),
        onInsertWord: (w) => layer && mutate((all) => patchText(all, [layer.id], { text: layer.text + (layer.text && !/\s$/.test(layer.text) ? ' ' : '') + w })),
        onEffects: (patch) => mutate((all, ids) => mapText(all, ids, (l) => ({ ...l, style: { ...l.style, ...patch } })), undefined, `fx:${activeIds.join()}`),
        onType: (text) => mutate((all, ids) => patchText(all, [ids[0]!], { text }), undefined, `t:${activeIds.join()}`),
      },
      live,
      picked,
      setPicked,
      lineAreas,
      bands,
      liveOn,
      reading,
      readingNote,
      readError,
      retryRead: () => void detect(pic, lang),
      lang,
      changeLang,
      script,
      setScript,
      setSelectedIds,
      addText,
      addImageFiles,
      addShape: (kind) => commitAdded(addShape(layers, kind, page)),
      addSticker: (c) => commitAdded(addSticker(layers, c, page)),
      duplicateSel,
      removeSel,
      copyLayers,
      orderSel,
      nudge,
      align: (kind: AlignKind) => edit((d) => ({ ...d, layers: alignToPage(d.layers, sel, kind, page, measureForAlign) })),
      objectChange: (patch, mode) => {
        if (mode === 'commit') editMerge(`o:${objectIds.join()}:${Object.keys(patch).join()}`, (d) => ({ ...d, layers: patchObjects(d.layers, objectIds, patch) }));
        else edit((d) => ({ ...d, layers: patchObjects(d.layers, objectIds, patch) }), mode);
      },
      patchSel: (patch, mode) => edit((d) => ({ ...d, layers: patchLayers(d.layers, sel, patch) }), mode),
      crop,
      setCrop,
      startCrop,
      applyCrop,
      resetGeometry,
      geometryHint,
      adjust: { adjust: doc.base.adjust, preset: doc.base.preset, presetAmount: doc.base.presetAmount },
      adjustChange,
      autoAdjust,
      resetColour,
      setCompare,
      hasBackground: !!bgId,
      restoreBackground,
      cutting,
      startCutout,
      cancelCutout: () => setCutting(false),
      keepCutout: (o) => void keepCutout(o),
      replaceBackground,
      transform,
      status,
      error,
      dismissMessages: () => {
        setStatus(null);
        setError(null);
      },
      notes: [
        ...(pic.scaled ? [`This picture was larger than ${MAX_SIDE}px, so it was scaled down to edit; the saved picture is that size.`] : []),
        ...(lost.length > 0 ? [`${lost.length} ${lost.length === 1 ? 'picture' : 'pictures'} on this page could not be found on this device (the browser may have cleared its storage), so ${lost.length === 1 ? 'it is' : 'they are'} left out.`] : []),
        ...(bgId && (bgLost || bgFailed) ? [`The picture with its background replaced ${bgLost ? 'could not be found on this device' : `could not be shown: ${bgFailed}`}, so the original picture is shown.`] : []),
        ...Object.values(failedPics).map((m) => `A picture on this page could not be shown: ${m}`),
      ],
      exporting,
      onExport,
    };
    return (
      <Suspense fallback={null}>
        <PhonePageView ctx={ctx} />
      </Suspense>
    );
  }

  return (
    <main className="editor-page">
      {!pic && (
        <p className={error ? 'error-line' : 'note'} role={error ? 'alert' : 'status'}>
          {error ?? 'Opening the picture…'}
        </p>
      )}

      {pic && (
        <div className="editor" inert={exporting}>
          <div className="editor-stage">
            <div className="editor-bar" role="toolbar" aria-label="Photo tools">
              <span className="editor-file" title={pic.name}>
                {pic.name}
              </span>
              <button type="button" className="text-button" onClick={addText}>
                <Icon name="addText" /> Add text
              </button>
              <span className="editor-gap" />
              <div className="zoom-group" role="group" aria-label="Zoom the picture">
                <button type="button" className="icon-button" aria-label="Zoom out" disabled={zoom <= ZOOMS[0]!} onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)] ?? 1)}>
                  <Icon name="minus" />
                </button>
                <button type="button" className="zoom-fit" aria-label="Fit the picture to the screen" disabled={zoom === 1} onClick={() => setZoom(1)}>
                  {Math.round(zoom * 100)}%
                </button>
                <button type="button" className="icon-button" aria-label="Zoom in" disabled={zoom >= ZOOMS[ZOOMS.length - 1]!} onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)] ?? 1)}>
                  <Icon name="plus" />
                </button>
              </div>
              <Tip label="Undo" side="bottom">
                <button type="button" className="icon-button" aria-label="Undo" disabled={!H.canUndo(hist) || cropping} onClick={undo}>
                  <Icon name="undo" />
                </button>
              </Tip>
              <Tip label="Redo" side="bottom">
                <button type="button" className="icon-button" aria-label="Redo" disabled={!H.canRedo(hist) || cropping} onClick={redo}>
                  <Icon name="redo" />
                </button>
              </Tip>
              <button type="button" className="text-button is-primary" onClick={onExport}>
                Save picture
              </button>
            </div>

            <div className="stage-main">
              <div className="tool-strip" role="toolbar" aria-orientation="vertical" aria-label="Tools">
                <StripButton label="Select" pressed={tool === 'select' && !boxMode && !cropping} onClick={() => { setTool('select'); setBoxMode(false); }}>
                  <PathIcon d={ICON_SELECT} />
                </StripButton>
                <StripButton label="Select layers by dragging a box" pressed={boxMode} onClick={() => setBoxMode((b) => !b)}>
                  <PathIcon d={ICON_BOX} />
                </StripButton>
                <StripButton label="Add" pressed={tool === 'add'} disabled={cropping} onClick={() => setTool((t) => (t === 'add' ? 'select' : 'add'))}>
                  <Icon name="plus" />
                </StripButton>
                <StripButton label="Crop and rotate" pressed={cropping} disabled={cropping} onClick={startCrop}>
                  <PathIcon d={ICON_CROP} />
                </StripButton>
                <StripButton label="Adjust" pressed={tool === 'adjust'} disabled={cropping} onClick={() => setTool((t) => (t === 'adjust' ? 'select' : 'adjust'))}>
                  <PathIcon d={ICON_ADJUST} />
                </StripButton>
                <StripButton
                  label="Text effects"
                  disabled={!layer || cropping}
                  onClick={() => (side.current?.querySelector('[aria-label="Text effects"]') as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' })}
                >
                  <PathIcon d={ICON_FX} />
                </StripButton>
                <StripButton label="Layers" pressed={tool === 'layers'} disabled={cropping} onClick={() => setTool((t) => (t === 'layers' ? 'select' : 'layers'))}>
                  <PathIcon d={ICON_LAYERS} />
                </StripButton>
                <StripButton label="Remove background" pressed={cutting} disabled={cropping || exporting} onClick={startCutout}>
                  <PathIcon d={ICON_CUTOUT} />
                </StripButton>
                <StripButton label="Export" disabled={cropping} onClick={onExport}>
                  <Icon name="save" />
                </StripButton>
              </div>

              {tool === 'add' && !cropping && (
                <div className="tool-flyout" role="region" aria-label="Add">
                  <AddPanel
                    onPickFiles={(files) => void addImageFiles(files)}
                    onAddShape={(kind) => commitAdded(addShape(layers, kind, page))}
                    onAddText={addText}
                    onAddSticker={(c) => commitAdded(addSticker(layers, c, page))}
                    onPickFrame={objectSel.length === 1 && isImage(objectSel[0]!) ? (frame) => edit((d) => ({ ...d, layers: patchObjects(d.layers, [objectSel[0]!.id], { frame }) })) : undefined}
                  />
                </div>
              )}
              {showLayersFlyout && (
                <div className="tool-flyout" role="region" aria-label="Layers list">
                  {layersPanel}
                </div>
              )}

              <div className={zoom > 1 ? 'canvas-scroll is-zoomed' : 'canvas-scroll'} style={{ '--pz': zoom } as React.CSSProperties}>
              <div
                className={dropping ? 'canvas-wrap is-dropping' : 'canvas-wrap'}
                ref={wrap}
                tabIndex={-1}
                onDragOver={(e) => {
                  if (!e.dataTransfer?.types?.includes('Files')) return;
                  e.preventDefault();
                  setDropping(true);
                }}
                onDragLeave={() => setDropping(false)}
                onDrop={(e) => {
                  setDropping(false);
                  const list = [...(e.dataTransfer?.files ?? [])];
                  if (list.length === 0) return;
                  e.preventDefault();
                  const good = onlyImages(list);
                  if (good.length > 0) void addImageFiles(good);
                  if (good.length < list.length) setError(`${list.length - good.length === 1 ? 'One file was' : `${list.length - good.length} files were`} not a picture.`);
                }}
              >
                <PhotoCanvas
                  ref={scene}
                  doc={shownDoc}
                  base={drawBase}
                  images={images}
                  imagesVersion={picsVersion}
                  size={shownSize}
                  selectedIds={cropping ? [] : outlined}
                  interactive={!cropping && !exporting}
                  boxMode={boxMode}
                  presets={presetsFor}
                  guides={guides}
                  onPick={(id, additive) => {
                    setPicked(null);
                    setTyping(false);
                    if (id === null) setSelectedIds([]);
                    else {
                      setSelectedIds((prev) => (additive ? toggleIn(prev, id) : [id]));
                      setTool((t) => (t === 'adjust' ? 'select' : t));
                    }
                  }}
                  onPickMany={(ids, additive) => {
                    pickLayers(additive ? ids : ids);
                  }}
                  onDragLayers={(next) => edit((d) => ({ ...d, layers: next }), 'preview')}
                  onDragEnd={() => edit((d) => d, 'end')}
                  onDragCancel={cancelEdit}
                  onGuides={setGuides}
                  onActivate={(id) => {
                    setPicked(null);
                    setSelectedIds([id]);
                    setTyping(true);
                  }}
                  label="The picture. Click a layer to select it, drag to move it (hold Alt to stop it snapping); Shift-click adds to the selection; arrow keys nudge; Enter types on selected text. Command or Control A selects all the text found."
                />

                {showLive && (
                  <div
                    className="live-layer"
                    style={{ left: view.left, top: view.top, width: pic.w * k, height: pic.h * k }}
                    onPointerMove={(e) => {
                      if (picking.current === null) return;
                      const at = caretAt(live, toPicture(e));
                      if (at !== null) setPicked(stretch(picking.current, at));
                    }}
                    onPointerUp={() => {
                      picking.current = null;
                    }}
                  >
                    {bands.map((b, i) => (
                      <div key={i} className="live-band" aria-hidden="true" style={{ left: b.x0 * k, top: b.y0 * k, width: (b.x1 - b.x0) * k, height: (b.y1 - b.y0) * k }} />
                    ))}
                    {lineAreas.map((a) => (
                      <div
                        key={a.line}
                        className="live-line"
                        aria-hidden="true"
                        style={{ left: (a.box.x0 - 4) * k, top: (a.box.y0 - 4) * k, width: (a.box.x1 - a.box.x0 + 8) * k, height: (a.box.y1 - a.box.y0 + 8) * k }}
                        onPointerDown={(e) => {
                          // A layer lying over the picture's words is what the pointer means (and Shift always means a layer marquee): hand it to the page.
                          const at = toPicture(e);
                          lastPointer.current = e.pointerType || 'mouse';
                          if (e.shiftKey || hitPage(layers, at.x, at.y, measureCtx ?? undefined) !== null) {
                            if (scene.current?.begin(e)) e.preventDefault();
                            return;
                          }
                          // A finger cannot drag-select letters without fighting the page's scrolling: a tap picks the word (see onClick), a second tap the line.
                          if (e.pointerType === 'touch') return;
                          // Nothing is picked by a click alone: the drag starts where the pointer goes down and ends where it is let go.
                          e.preventDefault();
                          e.currentTarget.setPointerCapture?.(e.pointerId);
                          const from = caretAt(live, at);
                          if (from === null) return;
                          picking.current = from;
                          setSelectedIds([]);
                          setTyping(false);
                          setPicked(null);
                          wrap.current?.focus({ preventScroll: true });
                        }}
                        onDoubleClick={(e) => {
                          if (lastPointer.current === 'touch') return;
                          const at = toPicture(e);
                          const over = hitPage(layers, at.x, at.y, measureCtx ?? undefined);
                          const hit = layers.find((l) => l.id === over);
                          if (hit && isText(hit)) {
                            pickLayers([hit.id]);
                            setTyping(true);
                            return;
                          }
                          const near = nearestGlyph(live, at);
                          if (near !== null) setPicked(wordAround(live, near));
                        }}
                        onClick={(e) => {
                          const touch = lastPointer.current === 'touch';
                          if (e.detail < (touch ? 1 : 3)) return;
                          const at = nearestGlyph(live, toPicture(e));
                          if (at === null) return;
                          if (touch) {
                            setSelectedIds([]);
                            setTyping(false);
                            setPicked(e.detail >= 2 ? lineAround(live, at) : wordAround(live, at));
                            return;
                          }
                          setPicked(lineAround(live, at));
                        }}
                      />
                    ))}
                  </div>
                )}

                <SelectionOverlay
                  scene={scene as React.RefObject<SceneHandle | null>}
                  wrap={wrap}
                  active={textActive}
                  watch={[virtual, selectedIds, layers, pic, shownSize.w, shownSize.h, cropping]}
                  typing={typing}
                  onType={(text) => mutate((all, ids) => patchText(all, [ids[0]!], { text }), undefined, `t:${activeIds.join()}`)}
                  onStopTyping={() => setTyping(false)}
                  onView={setView}
                  toolbar={
                    <>
                      <button type="button" className="is-main" disabled={busy} onClick={() => void translate()}>
                        <Icon name="translate" /> Translate
                      </button>
                      <button type="button" onClick={startTyping}>
                        <Icon name="edit" /> Edit
                      </button>
                      <button type="button" aria-label="Copy the text" title="Copy the text" onClick={() => void copyText()}>
                        <Icon name="copy" />
                      </button>
                    </>
                  }
                />

                {boxed && view && (
                  <TransformBox box={boxOfMedia(boxed)} view={view} frame={page} label={isImage(boxed) ? 'Selected picture' : 'Selected shape'} onChange={transform} />
                )}

                {crop && view && pic && (
                  <CropTool src={{ w: pic.w, h: pic.h }} geometry={crop} view={view} onChange={(g) => setCrop(g)} onApply={applyCrop} onCancel={() => setCrop(null)} />
                )}

                {reading !== null && (
                  <p className="reading-pill" role="status">
                    {readingNote}
                  </p>
                )}
              </div>
              </div>
            </div>

            {!cropping && (
              <div className="touch-actions" role="toolbar" aria-label="Selection actions">
                <button type="button" onClick={selectAll} disabled={live.length === 0 && selectable(layers).length === 0}>
                  Select all
                </button>
                <button type="button" onClick={clear} disabled={sel.length === 0 && !picked && !typing}>
                  Deselect
                </button>
                <button type="button" aria-label="Duplicate selection" onClick={duplicateSel} disabled={sel.length === 0 || isVirtual}>
                  <Icon name="copy" /> Duplicate
                </button>
                <button type="button" aria-label="Delete selection" onClick={removeSel} disabled={sel.length === 0 || isVirtual}>
                  <Icon name="trash" /> Delete
                </button>
                {(
                  [
                    ['Nudge left', 'arrowLeft', -NUDGE, 0],
                    ['Nudge up', 'arrowUp', 0, -NUDGE],
                    ['Nudge down', 'arrowDown', 0, NUDGE],
                    ['Nudge right', 'arrowRight', NUDGE, 0],
                  ] as const
                ).map(([label, icon, dx, dy]) => (
                  <button key={label} type="button" className="is-icon" aria-label={label} disabled={sel.length === 0 || isVirtual || movable(layers, sel).length === 0} onClick={() => nudge(dx, dy)}>
                    <Icon name={icon} />
                  </button>
                ))}
              </div>
            )}

            {pic.scaled && <p className="note">This picture was larger than {MAX_SIDE}px, so it was scaled down to edit; the saved picture is that size.</p>}
            {geometryHint && (
              <p className="note" data-testid="geometry-hint">
                The picture is cropped or turned, so its words cannot be selected. Reset the crop to select text in the picture.{' '}
                <button type="button" className="text-button" onClick={resetGeometry}>
                  Reset crop and rotation
                </button>
              </p>
            )}
            {lost.length > 0 && (
              <p className="note" role="status">
                {lost.length} {lost.length === 1 ? 'picture' : 'pictures'} on this page could not be found on this device (the browser may have cleared its storage), so {lost.length === 1 ? 'it is' : 'they are'} left out. The rest of the page is as you left it.
              </p>
            )}
            {bgId && (bgLost || bgFailed) && (
              <p className="note" role="status" data-testid="background-missing">
                The picture with its background replaced {bgLost ? 'could not be found on this device (the browser may have cleared its storage)' : `could not be shown: ${bgFailed}`}, so the original picture is shown. Replace the background again to bring it back.
              </p>
            )}
            {Object.values(failedPics).map((m, i) => (
              <p key={i} className="error-line" role="alert">
                A picture on this page could not be shown: {m}
              </p>
            ))}
            {readError && (
              <p className="error-line" role="alert">
                The text in the picture could not be read: {readError}{' '}
                <button type="button" className="text-button" onClick={() => void detect(pic, lang)}>
                  Try again
                </button>
              </p>
            )}
            {status && (
              <p role="status" className="note">
                {status}
              </p>
            )}
            {error && (
              <p className="error-line" role="alert">
                {error}
              </p>
            )}
          </div>

          <aside className="editor-side" aria-label="Text controls" ref={side}>
            {panel === 'crop' && (
              <section className="inspector" aria-label="Crop and rotate">
                <h3 className="insp-title">Crop and rotate</h3>
                <p className="note">Drag the box or its handles to crop. Enter applies it, Escape leaves the picture as it was. Nothing changes until you apply.</p>
              </section>
            )}
            {panel === 'text' && layer && (
              <>
                {textActive.length > 1 && <p className="insp-count">{textActive.length} lines selected. Changes to look apply to all of them.</p>}
                <Inspector
                  layer={layer}
                  frame={page}
                  onText={({ text, ...rest }) =>
                    mutate(
                      (all, ids) => {
                        const spread = Object.keys(rest).length > 0 ? patchText(all, ids, rest) : all;
                        return text === undefined ? spread : patchText(spread, [ids[0]!], { text });
                      },
                      undefined,
                      `x:${activeIds.join()}:${Object.keys(rest).join()}`,
                    )
                  }
                  onStyle={(patch) => mutate((all, ids) => mapText(all, ids, (l) => ({ ...l, style: { ...l.style, ...patch } })), undefined, `s:${activeIds.join()}:${Object.keys(patch).join()}`)}
                  onPreset={(id) => mutate((all, ids) => mapText(all, ids, (l) => ({ ...l, style: applyPreset(l.style, id) })))}
                  onDuplicate={() => {
                    const all = isVirtual ? [...layers, ...virtual] : layers;
                    commitAdded(duplicate(all, [layer.id]), all);
                  }}
                  onDelete={() => {
                    commit(remove(layers, [layer.id]));
                    clear();
                  }}
                  onFront={() => mutate((all) => reorder(all, [layer.id], 'front'))}
                  onInsertWord={(w) => mutate((all) => patchText(all, [layer.id], { text: layer.text + (layer.text && !/\s$/.test(layer.text) ? ' ' : '') + w }))}
                  extra={
                    <div className="insp-actions">
                      <button type="button" className="text-button is-primary" disabled={busy} onClick={() => void translate()}>
                        Translate to Interslavic
                      </button>
                      {textActive.some((l) => l.erase && l.original !== undefined) && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            // The picture's own words come back, exactly as they were: the text that stood in for them goes.
                            const gone = textActive.filter((l) => l.erase && l.original !== undefined).map((l) => l.id);
                            mutate((all) => all.filter((l) => !gone.includes(l.id)));
                            setStatus(null);
                            clear();
                          }}
                        >
                          Restore original
                        </button>
                      )}
                    </div>
                  }
                />
                <TextEffectsPanel
                  style={layer.style}
                  onChange={(patch) => mutate((all, ids) => mapText(all, ids, (l) => ({ ...l, style: { ...l.style, ...patch } })), undefined, `fx:${activeIds.join()}`)}
                />
              </>
            )}
            {panel === 'object' && objectSel[0] && (
              <>
                {(objectSel.length > 1 || textSel.length > 0) && (
                  <p className="insp-count">
                    {objectSel.length > 1 ? `${objectSel.length} pictures and shapes selected. Changes apply to all of them.` : ''}
                    {textSel.length > 0 ? ' Text in the selection is not changed by these controls: select it alone to change it.' : ''}
                  </p>
                )}
                <ObjectInspector
                  layer={objectSel[0]}
                  page={page}
                  onChange={(patch, mode) => {
                    const ids = objectSel.map((l) => l.id);
                    if (mode === 'commit') editMerge(`o:${ids.join()}:${Object.keys(patch).join()}`, (d) => ({ ...d, layers: patchObjects(d.layers, ids, patch) }));
                    else edit((d) => ({ ...d, layers: patchObjects(d.layers, ids, patch) }), mode);
                  }}
                  onOrder={orderSel}
                  onAlign={(kind: AlignKind) => edit((d) => ({ ...d, layers: alignToPage(d.layers, sel, kind, page, measureForAlign) }))}
                  onDuplicate={duplicateSel}
                  onDelete={removeSel}
                />
              </>
            )}
            {panel === 'adjust' && (
              <>
              {backgroundSection}
              <AdjustPanel
                adjust={doc.base.adjust ?? {}}
                preset={doc.base.preset}
                presetAmount={doc.base.presetAmount}
                source={pic.base}
                onChange={adjustChange}
                onAuto={autoAdjust}
                onReset={resetColour}
                onCompare={setCompare}
              />
              </>
            )}
            {panel === 'idle' && (
              <>
                <section className="inspector is-idle" aria-label="Picture settings">
                  <p className="note">{readingNote ?? 'Select text in the picture to change it.'}</p>
                  {live.length > 0 && liveOn && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setSelectedIds([]);
                        setPicked([0, live.length]);
                      }}
                    >
                      Select all text
                    </button>
                  )}
                  <label className="insp-row">
                    <span>Text language</span>
                    <select value={lang} onChange={(e) => changeLang(e.target.value as OcrLang)} aria-label="Language of the text in the photo">
                      {LANGS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="insp-row">
                    <span>Interslavic script</span>
                    <select value={script} onChange={(e) => setScript(e.target.value as Script)} aria-label="Interslavic script">
                      <option value="standard">Latin</option>
                      <option value="cyrillic">Cyrillic</option>
                    </select>
                  </label>
                  <p className="note">Other Slavic languages: choose Edit and type them.</p>
                </section>
                {backgroundSection}
                <AdjustPanel
                  adjust={doc.base.adjust ?? {}}
                  preset={doc.base.preset}
                  presetAmount={doc.base.presetAmount}
                  source={pic.base}
                  onChange={adjustChange}
                  onAuto={autoAdjust}
                  onReset={resetColour}
                  onCompare={setCompare}
                />
                {!showLayersFlyout && layersPanel}
              </>
            )}
          </aside>
        </div>
      )}
      {cutting && pic && (
        <Suspense fallback={null}>
          <CutoutDialog source={file} onKeep={(o) => void keepCutout(o)} onReplace={replaceBackground} onClose={() => setCutting(false)} />
        </Suspense>
      )}
    </main>
  );
});

/** What to tell the person when a turn or straighten could not carry the "hides the old lettering" rectangles of some text along. */
function eraseNote(n: number): string | null {
  if (n === 0) return null;
  return `${n} ${n === 1 ? 'piece of text' : 'pieces of text'} no longer hide${n === 1 ? 's' : ''} the lettering underneath, because a straight rectangle cannot follow a straightened picture. Move or restyle ${n === 1 ? 'it' : 'them'} as you like, or undo the straighten.`;
}

interface Page {
  id: string;
  file: File;
  /** The item in the Uploads sheet this page was made from, so that opening it again goes to the page. */
  itemId: string | null;
  /** Present when the page was brought back from the saved copy. */
  restored?: Restored;
  thumb?: string;
  /** The files of the pictures on the page (picture layers name them by id). */
  objects: Map<string, File>;
}

const fileKey = (f: File): string => `${f.name}|${f.size}|${f.lastModified}`;
const newPageId = (): string => `page-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * The photo editor: any number of pictures open together, each a page with its
 * own text, objects and its own undo history, switched from a strip along the bottom. A
 * page keeps everything while another is shown, so nothing has to be saved to
 * move on. The pages are also kept on the user's own device (in the browser),
 * and come back the next time the editor is opened; when the work is done, one
 * picture or all of them can be downloaded (PNG, JPG, WebP or a PDF).
 */
export default function PhotoEditor({ recognizer = tesseractRecognizer, store = defaultStore, phone = false }: { recognizer?: Recognizer; store?: PhotoStore | null; /** The phone layout (phone/photo): the same pages, history and saved copy, drawn for a thumb. */ phone?: boolean }) {
  const lib = useLibrary();
  const [pages, setPages] = useState<Page[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [info, setInfo] = useState<Record<string, PageInfo>>({});
  const [leaving, setLeaving] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [dialog, setDialog] = useState(false);
  /** Phone: the page grid sheet is open (kept here, since the page shown changes under it). */
  const [pagesOpen, setPagesOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  /** The sizes of pages never shown this visit, read from their files' headers for the export dialog. */
  const [guessed, setGuessed] = useState<Record<string, { w: number; h: number }>>({});
  /** Whether the pages are being brought back from the saved copy. */
  const [restoring, setRestoring] = useState(store !== null);
  /** The saved pictures could not be read (the browser's storage was blocked or failed): start empty, and say so. */
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [kept, setKept] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const handles = useRef(new Map<string, PageHandle | null>());
  const writes = useRef(0);

  // The OCR engine and its language data are a download of several MB: start getting them as soon as the tool is open, in a quiet moment,
  // so the first picture does not wait for them. Not on a connection set to save data.
  useEffect(() => {
    const saving = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (saving || !recognizer.warm) return;
    const t = setTimeout(() => recognizer.warm?.('en'), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Writes to the saved copy, and says how it went. A failure (usually a full disk) is shown, not hidden. */
  const keep = (job: () => Promise<void>) => {
    if (!store) return;
    const mine = ++writes.current;
    setKept('saving');
    job()
      .then(() => {
        if (mine === writes.current) setKept('saved');
      })
      .catch(() => setKept('failed'));
  };

  const restoreFailedRef = useRef(false);
  // Bring back what was open last time.
  useEffect(() => {
    if (!store) return;
    let live = true;
    store
      .load()
      .then((saved) => {
        if (!live || !saved) return;
        const items = lib.add(saved.pages.map((p) => p.file));
        setPages(
          saved.pages.map((p, i) => ({
            id: p.id,
            file: p.file,
            itemId: items[i]?.id ?? null,
            restored: { lang: p.lang, script: p.script, hist: p.hist, glyphs: p.glyphs, read: p.read },
            thumb: p.thumb,
            objects: p.objects,
          })),
        );
        setCurrent(saved.meta.current && saved.pages.some((p) => p.id === saved.meta.current) ? saved.meta.current : saved.pages[0]!.id);
        // A page saved by the first version of the editor comes back as a new-style page: it is saved once more, so the next visit reads the new form.
        const upgraded = saved.pages.filter((p) => p.upgraded);
        if (upgraded.length > 0) {
          keep(async () => {
            for (const p of upgraded) {
              const { file: _f, objects: _o, missing: _m, upgraded: _u, ...record } = p;
              await store.savePage(record);
            }
          });
        }
      })
      .catch(() => {
        if (!live) return;
        restoreFailedRef.current = true;
        setRestoreFailed(true);
      })
      .finally(() => live && setRestoring(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The order of the pages, and which is shown, are kept too.
  useEffect(() => {
    if (!store || restoring) return;
    // A restore that failed leaves the page list empty although the saved pages are still there: never clear them for that.
    if (restoreFailedRef.current && pages.length === 0) return;
    keep(async () => {
      if (pages.length === 0) await store.clear();
      else await store.saveMeta({ order: pages.map((p) => p.id), current });
      void askToKeep();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.map((p) => p.id).join(','), current, restoring]);

  useReportPhotoTarget(pages.length > 0);

  const show = (page: Page) => {
    setCurrent(page.id);
    lib.markOpened(page.itemId);
  };

  /** A picture chosen anywhere - the drop zone, Add picture, the Uploads sheet - becomes a page, or takes you to its page if it already is one. */
  const addPicture = (file: File, item?: LibraryItem) => {
    setProblem(null);
    const it = item ?? lib.add([file])[0] ?? null;
    const have = pages.find((p) => (it !== null && p.itemId === it.id) || fileKey(p.file) === fileKey(file));
    if (have) {
      show(have);
      return;
    }
    const page: Page = { id: newPageId(), file, itemId: it?.id ?? null, objects: new Map() };
    if (store) keep(() => store.saveFile(page.id, file));
    setPages((all) => [...all, page]);
    show(page);
  };
  // A picture clicked in the Uploads sheet as "Add to this picture" goes onto the page being shown as a layer; a plain click opens it as a new page.
  usePhotoLibraryOpen((item, mode) => {
    const h = current ? handles.current.get(current) : null;
    if (mode === 'overlay' && h) void h.addImageFile(item.file);
    else addPicture(item.file, item);
  });

  const addMany = (files: FileList | null) => {
    const list = [...(files ?? [])];
    const good = list.filter((f) => matchesAccept(f, 'image/*'));
    good.forEach((f) => addPicture(f));
    if (good.length < list.length) setProblem(`${list.length - good.length === 1 ? 'One file was' : `${list.length - good.length} files were`} not a picture.`);
  };

  const removePage = (id: string) => {
    const at = pages.findIndex((p) => p.id === id);
    const rest = pages.filter((p) => p.id !== id);
    setPages(rest);
    handles.current.delete(id);
    setInfo(({ [id]: _gone, ...others }) => others);
    setLeaving(null);
    if (store) keep(() => store.removePage(id));
    if (current === id) {
      const next = rest[Math.min(at, rest.length - 1)] ?? null;
      setCurrent(next?.id ?? null);
      lib.markOpened(next?.itemId ?? null);
    }
  };

  /** A copy of a page, right after it, with its edits, its pictures and its text; the saved copy gets its own files. */
  const duplicatePage = (id: string) => {
    const src = pages.find((p) => p.id === id);
    if (!src) return;
    const snap = info[id]?.snapshot;
    const restored: Restored | undefined = snap ? { lang: snap.lang, script: snap.script, hist: snap.hist, glyphs: snap.glyphs, read: snap.read } : src.restored;
    const copy: Page = { id: newPageId(), file: src.file, itemId: src.itemId, restored, thumb: info[id]?.thumb ?? src.thumb, objects: new Map(src.objects) };
    setPages((all) => {
      const at = all.findIndex((p) => p.id === id);
      return [...all.slice(0, at + 1), copy, ...all.slice(at + 1)];
    });
    if (store) {
      keep(async () => {
        await store.saveFile(copy.id, copy.file);
        for (const [oid, f] of copy.objects) await store.saveObjectFile(copy.id, oid, f);
      });
    }
    show(copy);
  };

  /** One place earlier or later in the order of the pages (the order is saved with the rest). */
  const movePage = (id: string, by: -1 | 1) =>
    setPages((all) => {
      const at = all.findIndex((p) => p.id === id);
      const to = at + by;
      if (at < 0 || to < 0 || to >= all.length) return all;
      const next = all.slice();
      [next[at], next[to]] = [next[to]!, next[at]!];
      return next;
    });

  /** A page says how it now looks; the strip shows it, and the saved copy is brought up to date. */
  const heard = (page: Page, i: PageInfo) => {
    setInfo((all) => ({ ...all, [page.id]: i }));
    if (store) {
      keep(() => store.savePage({ id: page.id, name: page.file.name, thumb: i.thumb, ...i.snapshot }));
    }
  };

  const hasChanges = (p: Page): boolean => info[p.id]?.edited ?? (p.restored ? docEdited(p.restored.hist.present) : false);

  // ---- downloading ----

  /** Pages the export dialog can size: shown ones know theirs; the rest are read from the file's header (an estimate, said so by the dialog's own numbers). */
  useEffect(() => {
    if (!dialog) return;
    let live = true;
    for (const p of pages) {
      if (info[p.id]?.size || guessed[p.id]) continue;
      void sourceSizeOf(p.file).then((s) => {
        if (!live || !s) return;
        const w = downscaleSize(s.width, s.height, 2400);
        const doc = (info[p.id]?.snapshot.hist ?? p.restored?.hist)?.present;
        setGuessed((g) => ({ ...g, [p.id]: doc ? outputSize(w.width, w.height, doc.base) : { w: w.width, h: w.height } }));
      });
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);
  const dialogPages: ExportPageInfo[] = pages.map((p) => {
    const s = info[p.id]?.size ?? guessed[p.id] ?? { w: 1000, h: 750 };
    return { id: p.id, name: p.file.name, width: s.w, height: s.h };
  });

  const runExport = async (req: ExportRequest) => {
    setDialog(false);
    setExporting(true);
    setProblem(null);
    setExportNote(null);
    try {
      const targets = req.scope === 'all' ? pages : pages.filter((p) => p.id === current);
      const results: ExportResult[] = [];
      for (const p of targets) results.push(await handles.current.get(p.id)!.exportPage(req));
      if (req.format === 'pdf') {
        const blob = await exportPdf(results.map((r) => ({ blob: r.blob, width: r.width, height: r.height })));
        downloadBlob(results.length === 1 ? results[0]!.name.replace(/\.[^.]+$/, '') + '.pdf' : 'edited-pictures.pdf', blob);
      } else if (results.length === 1) {
        downloadBlob(results[0]!.name, results[0]!.blob);
      } else {
        downloadBlob('edited-pictures.zip', await exportZip(results.map((r) => ({ name: r.name, blob: r.blob }))));
      }
      const smaller = results.filter((r) => r.scaled).length;
      if (smaller > 0) setExportNote(`${smaller === 1 ? 'The picture was' : `${smaller} pictures were`} made smaller than the size you asked for, because this browser cannot make a picture that large.`);
      track(req.scope === 'all' ? 'photo-save-all' : 'photo-save', { pages: results.length, format: req.format });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  if (restoring) {
    return (
      <main className="editor-page">
        <p className="note" role="status">
          Getting your pictures back…
        </p>
      </main>
    );
  }

  if (pages.length === 0 && phone) {
    return (
      <main className="ph-photo-empty">
        <h1>Photo</h1>
        <p>Change the text in a picture, or crop, colour and decorate it. {store ? 'Your pictures and changes are kept on this device, and nowhere else.' : 'The picture stays on your device.'}</p>
        {restoreFailed && (
          <p className="error-line" role="alert">
            Your saved pictures could not be read just now, so you are starting empty. They are still on this device and may come back after a reload.
          </p>
        )}
        <label className="ph-photo-pick">
          <Icon name="image" size="1.6rem" />
          <span>Choose a picture</span>
          <input
            type="file"
            multiple
            accept="image/*"
            aria-label="Photo"
            onChange={(e) => {
              addMany(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        {problem && (
          <p className="error-line" role="alert">
            {problem}
          </p>
        )}
        <button type="button" className="ph-photo-sample" onClick={() => void samplePicture().then((f) => addPicture(f))}>
          Try a sample picture
        </button>
      </main>
    );
  }

  if (pages.length === 0) {
    return (
      <main className="editor-page">
        <h1>Photo editor</h1>
        <p className="lesson-summary">
          Change the text in a picture, or crop, colour and decorate it. {store ? 'Your pictures and changes are kept on this device, and nowhere else.' : 'The picture stays on your device.'}
        </p>
        {restoreFailed && (
          <p className="error-line" role="alert">
            Your saved pictures could not be read just now, so you are starting empty. They are still on this device and may come back after a reload.
          </p>
        )}
        <div className="photo-empty">
          <DropZone name="Photo" title="Drop a picture here, or click to browse" hint="JPG, PNG, WebP" accept="image/*" kind="image" noun="a picture" file={null} onFile={(f) => addPicture(f)} />
          <p className="photo-empty-alt">
            No picture handy?{' '}
            <button type="button" className="text-button" onClick={() => void samplePicture().then((f) => addPicture(f))}>
              Try a sample picture
            </button>
          </p>
        </div>
      </main>
    );
  }

  if (phone) {
    const shell: PhoneShell = {
      pages: pages.map((p) => ({ id: p.id, name: p.file.name, thumb: info[p.id]?.thumb ?? p.thumb, edited: hasChanges(p) })),
      currentId: current ?? pages[0]!.id,
      onShow: (id) => {
        const page = pages.find((p) => p.id === id);
        if (page) show(page);
      },
      onAddFiles: (files) => files.forEach((f) => addPicture(f)),
      onDuplicate: duplicatePage,
      onRemove: removePage,
      onMove: movePage,
      exportNode:
        dialog && current ? (
          <ExportDialog inline pages={dialogPages} currentId={current} onExport={(req) => void runExport(req)} onClose={() => setDialog(false)} />
        ) : null,
      onExportClose: () => setDialog(false),
      pagesOpen,
      setPagesOpen,
      note: exporting ? 'Making the file…' : kept === 'failed' ? 'Could not keep your work on this device (the browser may be out of room). Download your pictures to be safe.' : exportNote,
      problem,
    };
    return (
      <div className="ph-photo-workspace">
        {pages.map((p) => (
          <div key={p.id} className="ph-photo-page" hidden={p.id !== current}>
            <PagePane
              ref={(h) => {
                handles.current.set(p.id, h);
              }}
              file={p.file}
              recognizer={recognizer}
              restored={p.restored}
              onScreen={p.id === current}
              warnOnLeave={store === null}
              onInfo={(i) => heard(p, i)}
              pageId={p.id}
              objects={p.objects}
              store={store}
              keep={keep}
              dialogOpen={dialog}
              exporting={exporting}
              onExport={() => setDialog(true)}
              phone={shell}
            />
          </div>
        ))}
      </div>
    );
  }

  const leavingPage = pages.find((p) => p.id === leaving);
  return (
    <div className="photo-workspace">
      {pages.map((p) => (
        <div key={p.id} className="photo-page" hidden={p.id !== current}>
          <PagePane
            ref={(h) => {
              handles.current.set(p.id, h);
            }}
            file={p.file}
            recognizer={recognizer}
            restored={p.restored}
            onScreen={p.id === current}
            warnOnLeave={store === null}
            onInfo={(i) => heard(p, i)}
            pageId={p.id}
            objects={p.objects}
            store={store}
            keep={keep}
            dialogOpen={dialog}
            exporting={exporting}
            onExport={() => setDialog(true)}
          />
        </div>
      ))}

      {dialog && current && <ExportDialog pages={dialogPages} currentId={current} onExport={(req) => void runExport(req)} onClose={() => setDialog(false)} />}

      <nav className="page-strip" aria-label="Pages">
        {leavingPage && (
          <div className="replace-banner" role="alertdialog" aria-label="Remove this page?">
            <p>
              Remove <strong>{leavingPage.file.name}</strong>? Your changes to it will be lost.
            </p>
            <button type="button" className="text-button is-primary" onClick={() => removePage(leavingPage.id)}>
              Remove it
            </button>{' '}
            <button type="button" className="text-button" onClick={() => setLeaving(null)}>
              Keep it
            </button>
          </div>
        )}
        <ol className="page-list">
          {pages.map((p, i) => {
            const thumb = info[p.id]?.thumb ?? p.thumb;
            return (
              <li key={p.id} className={p.id === current ? 'is-current' : undefined}>
                <button type="button" className="page-tile" aria-label={`Page ${i + 1}: ${p.file.name}`} aria-current={p.id === current ? 'page' : undefined} onClick={() => show(p)}>
                  {thumb ? <img src={thumb} alt="" /> : <span className="page-blank" aria-hidden="true" />}
                  <span className="page-number" aria-hidden="true">
                    {i + 1}
                  </span>
                  {hasChanges(p) && <span className="page-dot" title="Has changes" aria-hidden="true" />}
                </button>
                <button type="button" className="page-remove" aria-label={`Remove page ${i + 1}`} onClick={() => (hasChanges(p) ? setLeaving(p.id) : removePage(p.id))}>
                  ×
                </button>
              </li>
            );
          })}
          <li>
            <label className="page-add">
              <Icon name="plus" /> <span>Add picture</span>
              <input
                type="file"
                multiple
                accept="image/*"
                aria-label="Photo"
                onChange={(e) => {
                  addMany(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </li>
        </ol>
        <div className="page-actions">
          {exporting && (
            <span className="page-kept" role="status">
              Making the file…
            </span>
          )}
          {store && kept === 'saved' && <span className="page-kept">Kept on this device</span>}
          {store && kept === 'saving' && <span className="page-kept">Keeping…</span>}
          {store && kept === 'failed' && (
            <span className="error-line" role="alert">
              Could not keep your work on this device (the browser may be out of room). Save your pictures to be safe.
            </span>
          )}
          {exportNote && (
            <span className="page-kept" role="status">
              {exportNote}
            </span>
          )}
          {problem && (
            <span className="error-line" role="alert">
              {problem}
            </span>
          )}
        </div>
      </nav>
    </div>
  );
}
