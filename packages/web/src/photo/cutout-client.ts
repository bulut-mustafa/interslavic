import {
  CUTOUT_MODELS, applyMatte, fitInside, finishCutout, resizeMatte,
  type Box, type CutoutModel, type Finish, type Matte, type Rgba,
} from './cutout.ts';

/**
 * Removing a picture's background on the device: the page's view of the worker
 * (cutout.worker.ts), and `removeBackground`, the one call the editor makes.
 *
 * CONTRACT of removeBackground(source, { model, signal, onStage }):
 *   resolves { matte, picture, cutout, width, height, scale }
 *     width/height  the working picture's size: the source shrunk to at most MAX_SIDE (2400) px on its longest side
 *     scale         width / the source's own width (1 when not shrunk)
 *     matte         Matte (one alpha byte a pixel) of width x height
 *     picture       the working picture as an opaque canvas, kept so the matte can be refined (release it with releaseCanvas)
 *     cutout        a canvas of the same size: `picture` with `matte` as its alpha (write it out with canvasToPng)
 *   rejects with an AbortError (name === 'AbortError') when `signal` aborts, with an Error whose message is plain text otherwise.
 * To make the final, trimmed layer image after refining, call buildCutout(picture, matte, { trim: true }).
 */

/** The longest side of the working picture. The same ceiling the OCR uses (photo/ocr.ts); a 12-megapixel photo is never held at full size. */
export const MAX_SIDE = 2400;

export interface LoadProgress {
  /** 0-1 over every file the model needs, so far as they have been announced. */
  fraction: number;
  file: string;
}

/** The worker, as the page uses it; a small interface so everything above it can be tested with a stand-in. */
export interface Segmenter {
  load(model: CutoutModel, onProgress: (p: LoadProgress) => void): Promise<void>;
  /** The model's mask for an RGBA picture. The pixels are handed over to the worker: do not use `rgba` again. */
  segment(rgba: Uint8ClampedArray, w: number, h: number): Promise<Matte>;
  dispose(): void;
}

export function createCutoutClient(): Segmenter {
  const worker = new Worker(new URL('./cutout.worker.ts', import.meta.url), { type: 'module' });
  let nextId = 1;
  const files = new Map<string, { loaded: number; total: number }>();
  const pending = new Map<number, { resolve(m: Matte): void; reject(e: Error): void }>();
  let loading: { resolve(): void; reject(e: Error): void; onProgress(p: LoadProgress): void } | null = null;

  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as
      | { type: 'progress'; p: { status?: string; file?: string; loaded?: number; total?: number } }
      | { type: 'ready' }
      | { type: 'done'; id: number; w: number; h: number; alpha: Uint8ClampedArray }
      | { type: 'error'; id?: number; message: string };
    if (m.type === 'progress' && loading && m.p.file && m.p.total) {
      files.set(m.p.file, { loaded: m.p.loaded ?? 0, total: m.p.total });
      const all = [...files.values()];
      const total = all.reduce((n, f) => n + f.total, 0);
      loading.onProgress({ fraction: total ? all.reduce((n, f) => n + f.loaded, 0) / total : 0, file: m.p.file });
    } else if (m.type === 'ready') {
      loading?.resolve();
      loading = null;
    } else if (m.type === 'done') {
      pending.get(m.id)?.resolve({ w: m.w, h: m.h, data: m.alpha });
      pending.delete(m.id);
    } else if (m.type === 'error') {
      const err = new Error(m.message);
      if (m.id !== undefined) {
        pending.get(m.id)?.reject(err);
        pending.delete(m.id);
      } else {
        loading?.reject(err);
        loading = null;
      }
    }
  };
  // A worker that cannot even start (blocked script, missing file) reports here, not through a message.
  worker.onerror = (e: ErrorEvent) => {
    const err = new Error(e.message || 'The worker could not start.');
    loading?.reject(err);
    loading = null;
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };

  return {
    load: (model, onProgress) =>
      new Promise<void>((resolve, reject) => {
        loading = { resolve, reject, onProgress };
        worker.postMessage({ type: 'load', repo: model.repo, dtype: model.dtype });
      }),
    segment: (rgba, w, h) =>
      new Promise<Matte>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: 'segment', id, w, h, rgba }, [rgba.buffer]);
      }),
    dispose: () => worker.terminate(),
  };
}

export type Stage =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'model'; fraction: number }
  | { kind: 'outline' }
  | { kind: 'done' };

export const stageText = (s: Stage): string | null =>
  s.kind === 'reading'
    ? 'Reading the picture…'
    : s.kind === 'model'
      ? s.fraction >= 0.995
        ? 'Starting the model… (this takes a few seconds)'
        : `Getting the model… ${Math.round(s.fraction * 100)}%`
      : s.kind === 'outline'
        ? 'Finding the outline…'
        : null;

export const stageFraction = (s: Stage): number | null => (s.kind === 'model' ? s.fraction : null);

/** Anything the browser can decode into a picture: a file, or an already-decoded bitmap. */
export type PictureSource = Blob | ImageBitmap;

export interface Decoded {
  /** The working picture. */
  picture: Rgba;
  /** The same picture shrunk for the model. */
  small: Rgba;
  /** The source's own width, to tell the shrink. */
  sourceWidth: number;
}

const canvasOf = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** Frees a canvas's pixel memory now instead of when the garbage collector gets to it. */
export function releaseCanvas(c: HTMLCanvasElement | null | undefined): void {
  if (c) c.width = c.height = 0;
}

/**
 * Decodes the source (createImageBitmap: https://developer.mozilla.org/docs/Web/API/Window/createImageBitmap),
 * draws it at the working size and again at the model's size, and lets the bitmap go.
 */
export async function decodeForCutout(src: PictureSource, model: CutoutModel): Promise<Decoded> {
  const bitmap = src instanceof Blob ? await createImageBitmap(src) : src;
  try {
    const work = fitInside(bitmap.width, bitmap.height, MAX_SIDE);
    const big = canvasOf(work.w, work.h);
    big.getContext('2d')!.drawImage(bitmap, 0, 0, work.w, work.h);
    const picture = big.getContext('2d')!.getImageData(0, 0, work.w, work.h);
    const sm = fitInside(work.w, work.h, model.inputMax);
    const little = canvasOf(sm.w, sm.h);
    little.getContext('2d')!.drawImage(big, 0, 0, sm.w, sm.h);
    const small = little.getContext('2d')!.getImageData(0, 0, sm.w, sm.h);
    releaseCanvas(big);
    releaseCanvas(little);
    return {
      picture: { w: work.w, h: work.h, data: picture.data },
      small: { w: sm.w, h: sm.h, data: small.data },
      sourceWidth: bitmap.width,
    };
  } finally {
    if (src instanceof Blob) bitmap.close();
  }
}

/** A canvas holding these pixels. */
export function rgbaToCanvas(p: Rgba): HTMLCanvasElement {
  const c = canvasOf(p.w, p.h);
  // new ImageData(data, w, h): https://developer.mozilla.org/docs/Web/API/ImageData/ImageData
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
  return c;
}

export function canvasToRgba(c: HTMLCanvasElement): Rgba {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  return { w: d.width, h: d.height, data: d.data };
}

/** A PNG (with its transparency) of the canvas. */
export const canvasToPng = (c: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be written as a PNG.'))), 'image/png'));

export interface Cutout {
  matte: Matte;
  picture: HTMLCanvasElement;
  cutout: HTMLCanvasElement;
  width: number;
  height: number;
  scale: number;
}

export interface Deps {
  makeSegmenter?: () => Segmenter;
  decode?: (src: PictureSource, model: CutoutModel) => Promise<Decoded>;
  toCanvas?: (p: Rgba) => HTMLCanvasElement;
}

export interface Options extends Deps {
  model?: CutoutModel;
  signal?: AbortSignal;
  onStage?: (s: Stage) => void;
}

const aborted = (): DOMException => new DOMException('Cancelled.', 'AbortError');

/** See the header for the contract. */
export async function removeBackground(src: PictureSource, o: Options = {}): Promise<Cutout> {
  const model = o.model ?? CUTOUT_MODELS[0]!;
  const decode = o.decode ?? decodeForCutout;
  const toCanvas = o.toCanvas ?? rgbaToCanvas;
  const make = o.makeSegmenter ?? createCutoutClient;
  const stage = o.onStage ?? (() => {});
  if (o.signal?.aborted) throw aborted();

  stage({ kind: 'reading' });
  const { picture, small, sourceWidth } = await decode(src, model);
  if (o.signal?.aborted) throw aborted();

  const seg = make();
  let stop: (() => void) | undefined;
  // Aborting ends the worker at once (a download or a run cannot otherwise be interrupted) and settles the race below.
  const cancelled = new Promise<never>((_, reject) => {
    stop = () => {
      seg.dispose();
      reject(aborted());
    };
    o.signal?.addEventListener('abort', stop);
  });
  cancelled.catch(() => {});
  try {
    stage({ kind: 'model', fraction: 0 });
    await Promise.race([seg.load(model, (p) => stage({ kind: 'model', fraction: p.fraction })), cancelled]);
    stage({ kind: 'outline' });
    const raw = await Promise.race([seg.segment(small.data, small.w, small.h), cancelled]);
    const matte = resizeMatte(raw, picture.w, picture.h);
    const cutout = toCanvas(applyMatte(picture, matte));
    const pictureCanvas = toCanvas(picture);
    stage({ kind: 'done' });
    return { matte, picture: pictureCanvas, cutout, width: picture.w, height: picture.h, scale: picture.w / sourceWidth };
  } finally {
    if (stop) o.signal?.removeEventListener('abort', stop);
    seg.dispose();
  }
}

/**
 * The final cut-out canvas from the working picture and the (refined) matte,
 * and where it sits in the picture. With `trim`, only the subject's box.
 */
export function buildCutout(picture: HTMLCanvasElement, matte: Matte, finish: Finish = {}, toCanvas: (p: Rgba) => HTMLCanvasElement = rgbaToCanvas, read: (c: HTMLCanvasElement) => Rgba = canvasToRgba): { canvas: HTMLCanvasElement; box: Box; matte: Matte } {
  const f = finishCutout(read(picture), matte, finish);
  return { canvas: toCanvas(f.rgba), box: f.box, matte: f.matte };
}
