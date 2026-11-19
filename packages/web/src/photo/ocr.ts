/**
 * Reading text out of a photo, on the user's device. The OCR library is loaded
 * only when a photo is read, so it adds nothing to the other pages.
 */

export type OcrLang = 'en' | 'ru' | 'uk';

/** Tesseract's names for the languages. */
export const TESSERACT_LANG: Record<OcrLang, string> = { en: 'eng', ru: 'rus', uk: 'ukr' };

export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrSymbol {
  text: string;
  bbox: OcrBox;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: OcrBox;
  /** The letters of the word, each where it sits, when the reader gives them. */
  symbols?: OcrSymbol[];
}

export interface OcrLine {
  text: string;
  /** The words of the line, each where it sits; when a reader gives none they are worked out from the line. */
  words?: OcrWord[];
  /** The OCR's own estimate, 0-100, of how sure it is of this line. */
  confidence: number;
  /** Where the line sits in the picture, in pixels. */
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrResult {
  text: string;
  /** The OCR's own estimate, 0-100, of how sure it is of what it read. */
  confidence: number;
  lines: OcrLine[];
}

export interface Recognizer {
  recognize(image: Blob, lang: OcrLang, onProgress: (fraction: number, status: string) => void): Promise<OcrResult>;
  /** Starts getting ready in the background (the engine and the language's data are a download), so the first picture does not wait for it. */
  warm?(lang: OcrLang): void;
}

/** What is needed of tesseract.js, so the pool can be tested without it. */
export interface WorkerLike {
  recognize(image: Blob, options: object, output: object): Promise<{ data: { text: string; confidence: number; blocks?: unknown } }>;
  terminate(): Promise<unknown>;
}
export interface TesseractLike {
  createWorker(lang: string, oem: number, options: { logger: (m: { progress: number; status: string }) => void }): Promise<WorkerLike>;
}

export interface PoolOptions {
  /** How long an unused worker is kept before it is shut down and its memory given back. */
  idleMs?: number;
  /** After this many pictures the worker is replaced: its memory grows with the largest picture it has seen and never shrinks. */
  maxJobs?: number;
}

/**
 * One OCR worker, shared by every picture. Creating a worker fetches the engine
 * and the language's data and starts a WebAssembly instance, so it is made once,
 * reused, shut down after a quiet spell, and replaced after a number of jobs
 * (tesseract.js advises reusing workers but not keeping one for ever, and a
 * worker's memory only grows). Pictures are read one at a time: a worker does
 * one at a time anyway, and several workers cost memory for no speed on one CPU.
 */
export function createOcrPool(load: () => Promise<TesseractLike>, convert: (data: { text: string; confidence: number; blocks?: unknown }) => OcrResult, options: PoolOptions = {}): Recognizer {
  const idleMs = options.idleMs ?? 90_000;
  const maxJobs = options.maxJobs ?? 25;
  let current: { lang: OcrLang; worker: Promise<WorkerLike>; jobs: number } | null = null;
  let idle: ReturnType<typeof setTimeout> | null = null;
  let progress: ((fraction: number, status: string) => void) | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  const stop = () => {
    if (idle) clearTimeout(idle);
    idle = null;
    const old = current;
    current = null;
    void old?.worker.then((w) => w.terminate()).catch(() => undefined);
  };
  const rest = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(stop, idleMs);
  };
  const ensure = (lang: OcrLang) => {
    if (current && current.lang !== lang) stop(); // another language needs another worker
    if (idle) clearTimeout(idle);
    current ??= {
      lang,
      jobs: 0,
      worker: load().then((t) => t.createWorker(TESSERACT_LANG[lang], 1, { logger: (m) => progress?.(m.progress, m.status) })),
    };
    // A worker that could not be made is not kept: the next picture tries afresh.
    const made = current;
    made.worker.catch(() => {
      if (current === made) current = null;
    });
    return made;
  };

  return {
    warm(lang) {
      ensure(lang);
      rest();
    },
    recognize(image, lang, onProgress) {
      const job = chain.then(async () => {
        const mine = ensure(lang);
        progress = onProgress;
        try {
          const worker = await mine.worker;
          const { data } = await worker.recognize(image, {}, { blocks: true });
          mine.jobs++;
          if (mine.jobs >= maxJobs) stop();
          else rest();
          return convert(data);
        } catch (e) {
          stop(); // after a failure the worker's state cannot be trusted
          throw e;
        } finally {
          progress = null;
        }
      });
      chain = job.catch(() => undefined);
      return job;
    },
  };
}

interface RawLine {
  text: string;
  confidence: number;
  bbox: OcrBox;
  words: OcrWord[];
}
interface RawBlock {
  paragraphs: { lines: RawLine[] }[];
}

/** Turns tesseract's result into the editor's: lines of words of letters, each with where it sits. */
const convertResult = (data: { text: string; confidence: number; blocks?: unknown }): OcrResult => {
  const blocks = (data.blocks ?? []) as RawBlock[];
  const lines: OcrLine[] = blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines)).map((l) => ({
    text: l.text.replace(/\s+/g, ' ').trim(),
    confidence: l.confidence,
    bbox: l.bbox,
    words: l.words.map((w) => ({ text: w.text, confidence: w.confidence, bbox: w.bbox, symbols: w.symbols?.map((y) => ({ text: y.text, bbox: y.bbox })) })),
  }));
  return { text: data.text, confidence: data.confidence, lines };
};

export const tesseractRecognizer: Recognizer = createOcrPool(() => import('tesseract.js') as unknown as Promise<TesseractLike>, convertResult);

/** Line breaks inside a paragraph are the page's layout, not the sentence's: join them. */
export function tidy(text: string): string {
  return text
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((p) => p.replace(/-\n(?=\p{Ll})/gu, '').replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}
