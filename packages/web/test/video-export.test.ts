import { describe, expect, it } from 'vitest';
import { pickMimeType } from '../src/video/export.ts';

describe('pickMimeType', () => {
  it('takes the best format the browser can record', () => {
    expect(pickMimeType(() => true)).toBe('video/webm;codecs=vp9,opus');
    expect(pickMimeType((t) => t === 'video/webm' || t === 'video/mp4')).toBe('video/webm');
    expect(pickMimeType((t) => t === 'video/mp4')).toBe('video/mp4');
  });
  it('is null when it can record none', () => {
    expect(pickMimeType(() => false)).toBeNull();
  });
});

import { vi } from 'vitest';
import { exportVideo, type ExportDeps } from '../src/video/export.ts';
import { emptyProject } from '../src/video/project.ts';
import type { Transport, TransportOptions } from '../src/video/contracts.ts';

function rig(opts: { onPlay?: (o: TransportOptions, t: Transport) => void } = {}) {
  const calls: string[] = [];
  let topts!: TransportOptions;
  const track = { stop: () => calls.push('track-stop') };
  const stream = { addTrack: () => calls.push('addTrack'), getTracks: () => [track] } as unknown as MediaStream;
  const ctx2d = new Proxy({ measureText: () => ({ width: 1 }) } as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : () => {}), set: () => true });
  const canvas = { width: 0, height: 0, getContext: () => ctx2d, captureStream: (fps: number) => (calls.push(`capture:${fps}`), stream) } as unknown as HTMLCanvasElement;
  const audio = { resume: async () => {}, close: async () => void calls.push('audio-close'), createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [{}] } }) } as unknown as AudioContext;
  const rec = { state: 'inactive', start() { this.state = 'recording'; calls.push('rec-start'); }, stop() { this.state = 'inactive'; calls.push('rec-stop'); this.ondataavailable?.({ data: new Blob(['x']) }); this.onstop?.(); }, ondataavailable: null as ((e: { data: Blob }) => void) | null, onstop: null as (() => void) | null };
  let transport!: Transport & { time: number };
  const deps: ExportDeps = {
    isTypeSupported: (t) => t === 'video/webm',
    newCanvas: () => canvas,
    newAudio: () => audio,
    newRecorder: ((_s: MediaStream, o: MediaRecorderOptions) => (calls.push(`recorder:${o.mimeType}:${o.videoBitsPerSecond}`), rec)) as never,
    createTransport: (o) => {
      topts = o;
      transport = { time: 0, playing: false, seek: () => {}, play: async () => opts.onPlay?.(topts, transport), pause: () => {}, resync: () => {}, setMasterVolume: (v) => calls.push(`master:${v}`), dispose: () => calls.push('dispose'), picture: () => null };
      return transport;
    },
  };
  return { calls, deps, get opts() { return topts; }, get transport() { return transport; } };
}

const project = { ...emptyProject(), clips: [{ id: 'c', start: 0, end: 4, srcId: 's' }] };
const base = { project, files: { urlOf: () => null }, size: { w: 64, h: 36 } };

describe('exportVideo', () => {
  it('records the transport until it ends, reports progress, and disposes everything', async () => {
    const r = rig({ onPlay: (o, t) => { (t as { time: number }).time = 2; o.hooks.onFrame(); (t as { time: number }).time = 4; o.hooks.onEnded(); } });
    const seen: [number, number][] = [];
    const out = await exportVideo({ ...base, masterVolume: 0.5, onProgress: (a, b) => seen.push([a, b]) }, r.deps);
    expect(out.mime).toBe('video/webm');
    expect(out.blob.size).toBe(1);
    expect(seen[0]).toEqual([2, 4]);
    expect(seen.at(-1)).toEqual([4, 4]);
    expect(r.calls).toContain('capture:30');
    expect(r.calls).toContain('recorder:video/webm:6000000');
    expect(r.calls).toContain('master:0.5');
    expect(r.opts.sink).toBeTruthy();
    expect(r.calls.indexOf('dispose')).toBeLessThan(r.calls.indexOf('audio-close'));
  });

  it('stops, disposes and throws AbortError when aborted', async () => {
    const ctl = new AbortController();
    const r = rig({ onPlay: () => ctl.abort() });
    await expect(exportVideo({ ...base, signal: ctl.signal, onProgress: vi.fn() }, r.deps)).rejects.toMatchObject({ name: 'AbortError' });
    expect(r.calls).toContain('dispose');
    expect(r.calls).toContain('rec-stop');
    expect(r.calls).toContain('audio-close');
  });

  it('disposes the transport when playing fails', async () => {
    const r = rig({ onPlay: () => { throw new Error('boom'); } });
    await expect(exportVideo({ ...base, onProgress: vi.fn() }, r.deps)).rejects.toThrow('boom');
    expect(r.calls).toContain('dispose');
  });

  it('refuses when the browser records nothing, or the edit is empty', async () => {
    const r = rig();
    await expect(exportVideo({ ...base, onProgress: vi.fn() }, { ...r.deps, isTypeSupported: () => false })).rejects.toThrow(/cannot record/);
    await expect(exportVideo({ ...base, project: emptyProject(), onProgress: vi.fn() }, r.deps)).rejects.toThrow(/nothing to export/);
  });
});
