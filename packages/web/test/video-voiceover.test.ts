import { describe, expect, it } from 'vitest';
import { VoiceOver } from '../src/video/voiceover.ts';
import type { TextLayer } from '../src/editor/layers.ts';

const layer = (id: string, text: string, start: number, end: number): TextLayer =>
  ({ id, text, x: 0, y: 0, maxWidth: 0, style: {} as TextLayer['style'], start, end });

function rig() {
  const log: string[] = [];
  let ended: (() => void) | null = null;
  const v = new VoiceOver({
    speak: (t, onEnd) => {
      log.push(`say:${t}`);
      ended = onEnd;
    },
    stop: () => log.push('stop'),
    duck: (on) => log.push(on ? 'duck' : 'unduck'),
  });
  return { v, log, finish: () => ended?.() };
}

describe('VoiceOver', () => {
  const lines = [layer('a', 'Dobry den', 1, 3), layer('b', 'Do vidzenja', 5, 7)];

  it('speaks a line when its start is passed, with the original sound ducked', () => {
    const { v, log } = rig();
    v.arm(0.5);
    v.update(0.9, lines, 10);
    expect(log).toEqual([]);
    v.update(1.05, lines, 10);
    expect(log).toEqual(['duck', 'say:Dobry den']);
  });

  it('brings the sound back when the line finishes by itself', () => {
    const { v, log, finish } = rig();
    v.arm(0.5);
    v.update(1.05, lines, 10);
    finish();
    expect(log.at(-1)).toBe('unduck');
  });

  it('cuts a line off when its text leaves the screen', () => {
    const { v, log } = rig();
    v.arm(0.5);
    v.update(1.05, lines, 10);
    v.update(1.9, lines, 10);
    v.update(2.9, lines, 10);
    expect(log).toEqual(['duck', 'say:Dobry den']);
    v.update(3.05, lines, 10);
    expect(log.slice(-2)).toEqual(['stop', 'unduck']);
  });

  it('does not speak a line the playhead was already inside when it started', () => {
    const { v, log } = rig();
    v.arm(2);
    v.update(2.1, lines, 10);
    expect(log).toEqual([]);
  });

  it('treats a big jump as a seek and speaks nothing for it', () => {
    const { v, log } = rig();
    v.arm(0);
    v.update(0.1, lines, 10);
    v.update(5.5, lines, 10);
    expect(log).toEqual([]);
  });

  it('speaks a line that starts at zero when playback is armed just before it', () => {
    const { v, log } = rig();
    v.arm(-0.001);
    v.update(0.02, [layer('z', 'Start', 0, 2)], 10);
    expect(log).toEqual(['duck', 'say:Start']);
  });

  it('skips empty text', () => {
    const { v, log } = rig();
    v.arm(0.5);
    v.update(1.05, [layer('e', '  ', 1, 3)], 10);
    expect(log).toEqual([]);
  });

  it('halt stops the voice and restores the sound once', () => {
    const { v, log } = rig();
    v.arm(0.5);
    v.update(1.05, lines, 10);
    v.halt();
    v.halt();
    expect(log.filter((x) => x === 'stop')).toHaveLength(1);
    expect(log.at(-1)).toBe('unduck');
  });
});
