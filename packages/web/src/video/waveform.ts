/**
 * Waveform peaks for the timeline. The file is decoded once, reduced to
 * `buckets` numbers and the decoded audio is dropped. Limits and what was
 * checked: docs/ideas/video-research-audio.md.
 */

/** The part of an AudioBuffer that is read. */
export interface PcmLike {
  numberOfChannels: number;
  length: number;
  getChannelData(channel: number): Float32Array;
}

export interface DecodeEnv {
  /** Decodes a complete file's bytes. */
  decode(data: ArrayBuffer): Promise<PcmLike>;
}

/** Decode at the lowest rate every browser must support (MDN: OfflineAudioContext, 8000 Hz to 96000 Hz): decodeAudioData resamples to the context's rate, so this cuts the decoded size by 5.5x against 44.1 kHz. */
export const DECODE_RATE = 8000;

/**
 * Files above this are not decoded. decodeAudioData needs the complete file and
 * the whole decoded result in memory (MDN, Web Audio spec); the decoded size
 * depends on the sound's length, which is unknown before decoding, so the
 * file size is the only cheap guard. At 8 kHz stereo float32 a decoded second
 * is 64 KB; 150 MB of file is a worst case of hours of low-bitrate sound. This
 * number is a judgement, not a browser limit.
 */
export const MAX_DECODE_BYTES = 150 * 1024 * 1024;

export const waveformSkipReason = (file: Pick<Blob, 'size'>): string | null =>
  file.size > MAX_DECODE_BYTES ? `The file is too large to draw a waveform for (over ${MAX_DECODE_BYTES / 1024 / 1024} MB).` : null;

const defaultEnv: DecodeEnv = {
  decode: (data) => new OfflineAudioContext(1, 1, DECODE_RATE).decodeAudioData(data),
};

/** Largest absolute sample over all channels in each of `buckets` equal slices. One channel is read at a time; nothing else is copied. */
export function peaksFromBuffer(pcm: PcmLike, buckets: number): Float32Array {
  const n = Math.max(0, Math.floor(buckets));
  const out = new Float32Array(n);
  if (n === 0 || pcm.length === 0) return out;
  const per = pcm.length / n;
  for (let ch = 0; ch < pcm.numberOfChannels; ch++) {
    const data = pcm.getChannelData(ch);
    for (let b = 0; b < n; b++) {
      const from = Math.floor(b * per);
      const to = Math.min(Math.max(Math.floor((b + 1) * per), from + 1), data.length);
      let peak = out[b]!;
      for (let i = from; i < to; i++) {
        const v = Math.abs(data[i]!);
        if (v > peak) peak = v;
      }
      out[b] = Math.min(peak, 1);
    }
  }
  return out;
}

const aborted = () => new DOMException('The waveform was aborted.', 'AbortError');

/**
 * Peaks of the file's sound, `buckets` values 0..1. Resolves to an empty array
 * when the file is over MAX_DECODE_BYTES (not read at all) or has no sound the
 * browser can decode (decodeAudioData rejects with EncodingError). Rejects
 * with an AbortError when `signal` aborts.
 */
export async function peaksOf(file: Blob, buckets: number, signal?: AbortSignal, env: DecodeEnv = defaultEnv): Promise<Float32Array> {
  if (waveformSkipReason(file)) return new Float32Array(0);
  if (signal?.aborted) throw aborted();
  const data = await file.arrayBuffer();
  if (signal?.aborted) throw aborted();
  let pcm: PcmLike;
  try {
    pcm = await env.decode(data);
  } catch {
    if (signal?.aborted) throw aborted();
    return new Float32Array(0);
  }
  if (signal?.aborted) throw aborted();
  return peaksFromBuffer(pcm, buckets);
}

/** Draws mirrored bars centred on the middle of a `w` x `h` area, one per pixel column, in the context's current fillStyle. */
export function drawPeaks(ctx: CanvasRenderingContext2D, peaks: Float32Array, w: number, h: number): void {
  if (peaks.length === 0 || w <= 0 || h <= 0) return;
  const cols = Math.floor(w);
  for (let x = 0; x < cols; x++) {
    const from = Math.floor((x * peaks.length) / cols);
    const to = Math.max(Math.floor(((x + 1) * peaks.length) / cols), from + 1);
    let p = 0;
    for (let i = from; i < to && i < peaks.length; i++) p = Math.max(p, peaks[i]!);
    const bar = p * h;
    ctx.fillRect(x, (h - bar) / 2, 1, bar);
  }
}
