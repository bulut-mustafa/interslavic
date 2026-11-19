import type { Cue } from '../subtitles/srt.ts';
import { decodeAudio as decodeFile } from './audio.ts';
import { createWhisperClient, transcribeAll, type Transcriber } from './client.ts';
import { chunksToCues, splitLong } from './cues.ts';
import { WHISPER_LANGUAGE, type Lang, type WhisperModel } from './models.ts';

/** Where a transcription has got to, for the progress shown to the person. */
export type Stage =
  | { kind: 'idle' }
  | { kind: 'model'; fraction: number }
  | { kind: 'audio' }
  | { kind: 'speech'; done: number; total: number }
  | { kind: 'done' };

export interface Deps {
  makeTranscriber?: () => Transcriber;
  decodeAudio?: typeof decodeFile;
}

/** The share of the work done, 0 to 1, or null while it cannot be told. */
export const stageFraction = (s: Stage): number | null => (s.kind === 'model' ? s.fraction : s.kind === 'speech' ? s.done / Math.max(s.total, 1) : null);

export const stageText = (s: Stage): string | null =>
  s.kind === 'audio'
    ? 'Reading the sound…'
    : s.kind === 'model'
      ? s.fraction >= 0.995
        ? 'Starting the speech model… (this takes a few seconds)'
        : `Getting the speech model… ${Math.round(s.fraction * 100)}%`
      : s.kind === 'speech'
        ? `Transcribing part ${Math.min(s.done + 1, s.total)} of ${s.total}…`
        : null;

/**
 * The speech in an audio or video file as subtitles, on the user's own device:
 * the sound is decoded here, and a Whisper model (downloaded once, then kept by
 * the browser) transcribes it in a worker. Resolves to null when `signal` is
 * aborted, which is not a failure.
 */
export async function transcribeFile(
  file: File,
  o: Deps & { lang: Lang; model: WhisperModel; signal: AbortSignal; onStage: (s: Stage) => void },
): Promise<{ cues: Cue[]; seconds: number } | null> {
  const decode = o.decodeAudio ?? decodeFile;
  const make = o.makeTranscriber ?? createWhisperClient;
  o.onStage({ kind: 'audio' });
  const { samples, seconds } = await decode(file);
  if (o.signal.aborted) return null;

  const transcriber = make();
  const stop = () => transcriber.dispose();
  o.signal.addEventListener('abort', stop);
  try {
    o.onStage({ kind: 'model', fraction: 0 });
    await transcriber.load(o.model.repo, (p) => o.onStage({ kind: 'model', fraction: p.fraction }));
    if (o.signal.aborted) return null;
    const chunks = await transcribeAll(samples, transcriber, {
      language: WHISPER_LANGUAGE[o.lang],
      signal: o.signal,
      onSegment: (done, total) => o.onStage({ kind: 'speech', done, total }),
    });
    if (o.signal.aborted) return null;
    return { cues: chunksToCues(splitLong(chunks), seconds), seconds };
  } finally {
    o.signal.removeEventListener('abort', stop);
    transcriber.dispose();
  }
}
