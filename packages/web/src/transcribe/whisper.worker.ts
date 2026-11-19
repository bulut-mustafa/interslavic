/**
 * Runs Whisper in a worker, so the page stays usable while a model loads and
 * audio is transcribed. Everything happens on the user's device.
 */
import { pipeline } from '@huggingface/transformers';

type In =
  | { type: 'load'; repo: string }
  | { type: 'transcribe'; id: number; audio: Float32Array; language: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asr: any = null;
const post = (m: unknown): void => (self as unknown as { postMessage(m: unknown): void }).postMessage(m);

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      // 8-bit quantised weights: the smaller download, and the default for the WebAssembly backend.
      asr = await pipeline('automatic-speech-recognition', m.repo, {
        dtype: 'q8',
        progress_callback: (p: unknown) => post({ type: 'progress', p }),
      });
      post({ type: 'ready' });
    } else {
      // Times for stretches of speech, not for single words: the models offered here are not exported with the attention data
      // that word times need (tried: transformers.js says so, and only after the whole transcription has run). A stretch
      // too long for a subtitle is cut at its sentence ends afterwards (cues.ts: splitLong).
      const out = await asr(m.audio, {
        language: m.language,
        task: 'transcribe',
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const chunks = out.chunks ?? [];
      post({ type: 'done', id: m.id, chunks });
    }
  } catch (err) {
    post({ type: 'error', id: m.type === 'transcribe' ? m.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
