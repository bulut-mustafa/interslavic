import { describe, expect, it, vi } from 'vitest';
import { MAX_DECODE_BYTES, drawPeaks, peaksFromBuffer, peaksOf, waveformSkipReason, type DecodeEnv, type PcmLike } from '../src/video/waveform.ts';

const pcm = (...channels: number[][]): PcmLike => ({
  numberOfChannels: channels.length,
  length: channels[0]!.length,
  getChannelData: (i) => Float32Array.from(channels[i]!),
});

describe('peaksFromBuffer', () => {
  it('takes the largest absolute sample per bucket', () => {
    const p = peaksFromBuffer(pcm([0, 0.5, -0.9, 0.1, 0, 0, 0.25, -0.25]), 4);
    expect(Array.from(p)).toEqual([0.5, 0.9, 0, 0.25].map(Math.fround));
  });
  it('takes the loudest channel', () => {
    const p = peaksFromBuffer(pcm([0.1, 0.1], [0, -0.8]), 2);
    expect(Array.from(p)).toEqual([Math.fround(0.1), Math.fround(0.8)]);
  });
  it('has exactly the requested buckets, repeats a lone sample when buckets outnumber samples, and clamps to 1', () => {
    expect(peaksFromBuffer(pcm([2, -3]), 5)).toHaveLength(5);
    expect(Math.max(...peaksFromBuffer(pcm([2, -3]), 2))).toBe(1);
    expect(Array.from(peaksFromBuffer(pcm([0.5]), 3))).toEqual([0.5, 0.5, 0.5]);
  });
  it('empty input and non-positive buckets', () => {
    expect(peaksFromBuffer(pcm([]), 4)).toEqual(new Float32Array(4));
    expect(peaksFromBuffer(pcm([1]), 0)).toHaveLength(0);
  });
});

function env(buf: PcmLike | Error): DecodeEnv & { decode: ReturnType<typeof vi.fn> } {
  return { decode: vi.fn(async () => { if (buf instanceof Error) throw buf; return buf; }) };
}
const file = (size = 8) => ({ size, arrayBuffer: async () => new ArrayBuffer(size) }) as unknown as Blob;

describe('peaksOf', () => {
  it('decodes once and returns the peaks', async () => {
    const e = env(pcm([0.5, 0.2, 0.9, 0]));
    const p = await peaksOf(file(), 2, undefined, e);
    expect(Array.from(p)).toEqual([0.5, 0.9].map(Math.fround));
    expect(e.decode).toHaveBeenCalledTimes(1);
  });
  it('skips files over the limit without reading them', async () => {
    const e = env(pcm([1]));
    const big = { size: MAX_DECODE_BYTES + 1, arrayBuffer: vi.fn() } as unknown as Blob;
    expect(await peaksOf(big, 10, undefined, e)).toHaveLength(0);
    expect(big.arrayBuffer).not.toHaveBeenCalled();
    expect(waveformSkipReason(big)).toMatch(/too large/i);
    expect(waveformSkipReason(file())).toBeNull();
  });
  it('gives no peaks for a file with no decodable sound', async () => {
    expect(await peaksOf(file(), 4, undefined, env(new Error('EncodingError')))).toHaveLength(0);
  });
  it('rejects when aborted', async () => {
    const c = new AbortController();
    c.abort();
    await expect(peaksOf(file(), 4, c.signal, env(pcm([1])))).rejects.toThrow(/abort/i);
  });
  it('rejects if aborted while decoding', async () => {
    const c = new AbortController();
    const e: DecodeEnv = { decode: async () => { c.abort(); return pcm([1]); } };
    await expect(peaksOf(file(), 4, c.signal, e)).rejects.toThrow(/abort/i);
  });
});

describe('drawPeaks', () => {
  it('draws one centred bar per pixel column', () => {
    const calls: number[][] = [];
    const ctx = { fillRect: (...a: number[]) => calls.push(a) } as unknown as CanvasRenderingContext2D;
    drawPeaks(ctx, Float32Array.from([1, 0.5, 0]), 3, 10);
    expect(calls).toEqual([[0, 0, 1, 10], [1, 2.5, 1, 5], [2, 5, 1, 0]]);
  });
  it('does nothing for no peaks or no size', () => {
    const fillRect = vi.fn();
    const ctx = { fillRect } as unknown as CanvasRenderingContext2D;
    drawPeaks(ctx, new Float32Array(0), 10, 10);
    drawPeaks(ctx, Float32Array.from([1]), 0, 10);
    expect(fillRect).not.toHaveBeenCalled();
  });
  it('resamples peaks to the width', () => {
    const calls: number[][] = [];
    const ctx = { fillRect: (...a: number[]) => calls.push(a) } as unknown as CanvasRenderingContext2D;
    drawPeaks(ctx, Float32Array.from([1, 0]), 4, 10);
    expect(calls.map((c) => c[3])).toEqual([10, 10, 0, 0]);
  });
});
