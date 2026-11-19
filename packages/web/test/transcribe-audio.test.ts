import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_MINUTES, MAX_MINUTES_LOW_MEMORY, maxMinutes } from '../src/transcribe/audio.ts';
import { createWhisperClient } from '../src/transcribe/client.ts';

afterEach(() => vi.unstubAllGlobals());

describe('maxMinutes', () => {
  it('takes less on a device that says it has little memory, and the full hour elsewhere', () => {
    expect(maxMinutes(2)).toBe(MAX_MINUTES_LOW_MEMORY);
    expect(maxMinutes(4)).toBe(MAX_MINUTES_LOW_MEMORY);
    expect(maxMinutes(8)).toBe(MAX_MINUTES);
    expect(maxMinutes(undefined)).toBe(MAX_MINUTES); // browsers that do not say
  });
});

describe('createWhisperClient', () => {
  it('hands the audio to the worker instead of copying it', () => {
    const posted: { message: unknown; transfer?: Transferable[] }[] = [];
    vi.stubGlobal('Worker', class { onmessage: unknown = null; postMessage(message: unknown, transfer?: Transferable[]) { posted.push({ message, transfer }); } terminate() {} });
    const client = createWhisperClient();
    const audio = new Float32Array(1000);
    void client.transcribe(audio, 'english');
    expect(posted).toHaveLength(1);
    expect(posted[0]!.transfer).toEqual([audio.buffer]);
    expect(audio.length).toBe(1000); // (a real worker would detach it; the stand-in does not)
  });
});
