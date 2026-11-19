/**
 * Runs a background-removal model in a worker, so the page stays usable while
 * the model downloads and the picture is worked on. Everything happens on the
 * user's device. Same shape as transcribe/whisper.worker.ts.
 *
 * Transformers.js: `pipeline('background-removal', repo)` returns a function that
 * takes an image and gives back the same image as RGBA with the model's mask in
 * the alpha channel, at the input image's size
 * (node_modules/@huggingface/transformers/src/pipelines/background-removal.js;
 * https://huggingface.co/docs/transformers.js/api/pipelines#module_pipelines.BackgroundRemovalPipeline).
 */
import { pipeline, RawImage } from '@huggingface/transformers';

type In =
  | { type: 'load'; repo: string; dtype: 'q8' | 'fp32' }
  | { type: 'segment'; id: number; w: number; h: number; rgba: Uint8ClampedArray };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let segmenter: any = null;
const post = (m: unknown, transfer: Transferable[] = []): void =>
  (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(m, transfer);

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      segmenter = await pipeline('background-removal', m.repo, {
        dtype: m.dtype,
        progress_callback: (p: unknown) => post({ type: 'progress', p }),
      });
      post({ type: 'ready' });
    } else {
      const out = await segmenter(new RawImage(m.rgba, m.w, m.h, 4));
      // Only the mask goes back (one byte a pixel), not the picture the page already has.
      const alpha = new Uint8ClampedArray(out.width * out.height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = out.data[i * out.channels + 3];
      post({ type: 'done', id: m.id, w: out.width, h: out.height, alpha }, [alpha.buffer]);
    }
  } catch (err) {
    post({ type: 'error', id: m.type === 'segment' ? m.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
