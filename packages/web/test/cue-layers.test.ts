import { describe, expect, it } from 'vitest';
import { layersFromCues } from '../src/video/cue-layers.ts';
import { parseSrt } from '../src/subtitles/srt.ts';
import type { Clip } from '../src/video/timeline.ts';

const c = (id: string, start: number, end: number): Clip => ({ id, start, end });
const frame = { w: 1280, h: 720 };
const cues = parseSrt(`1
00:00:01,000 --> 00:00:03,000
Dobry denj.

2
00:00:12,000 --> 00:00:14,000
<i>Hvala</i> {\\an8}vam.
mnogo

3
00:00:30,000 --> 00:00:31,000
Cut out.
`);

describe('layersFromCues', () => {
  it('turns each subtitle into text near the bottom of the frame, shown for its time', () => {
    const { layers } = layersFromCues(cues.slice(0, 1), [c('a', 0, 60)], frame);
    expect(layers).toHaveLength(1);
    expect(layers[0]).toMatchObject({ text: 'Dobry denj.', start: 1 });
    expect(layers[0]!.end).toBeCloseTo(3, 1);
    expect(layers[0]!.y).toBeGreaterThan(frame.h / 2);
    expect(layers[0]!.maxWidth).toBeCloseTo(frame.w * 0.84);
  });

  it('strips display markup and keeps line breaks', () => {
    const { layers } = layersFromCues([cues[1]!], [c('a', 0, 60)], frame);
    expect(layers[0]!.text).toBe('Hvala vam.\nmnogo');
  });

  it('puts a subtitle where its part of the video now plays, and leaves out what was cut', () => {
    // the first 10 s were removed, so the 12 s subtitle is now at 2 s; the 30 s one is outside the kept clip
    const { layers, left } = layersFromCues(cues, [c('a', 10, 20)], frame);
    expect(layers.map((l) => l.text)).toEqual(['Hvala vam.\nmnogo']);
    expect(layers[0]!.start).toBe(2);
    expect(left).toBe(2);
  });

  it('follows a reordered edit', () => {
    const { layers } = layersFromCues([cues[0]!], [c('b', 20, 30), c('a', 0, 10)], frame);
    expect(layers[0]!.start).toBe(11);
  });

  it('never shows a subtitle past the end of the edit', () => {
    const { layers } = layersFromCues([cues[2]!], [c('a', 0, 30.5)], frame);
    expect(layers[0]!.end!).toBeLessThanOrEqual(30.5);
  });

  it('gives each layer the subtitle look', () => {
    const { layers } = layersFromCues(cues.slice(0, 1), [c('a', 0, 60)], frame);
    expect(layers[0]!.style.outline).not.toBeNull();
    expect(layers[0]!.style.size).toBe(Math.round(720 / 16));
  });
});
