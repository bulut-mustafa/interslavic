// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import App from '../src/App.tsx';
import Transcribe from '../src/transcribe/Transcribe.tsx';
import { SAMPLE_RATE, transcribeAll, type Transcriber } from '../src/transcribe/client.ts';
import { MODELS } from '../src/transcribe/models.ts';
import { screen } from './live-screen.ts';

const blobs: Blob[] = [];
let downloadName = '';

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/studio/recording');
  blobs.length = 0;
  URL.createObjectURL = (b: Blob | MediaSource) => (blobs.push(b as Blob), 'blob:test');
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloadName = this.download;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const read = (b: Blob): Promise<string> =>
  new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });

const fakeTranscriber = (log: string[] = []): Transcriber => ({
  load: async (repo, onProgress) => {
    log.push(`load ${repo}`);
    onProgress({ fraction: 0.5, file: 'x' });
    onProgress({ fraction: 1, file: 'x' });
  },
  transcribe: async (audio, language) => {
    log.push(`transcribe ${audio.length} ${language}`);
    return [
      { text: ' Hello there. ', timestamp: [0, 2] },
      { text: 'How are you?', timestamp: [2.5, null] },
    ];
  },
  dispose: () => void log.push('dispose'),
});

const decode = async () => ({ samples: new Float32Array(SAMPLE_RATE * 10), seconds: 10 });

async function chooseAndRun(log: string[] = []) {
  render(<Transcribe makeTranscriber={() => fakeTranscriber(log)} decodeAudio={decode} />);
  fireEvent.change(screen.getByLabelText('Audio or video file'), { target: { files: [new File(['x'], 'talk.mp4', { type: 'video/mp4' })] } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Transcribe' }));
  });
  await waitFor(() => expect(screen.getByRole('region', { name: 'Transcript' })).toBeTruthy());
}

describe('the Recording page', () => {
  it('is in the navigation', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Recording' }).getAttribute('aria-current')).toBe('page');
  });

  it('says what is downloaded and from where, and gives the paper\'s error rates for the model', () => {
    render(<Transcribe />);
    const notes = screen.getByRole('region', { name: 'How this works' }).textContent!;
    expect(notes).toContain('huggingface.co');
    expect(notes).toContain('cdn.jsdelivr.net');
    expect(notes).toContain('not your recording');
    const small = MODELS.find((m) => m.id === 'small')!;
    expect(notes).toContain(`${small.downloadMb} MB`);
    expect(notes).toContain(`English ${small.wer.en}%`);
    expect(notes).toContain(`Ukrainian ${small.wer.uk}%`);
  });

  it('changes the figures when another model is chosen', () => {
    render(<Transcribe />);
    fireEvent.change(screen.getByLabelText('Audio or video file'), { target: { files: [new File(['x'], 'talk.mp4', { type: 'video/mp4' })] } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'base' } });
    const notes = screen.getByRole('region', { name: 'How this works' }).textContent!;
    expect(notes).toContain('Ukrainian 37.7%');
  });

  it('offers nothing to run until a file is chosen, then the language, the model and the button', () => {
    render(<Transcribe />);
    expect(screen.queryByRole('button', { name: 'Transcribe' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Audio or video file'), { target: { files: [new File(['x'], 'talk.mp4', { type: 'video/mp4' })] } });
    expect(screen.getByLabelText('Spoken language')).toBeTruthy();
    expect(screen.getByLabelText('Model')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Transcribe' })).toBeTruthy();
  });

  it('transcribes in the chosen language with the chosen model and shows editable subtitles', async () => {
    const log: string[] = [];
    await chooseAndRun(log);
    expect(log[0]).toBe('load onnx-community/whisper-small');
    expect(log[1]).toBe(`transcribe ${SAMPLE_RATE * 10} english`);
    expect(log.at(-1)).toBe('dispose');
    expect((screen.getByLabelText('Subtitle 1') as HTMLTextAreaElement).value).toBe('Hello there.');
    expect((screen.getByLabelText('Subtitle 2') as HTMLTextAreaElement).value).toBe('How are you?');
  });

  it('downloads the corrected text as an .srt with the times kept', async () => {
    await chooseAndRun();
    fireEvent.change(screen.getByLabelText('Subtitle 1'), { target: { value: 'Hello, there.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download .srt' }));
    expect(downloadName).toBe('talk.srt');
    expect(await read(blobs.at(-1)!)).toBe(
      '1\n00:00:00,000 --> 00:00:02,000\nHello, there.\n\n2\n00:00:02,500 --> 00:00:10,000\nHow are you?\n',
    );
  });

  it('hands the transcript to the Subtitles page, filled in and set to the spoken language', async () => {
    await chooseAndRun();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Translate to Interslavic' }));
    });
    expect(window.location.pathname).toBe('/studio/subtitles');
    cleanup();
    render(<App />);
    expect(screen.getByText('talk.srt')).toBeTruthy();
    expect(screen.getByText('2 subtitles found.')).toBeTruthy();
    // taken once: a reload does not bring it back
    expect(window.sessionStorage.getItem('interslavic-handoff-srt')).toBeNull();
  });

  it('shows a plain message when the sound cannot be read', async () => {
    render(<Transcribe makeTranscriber={() => fakeTranscriber()} decodeAudio={async () => { throw new Error('The browser could not read the sound in this file.'); }} />);
    fireEvent.change(screen.getByLabelText('Audio or video file'), { target: { files: [new File(['x'], 'a.bin')] } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Transcribe' }));
    });
    expect(screen.getByText('The browser could not read the sound in this file.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Transcript' })).toBeNull();
  });

  it('says so when no speech was found', async () => {
    render(<Transcribe makeTranscriber={() => ({ ...fakeTranscriber(), transcribe: async () => [] })} decodeAudio={decode} />);
    fireEvent.change(screen.getByLabelText('Audio or video file'), { target: { files: [new File(['x'], 'a.wav')] } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Transcribe' }));
    });
    expect(screen.getByText('No speech was found.')).toBeTruthy();
  });
});

describe('transcribeAll', () => {
  it('puts every segment\'s chunks on the whole recording\'s clock', async () => {
    // 700 s of silence is cut into segments of about 300 s; each reports a chunk at its own 1-2 s.
    const audio = new Float32Array(SAMPLE_RATE * 700);
    const calls: number[] = [];
    const t: Transcriber = {
      load: async () => {},
      transcribe: async (a) => (calls.push(a.length), [{ text: 'x', timestamp: [1, 2] }]),
      dispose: () => {},
    };
    const out = await transcribeAll(audio, t, { language: 'english' });
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.reduce((n, c) => n + c, 0)).toBe(audio.length); // every sample goes to exactly one segment
    expect(out).toHaveLength(calls.length);
    expect(out[0]!.timestamp).toEqual([1, 2]);
    const second = out[1]!.timestamp[0];
    expect(second).toBeGreaterThan(290); // second segment starts about 300 s in
    expect(out.map((c) => c.timestamp[0])).toEqual([...out.map((c) => c.timestamp[0])].sort((a, b) => a - b));
  });

  it('stops between segments when cancelled', async () => {
    const ctl = new AbortController();
    const t: Transcriber = {
      load: async () => {},
      transcribe: async () => (ctl.abort(), []),
      dispose: () => {},
    };
    await expect(transcribeAll(new Float32Array(SAMPLE_RATE * 700), t, { language: 'english', signal: ctl.signal })).rejects.toThrow();
  });

  it('plays the recording from a subtitle\'s time, so it can be checked against what was heard', async () => {
    const plays: number[] = [];
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      plays.push(this.currentTime);
      return Promise.resolve();
    } as never;
    await chooseAndRun();
    fireEvent.click(screen.getByRole('button', { name: /Play subtitle 2 from 00:00:02/ }));
    expect(plays).toEqual([2.5]);
  });
});
