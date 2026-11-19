import { drawFrame } from './compositor.ts';
import type { CreateTransport, SourceFiles, Transport } from './contracts.ts';
import { editLength, type VideoProject } from './project.ts';
import { total } from './timeline.ts';
import { createTransport } from './transport.ts';

/** The recording formats to try, best first. */
const TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

export const pickMimeType = (isSupported: (type: string) => boolean): string | null => TYPES.find(isSupported) ?? null;

export interface ExportOptions {
  project: VideoProject;
  files: SourceFiles;
  /** The finished frame, in pixels. */
  size: { w: number; h: number };
  /** How loud everything is, 0 to 1; full when left out. Per-clip and per-layer volume live in the project. */
  masterVolume?: number;
  fps?: number;
  signal?: AbortSignal;
  onProgress: (seconds: number, of: number) => void;
}

/** The browser pieces the export touches, so tests can stand in for them. */
export interface ExportDeps {
  createTransport?: CreateTransport;
  isTypeSupported?: (type: string) => boolean;
  newCanvas?: () => HTMLCanvasElement;
  newAudio?: () => AudioContext;
  newRecorder?: (stream: MediaStream, o: MediaRecorderOptions) => MediaRecorder;
}

/**
 * Renders the edit to a new video, in the browser. One Transport plays the
 * whole edit (every source, every overlay) with its sound routed into a
 * recording destination instead of the speakers; each frame it reports is
 * drawn by the compositor onto an off-screen canvas, and the canvas plus that
 * sound are recorded. It runs at the edit's own speed - a one-minute edit
 * takes a minute - and the tab must stay visible, because browsers pause
 * animation frames in background tabs (MDN, requestAnimationFrame).
 */
export async function exportVideo(o: ExportOptions, deps: ExportDeps = {}): Promise<{ blob: Blob; mime: string }> {
  const supported = deps.isTypeSupported ?? ((t: string) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
  const mime = pickMimeType(supported);
  if (!mime) throw new Error('This browser cannot record video. Try Chrome, Edge or Firefox.');

  const length = editLength(o.project, total(o.project.clips));
  if (length <= 0) throw new Error('There is nothing to export yet.');

  const canvas = deps.newCanvas?.() ?? document.createElement('canvas');
  canvas.width = o.size.w;
  canvas.height = o.size.h;
  const ctx = canvas.getContext('2d')!;
  const stream = canvas.captureStream(o.fps ?? 30);

  // The sound goes to the recording only, not to the speakers.
  const audio = deps.newAudio?.() ?? new AudioContext();
  const dest = audio.createMediaStreamDestination();
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

  let transport: Transport | null = null;
  let recorder: MediaRecorder | null = null;
  let stopped: Promise<void> = Promise.resolve();
  const chunks: Blob[] = [];
  try {
    await audio.resume();
    let finish!: () => void;
    const ended = new Promise<void>((resolve) => (finish = resolve));
    o.signal?.addEventListener('abort', finish, { once: true });

    const draw = () => {
      if (!transport) return;
      drawFrame(ctx, { project: o.project, time: transport.time, size: o.size, media: transport });
      o.onProgress(Math.min(transport.time, length), length);
    };
    transport = (deps.createTransport ?? createTransport)({
      getProject: () => o.project,
      files: o.files,
      hooks: { onFrame: draw, onEnded: finish },
      sink: { context: audio, destination: dest },
    });
    transport.setMasterVolume(Math.min(Math.max(o.masterVolume ?? 1, 0), 1));

    recorder = deps.newRecorder?.(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 }) ?? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    stopped = new Promise<void>((resolve) => (recorder!.onstop = () => resolve()));
    recorder.start(250);

    transport.seek(0);
    if (!o.signal?.aborted) {
      await transport.play();
      await ended;
    }
    if (!o.signal?.aborted) {
      draw();
      o.onProgress(length, length);
    }
  } finally {
    transport?.dispose();
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else if (!recorder) stopped = Promise.resolve();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    void audio.close();
  }
  if (o.signal?.aborted) throw new DOMException('aborted', 'AbortError');
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), mime };
}
