import { quietCuts, type Chunk } from './cues.ts';

/**
 * The page's view of the worker: load a model, transcribe audio. A small
 * interface so the page and the segmenting can be tested with a stand-in.
 */

export interface LoadProgress {
  /** 0-1 over every file the model needs, so far as they have been announced. */
  fraction: number;
  file: string;
}

export interface Transcriber {
  load(repo: string, onProgress: (p: LoadProgress) => void): Promise<void>;
  /** Chunks with times relative to the start of `audio`. The audio is handed over to the worker, so the caller must not use it again. */
  transcribe(audio: Float32Array, language: string): Promise<Chunk[]>;
  dispose(): void;
}

export function createWhisperClient(): Transcriber {
  const worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  let nextId = 1;
  const files = new Map<string, { loaded: number; total: number }>();
  const pending = new Map<number, { resolve(c: Chunk[]): void; reject(e: Error): void }>();
  let loading: { resolve(): void; reject(e: Error): void; onProgress(p: LoadProgress): void } | null = null;

  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as
      | { type: 'progress'; p: { status?: string; file?: string; loaded?: number; total?: number } }
      | { type: 'ready' }
      | { type: 'done'; id: number; chunks: Chunk[] }
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
      pending.get(m.id)?.resolve(m.chunks);
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

  return {
    load: (repo, onProgress) =>
      new Promise<void>((resolve, reject) => {
        loading = { resolve, reject, onProgress };
        worker.postMessage({ type: 'load', repo });
      }),
    transcribe: (audio, language) =>
      new Promise<Chunk[]>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        // Handed over, not copied: the segment is a copy made for this call and is not needed here afterwards.
        worker.postMessage({ type: 'transcribe', id, audio, language }, [audio.buffer]);
      }),
    dispose: () => worker.terminate(),
  };
}

export const SAMPLE_RATE = 16000;
/** Audio goes to the model in segments of about this long, each cut at a quiet moment. */
export const SEGMENT_SECONDS = 300;

export interface RunOptions {
  language: string;
  signal?: AbortSignal;
  onSegment?: (done: number, total: number) => void;
}

/** Transcribes long audio segment by segment, putting every chunk on the whole recording's clock. */
export async function transcribeAll(audio: Float32Array, transcriber: Transcriber, opts: RunOptions): Promise<Chunk[]> {
  const cuts = quietCuts(audio, SAMPLE_RATE, SEGMENT_SECONDS);
  const bounds = [0, ...cuts, audio.length];
  const out: Chunk[] = [];
  opts.onSegment?.(0, bounds.length - 1);
  for (let i = 0; i < bounds.length - 1; i++) {
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const offset = bounds[i]! / SAMPLE_RATE;
    const chunks = await transcriber.transcribe(audio.slice(bounds[i]!, bounds[i + 1]!), opts.language);
    for (const c of chunks) {
      out.push({ text: c.text, timestamp: [c.timestamp[0] + offset, c.timestamp[1] === null ? null : c.timestamp[1] + offset] });
    }
    opts.onSegment?.(i + 1, bounds.length - 1);
  }
  return out;
}
