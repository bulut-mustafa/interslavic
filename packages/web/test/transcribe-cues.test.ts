import { describe, expect, it } from 'vitest';
import { chunksToCues, mixToMono, quietCuts, srtTime } from '../src/transcribe/cues.ts';
import { formatSrt, parseSrt } from '../src/subtitles/srt.ts';

describe('srtTime', () => {
  it('formats hours, minutes, seconds and milliseconds', () => {
    expect(srtTime(0)).toBe('00:00:00,000');
    expect(srtTime(1.5)).toBe('00:00:01,500');
    expect(srtTime(3725.5)).toBe('01:02:05,500');
    expect(srtTime(59.9996)).toBe('00:01:00,000'); // rounds into the next second, not "60,000"
    expect(srtTime(-3)).toBe('00:00:00,000');
  });
});

describe('chunksToCues', () => {
  it('turns chunks into numbered cues with SRT timing', () => {
    const cues = chunksToCues([{ text: ' Hello there. ', timestamp: [0, 2.5] }, { text: 'Bye.', timestamp: [3, 4] }], 10);
    expect(cues).toEqual([
      { index: 1, timing: '00:00:00,000 --> 00:00:02,500', lines: ['Hello there.'] },
      { index: 2, timing: '00:00:03,000 --> 00:00:04,000', lines: ['Bye.'] },
    ]);
  });

  it('drops empty text and collapses stray whitespace', () => {
    const cues = chunksToCues([{ text: '  ', timestamp: [0, 1] }, { text: 'a \n b', timestamp: [1, 2] }], 5);
    expect(cues.map((c) => c.lines)).toEqual([['a b']]);
    expect(cues[0]!.index).toBe(1);
  });

  it('ends a cue with no end at the end of the audio', () => {
    expect(chunksToCues([{ text: 'x', timestamp: [8, null] }], 10)[0]!.timing).toBe('00:00:08,000 --> 00:00:10,000');
  });

  it('never lets a cue run into the next one', () => {
    const [a] = chunksToCues([{ text: 'a', timestamp: [0, 5] }, { text: 'b', timestamp: [3, 6] }], 10);
    expect(a!.timing).toBe('00:00:00,000 --> 00:00:03,000');
  });

  it('stretches a cue too short to read, but not past the next cue', () => {
    const cues = chunksToCues([{ text: 'a', timestamp: [0, 0.1] }, { text: 'b', timestamp: [0.3, 2] }], 5);
    expect(cues[0]!.timing).toBe('00:00:00,000 --> 00:00:00,300');
    expect(cues[1]!.timing).toBe('00:00:00,300 --> 00:00:02,000');
  });

  it('writes a file that reads back as the same cues', () => {
    const cues = chunksToCues([{ text: 'Hi.', timestamp: [0, 1] }, { text: 'Yo.', timestamp: [2, 3] }], 5);
    expect(parseSrt(formatSrt(cues))).toEqual(cues);
  });

  it('puts out-of-order chunks in time order', () => {
    expect(chunksToCues([{ text: 'b', timestamp: [2, 3] }, { text: 'a', timestamp: [0, 1] }], 5).map((c) => c.lines[0])).toEqual(['a', 'b']);
  });
});

describe('quietCuts', () => {
  const rate = 100;
  /** Loud everywhere except a silent second centred a little past each 10 s mark. */
  const signal = (seconds: number, silences: number[]): Float32Array => {
    const s = new Float32Array(seconds * rate).fill(0.5);
    for (const at of silences) s.fill(0, Math.round(at * rate), Math.round((at + 1) * rate));
    return s;
  };

  it('cuts in the silence near each target, not exactly on it', () => {
    const cuts = quietCuts(signal(40, [12, 22]), rate, 10, 5);
    expect(cuts).toHaveLength(3); // 40 s in segments of about 10 s
    expect(cuts[0]! / rate).toBeGreaterThanOrEqual(12);
    expect(cuts[0]! / rate).toBeLessThanOrEqual(13);
    expect(cuts[1]! / rate).toBeGreaterThanOrEqual(22);
    expect(cuts[1]! / rate).toBeLessThanOrEqual(23);
  });

  it('does not cut audio shorter than one segment', () => {
    expect(quietCuts(signal(8, []), rate, 10, 5)).toEqual([]);
  });

  it('gives strictly increasing cuts inside the audio', () => {
    const s = signal(100, []);
    const cuts = quietCuts(s, rate, 10, 2);
    expect(cuts.every((c, i) => c > (cuts[i - 1] ?? 0) && c < s.length)).toBe(true);
  });
});

describe('mixToMono', () => {
  it('averages the channels', () => {
    expect([...mixToMono([Float32Array.from([1, 0]), Float32Array.from([0, 1])])]).toEqual([0.5, 0.5]);
  });
  it('leaves one channel as it is', () => {
    const one = Float32Array.from([0.25, -0.5]);
    expect(mixToMono([one])).toBe(one);
  });
});

describe('mixToMonoInPlace', () => {
  it('gives the same mix as mixToMono, without making a new array', async () => {
    const { mixToMonoInPlace } = await import('../src/transcribe/cues.ts');
    const a = Float32Array.from([1, 0, 0.5]);
    const b = Float32Array.from([0, 1, 0.5]);
    const c = Float32Array.from([0, 0, 0.5]);
    const out = mixToMonoInPlace([a, b, c]);
    expect(out).toBe(a); // the first channel is reused
    expect([...out].map((v) => Math.round(v * 1000) / 1000)).toEqual([0.333, 0.333, 0.5]);
  });
  it('leaves one channel alone', async () => {
    const { mixToMonoInPlace } = await import('../src/transcribe/cues.ts');
    const one = Float32Array.from([1, 2]);
    expect(mixToMonoInPlace([one])).toBe(one);
  });
});

const w = (text: string, a: number, b: number | null) => ({ text, timestamp: [a, b] as [number, number | null] });

describe('splitLong', () => {
  const long = 'Welcome to our shop. We open every day at nine in the morning and close at five. Come and see all of our new things today.';

  it('cuts a long stretch at sentence ends, sharing its time out by length', async () => {
    const { splitLong, MAX_CUE_CHARS } = await import('../src/transcribe/cues.ts');
    const out = splitLong([w(long, 0, 12)]);
    expect(out.length).toBeGreaterThan(1);
    expect(out.map((c) => c.text).join(' ')).toBe(long); // the same words, nothing added or lost
    for (const c of out) expect(c.text.length).toBeLessThanOrEqual(MAX_CUE_CHARS);
    expect(out[0]!.timestamp[0]).toBe(0);
    expect(out.at(-1)!.timestamp[1]).toBeCloseTo(12, 5);
    for (let i = 1; i < out.length; i++) expect(out[i]!.timestamp[0]).toBeCloseTo(out[i - 1]!.timestamp[1]!, 5); // joined end to end
  });

  it('leaves a stretch that is short enough exactly as it is', async () => {
    const { splitLong } = await import('../src/transcribe/cues.ts');
    const short = w(' Hello there.', 0, 2);
    expect(splitLong([short])).toEqual([short]);
  });

  it('leaves one with no end time alone, since there is nothing to share out', async () => {
    const { splitLong } = await import('../src/transcribe/cues.ts');
    expect(splitLong([w(long, 0, null)])).toHaveLength(1);
  });

  it('cuts a long sentence with no full stop between words', async () => {
    const { splitLong, MAX_CUE_CHARS } = await import('../src/transcribe/cues.ts');
    const run = Array.from({ length: 40 }, (_, i) => 'word' + i).join(' ');
    const out = splitLong([w(run, 0, 30)]);
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.text.length).toBeLessThanOrEqual(MAX_CUE_CHARS);
    expect(out.map((c) => c.text).join(' ')).toBe(run);
  });
});
