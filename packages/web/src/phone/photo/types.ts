import type { ReactNode, RefObject } from 'react';
import type { PhotoCanvasHandle } from '../../photo/PhotoCanvas.tsx';
import type { View } from '../../editor/SelectionOverlay.tsx';
import type { TextLayer } from '../../editor/layers.ts';
import type { TextStyle } from '../../editor/text-style.ts';
import type { Script } from '../../subtitles/translate.ts';
import type { Guide } from '../../photo/guides.ts';
import type { PageDoc, PhotoLayer } from '../../photo/doc.ts';
import type { Adjust } from '../../video/project.ts';
import type { Glyph } from '../../photo/live-text.ts';
import type { OcrLang } from '../../photo/ocr.ts';
import type { ObjectLayer } from '../../photo/ObjectInspector.tsx';
import type { AdjustPatch } from '../../photo/AdjustPanel.tsx';
import type { PictureSource } from '../../photo/render.ts';
import type { Geometry } from '../../photo/doc.ts';
import type { Measure } from '../../photo/layer-ops.ts';
import type { StepKind } from '../../editor/layers.ts';
import type { CutoutOutput } from '../../photo/CutoutDialog.tsx';
import type { ShapeKind } from '../../photo/doc.ts';
import type { AlignKind } from '../../photo/layer-ops.ts';

/** What the parent (the whole editor: its pages, the saved copy, the export dialog) gives a phone page. */
export interface PhoneShell {
  pages: { id: string; name: string; thumb?: string; edited: boolean }[];
  currentId: string;
  onShow: (id: string) => void;
  onAddFiles: (files: File[]) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, by: -1 | 1) => void;
  /** The Download dialog's content (an inline ExportDialog), or null while it is not open. */
  exportNode: ReactNode;
  onExportClose: () => void;
  /** The page grid sheet is open. Kept by the parent, because adding, duplicating or deleting a page changes the page shown and the grid must stay up. */
  pagesOpen: boolean;
  setPagesOpen: (open: boolean) => void;
  /** Messages about the saved copy and the last export. */
  note: string | null;
  problem: string | null;
}

/**
 * Everything a phone page needs from `PagePane` (photo/PhotoEditor.tsx), which owns the state and the actions: the phone view is a
 * second way to draw and drive the same page, so it adds no editing logic of its own beyond turning touches into these calls.
 */
export interface PhoneCtx {
  shell: PhoneShell;
  file: File;
  pic: { base: HTMLCanvasElement; w: number; h: number; name: string; scaled: boolean };

  // what is drawn
  shownDoc: PageDoc;
  shownSize: { w: number; h: number };
  page: { w: number; h: number };
  drawBase: PictureSource | null;
  images: { pictureOf: (id: string) => CanvasImageSource | null };
  picsVersion: number;
  outlined: string[];
  guides: Guide[];
  scene: RefObject<PhotoCanvasHandle | null>;
  wrap: RefObject<HTMLDivElement | null>;
  view: View | null;
  setView: (v: View | null) => void;
  measureCtx: CanvasRenderingContext2D | null;
  measure: Measure;

  // history
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  edit: (apply: (d: PageDoc) => PageDoc, mode?: 'commit' | 'preview' | 'end') => void;
  editMerge: (key: string, apply: (d: PageDoc) => PageDoc) => void;
  commit: (next: PhotoLayer[]) => void;
  commitAdded: (next: PhotoLayer[], before?: PhotoLayer[]) => void;
  cancelEdit: () => void;
  setGuides: (g: Guide[]) => void;

  // selection
  layers: PhotoLayer[];
  sel: string[];
  selLayers: PhotoLayer[];
  objectSel: ObjectLayer[];
  textSel: TextLayer[];
  textActive: TextLayer[];
  /** The text the picked words would become (stable between renders until the pick or the picture changes). */
  virtual: TextLayer[];
  layer: TextLayer | null;
  isVirtual: boolean;
  boxed: ObjectLayer | null;
  pickLayers: (ids: string[]) => void;
  clear: () => void;
  selectAll: () => void;

  // text
  typing: boolean;
  setTyping: (on: boolean) => void;
  startTyping: () => void;
  activeIds: string[];
  /** The text controls' handlers (the same ones the desktop Inspector gets), plus the effects panel's and the typing box's. */
  text: {
    onText: (patch: Partial<TextLayer>) => void;
    onStyle: (patch: Partial<TextStyle>) => void;
    onPreset: (id: string) => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onFront: () => void;
    onInsertWord: (word: string) => void;
    onEffects: (patch: Partial<TextStyle>) => void;
    onType: (text: string) => void;
  };
  /** Translates the selected text into Interslavic; `lang` overrides the page's text language for this call only (no re-reading of the picture). */
  translate: (opts?: { lang?: OcrLang }) => Promise<void>;
  copyText: () => Promise<void>;
  busy: boolean;
  restoreOriginal: (() => void) | null;

  // live text
  live: Glyph[];
  picked: [number, number] | null;
  setPicked: (p: [number, number] | null) => void;
  lineAreas: { line: number; box: { x0: number; y0: number; x1: number; y1: number } }[];
  bands: { x0: number; x1: number; y0: number; y1: number }[];
  liveOn: boolean;
  reading: number | null;
  readingNote: string | null;
  readError: string | null;
  retryRead: () => void;
  lang: OcrLang;
  changeLang: (l: OcrLang) => void;
  script: Script;
  setScript: (s: Script) => void;
  setSelectedIds: (ids: string[]) => void;

  // adding and arranging
  addText: () => void;
  addImageFiles: (files: File[]) => Promise<void>;
  addShape: (kind: ShapeKind) => void;
  addSticker: (c: string) => void;
  duplicateSel: () => void;
  removeSel: () => void;
  copyLayers: () => void;
  orderSel: (kind: StepKind) => void;
  nudge: (dx: number, dy: number) => void;
  align: (kind: AlignKind) => void;
  /** A patch of the selected picture's or shape's own fields (ObjectInspector's onChange). */
  objectChange: (patch: Record<string, unknown>, mode: 'commit' | 'preview' | 'end') => void;
  /** A patch of any selected layers (text too), e.g. rotation. */
  patchSel: (patch: Record<string, unknown>, mode: 'commit' | 'preview' | 'end') => void;

  // the picture itself
  crop: Geometry | null;
  setCrop: (g: Geometry | null) => void;
  startCrop: () => void;
  applyCrop: () => void;
  resetGeometry: () => void;
  geometryHint: boolean;
  adjust: { adjust?: Adjust; preset?: string; presetAmount?: number };
  adjustChange: (patch: AdjustPatch, mode: 'preview' | 'end') => void;
  autoAdjust: () => void;
  resetColour: () => void;
  setCompare: (on: boolean) => void;
  hasBackground: boolean;
  restoreBackground: () => void;
  cutting: boolean;
  startCutout: () => void;
  cancelCutout: () => void;
  keepCutout: (o: CutoutOutput) => void;
  replaceBackground: (o: CutoutOutput) => void;

  // the transform box of a picture or shape
  transform: (box: import('../../video/contracts.ts').LayerBox, mode: 'preview' | 'end') => void;

  // messages
  status: string | null;
  error: string | null;
  dismissMessages: () => void;
  notes: string[];
  exporting: boolean;
  onExport: () => void;
}
