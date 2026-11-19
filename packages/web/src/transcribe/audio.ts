import { mixToMonoInPlace } from './cues.ts';
import { SAMPLE_RATE } from './client.ts';

/** Largest file read into memory: its decoded audio is far bigger than the file. */
export const MAX_FILE_MB = 200;
/** Longest recording accepted, in minutes, on a device with plenty of memory. */
export const MAX_MINUTES = 60;
/** The same on a device that reports little memory: an hour of stereo sound is about 460 MB once decoded. */
export const MAX_MINUTES_LOW_MEMORY = 30;

/** How long a recording this device is asked to take. `deviceMemory` (in GB) is reported by Chromium browsers only; elsewhere the full limit applies. */
export function maxMinutes(deviceMemoryGb: number | undefined = (navigator as { deviceMemory?: number }).deviceMemory): number {
  return deviceMemoryGb !== undefined && deviceMemoryGb <= 4 ? MAX_MINUTES_LOW_MEMORY : MAX_MINUTES;
}

/** The audio track of a sound or video file, as the mono 16 kHz samples Whisper expects. */
export async function decodeAudio(file: File): Promise<{ samples: Float32Array; seconds: number }> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`This file is larger than ${MAX_FILE_MB} MB. Cut it shorter, or extract its audio, and try again.`);
  }
  const limit = maxMinutes();
  // The file's bytes are handed to the decoder, which takes them over: after this line the page holds only the decoded sound.
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration > limit * 60) {
      throw new Error(`This recording is longer than ${limit} minutes. Split it and transcribe the parts.`);
    }
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    return { samples: mixToMonoInPlace(channels), seconds: decoded.duration };
  } catch (err) {
    if (err instanceof Error && /larger|longer/.test(err.message)) throw err;
    throw new Error('The browser could not read the sound in this file. Try an .mp3, .wav, .m4a, .mp4 or .webm file.');
  } finally {
    void ctx.close();
  }
}
