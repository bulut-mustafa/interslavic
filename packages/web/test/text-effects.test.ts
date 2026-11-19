import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, drawText, layoutText, type TextStyle } from '../src/editor/text-style.ts';
import { boundsOf, newLayer } from '../src/editor/layers.ts';
import { arcGlyphs, DEFAULT_EFFECTS, effectBounds, effectMargin, isActive, type TextEffect } from '../src/editor/text-effects.ts';

const ruler = () => ({ font: '', letterSpacing: '', measureText: (s: string) => ({ width: Array.from(s).length * 10 }) }) as never;
const style = (effect: TextEffect, over: Partial<TextStyle> = {}): TextStyle => ({ ...DEFAULT_STYLE, outline: null, effect, ...over });

describe('arcGlyphs', () => {
  const adv = [10, 10, 10, 10];
  it('is a straight, centred line at 0 %', () => {
    const g = arcGlyphs(adv, 0, 0);
    expect(g.x).toEqual([-15, -5, 5, 15]);
    expect(g.y).toEqual([0, 0, 0, 0]);
    expect(g.rot).toEqual([0, 0, 0, 0]);
  });
  it('puts the middle of an arch on top and tilts the right side clockwise', () => {
    const g = arcGlyphs([10, 10, 10], 0, 50); // half a circle: radius 30 / pi
    expect(g.x[1]).toBeCloseTo(0);
    expect(g.y[1]).toBeCloseTo(0);
    expect(g.rot[1]).toBeCloseTo(0);
    expect(g.rot[2]).toBeGreaterThan(0);
    expect(g.y[2]).toBeGreaterThan(0);
    expect(g.rot[0]!).toBeCloseTo(-g.rot[2]!);
    expect(g.x[0]!).toBeCloseTo(-g.x[2]!);
  });
  it('keeps every glyph on a circle of radius total / angle, and the arc length equals the text length', () => {
    const g = arcGlyphs(adv, 0, 100); // full circle, r = 40 / 2pi
    const r = 40 / (2 * Math.PI);
    for (let i = 0; i < 4; i++) expect(Math.hypot(g.x[i]!, g.y[i]! - r)).toBeCloseTo(r);
    // glyph centres 10 apart along the arc: the angle between neighbours is 10 / r
    expect(g.rot[2]! - g.rot[1]!).toBeCloseTo(10 / r);
  });
  it('mirrors for a negative amount: a valley, tilting the other way', () => {
    const up = arcGlyphs(adv, 0, 40);
    const down = arcGlyphs(adv, 0, -40);
    for (let i = 0; i < 4; i++) {
      expect(down.x[i]).toBeCloseTo(up.x[i]!);
      expect(down.y[i]).toBeCloseTo(-up.y[i]!);
      expect(down.rot[i]).toBeCloseTo(-up.rot[i]!);
    }
  });
  it('counts the letter spacing between glyphs, not after the last one', () => {
    const g = arcGlyphs([10, 10], 4, 0);
    expect(g.x).toEqual([-7, 7]);
  });
  it('clamps beyond a full circle and copes with no glyphs', () => {
    expect(arcGlyphs(adv, 0, 250).rot).toEqual(arcGlyphs(adv, 0, 100).rot);
    expect(arcGlyphs([], 0, 50).x).toEqual([]);
  });
});

describe('effectMargin', () => {
  it('reaches in the direction of an echo, 0 deg being right and 90 deg down', () => {
    const m = effectMargin({ kind: 'echo', offset: 10, direction: 0, color: '#000', count: 2 }, 100);
    expect(m).toEqual({ l: 0, t: 0, r: 20, b: 0 });
    const d = effectMargin({ kind: 'echo', offset: 10, direction: 90, color: '#000', count: 3 }, 100);
    expect(d).toEqual({ l: 0, t: 0, r: 0, b: 30 });
  });
  it('is symmetric for a glitch (one copy each way) and zero for neon, lift, hollow, none', () => {
    expect(effectMargin({ kind: 'glitch', offset: 5, direction: 0, colorA: '#0ff', colorB: '#f0f' }, 40)).toEqual({ l: 2, t: 0, r: 2, b: 0 });
    for (const k of ['none', 'hollow', 'neon', 'lift'] as const) expect(effectMargin(DEFAULT_EFFECTS[k], 40)).toEqual({ l: 0, t: 0, r: 0, b: 0 });
  });
});

describe('isActive and defaults', () => {
  it('treats none, a missing effect and a flat curve as inactive', () => {
    expect(isActive(undefined)).toBe(false);
    expect(isActive({ kind: 'none' })).toBe(false);
    expect(isActive({ kind: 'curve', amount: 0 })).toBe(false);
    expect(isActive({ kind: 'curve', amount: 20 })).toBe(true);
    expect(isActive(DEFAULT_EFFECTS.neon)).toBe(true);
  });
});

describe('layout with an effect', () => {
  it('does not change the layout of text without one', () => {
    const base = layoutText(ruler(), 'abcd', { ...DEFAULT_STYLE }, 0);
    expect(base).toEqual({ lines: ['abcd'], width: 40, height: 60, pad: 0, lineH: 60 });
    expect('fx' in base).toBe(false);
    const none = layoutText(ruler(), 'abcd', style({ kind: 'none' }, { outline: DEFAULT_STYLE.outline }), 0);
    expect(none).toEqual(base);
  });
  it('grows the box for an echo and insets the text when the copies go up-left', () => {
    const L = layoutText(ruler(), 'abcd', style({ kind: 'echo', offset: 10, direction: 225, color: '#000', count: 2 }, { size: 100 }), 0);
    const f = 20 * Math.SQRT1_2;
    expect(L.width).toBeCloseTo(40 + f);
    expect(L.height).toBeCloseTo(125 + f);
    expect(L.fx?.inset.x).toBeCloseTo(f);
    expect(L.fx?.inset.y).toBeCloseTo(f);
  });
  it('makes the box of a curve the extent of the arc', () => {
    const text = 'abcdefghijklmnopqrst'; // 200 wide, much longer than a line is high
    const flat = layoutText(ruler(), text, style({ kind: 'curve', amount: 0 }), 0);
    expect(flat.fx).toBeUndefined();
    const arc = layoutText(ruler(), text, style({ kind: 'curve', amount: 60 }), 0);
    expect(arc.height).toBeGreaterThan(flat.height);
    expect(arc.width).toBeLessThan(flat.width + 48);
    const full = layoutText(ruler(), text, style({ kind: 'curve', amount: 100 }), 0);
    expect(full.height).toBeGreaterThan(200 / Math.PI); // taller than the circle's diameter
    expect(full.width).toBeGreaterThan(200 / Math.PI);
    const valley = layoutText(ruler(), text, style({ kind: 'curve', amount: -60 }), 0);
    expect(valley.height).toBeCloseTo(arc.height);
  });
  it('flows through boundsOf', () => {
    const l = newLayer({ x: 5, y: 6, text: 'abcd', style: style({ kind: 'echo', offset: 10, direction: 0, color: '#000', count: 2 }, { size: 100 }) });
    const b = boundsOf(ruler(), l);
    expect(b).toEqual({ x: 5, y: 6, w: 60, h: 125 });
  });
  it('effectBounds is null for inactive effects', () => {
    expect(effectBounds(ruler(), ['a'], style({ kind: 'none' }), 10, 60)).toBeNull();
  });
});

describe('drawing', () => {
  const recorder = () => {
    const calls: string[] = [];
    const ctx: Record<string, unknown> = {
      font: '',
      letterSpacing: '0px',
      globalAlpha: 1,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      shadowBlur: 0,
      shadowColor: '',
      measureText: (s: string) => ({ width: Array.from(s).length * 10 }),
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      translate: (x: number, y: number) => calls.push(`translate:${x.toFixed(1)},${y.toFixed(1)}`),
      rotate: (a: number) => calls.push(`rotate:${a.toFixed(2)}`),
      beginPath: () => {},
      roundRect: () => {},
      fill: () => {},
      strokeText: (t: string, x: number, y: number) => calls.push(`stroke:${t}@${x},${y}:${String(ctx.strokeStyle)}:${String(ctx.lineWidth)}`),
      fillText: (t: string, x: number, y: number) => calls.push(`fill:${t}@${x},${y}:${String(ctx.fillStyle)}:b${String(ctx.shadowBlur)}`),
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  };
  const draw = (effect: TextEffect, text = 'ab', over: Partial<TextStyle> = {}) => {
    const { ctx, calls } = recorder();
    drawText(ctx, text, style(effect, { size: 100, color: '#ffffff', align: 'left', ...over }), 0, 0, 0);
    return calls;
  };

  it('hollow strokes the glyphs in the text colour and never fills them', () => {
    const calls = draw({ kind: 'hollow', width: 4 });
    expect(calls.some((c) => c.startsWith('fill:'))).toBe(false);
    expect(calls).toContain('stroke:ab@0,62.5:#ffffff:4'); // 4 % of 100 px
  });
  it('echo draws the farthest copy first and the face last', () => {
    const calls = draw({ kind: 'echo', offset: 10, direction: 0, color: '#ff0000', count: 2 });
    const fills = calls.filter((c) => c.startsWith('fill:'));
    expect(fills.map((c) => c.split('@')[1]!.split(',')[0])).toEqual(['20', '10', '0']);
    expect(fills[0]).toContain('#ff0000');
    expect(fills.at(-1)).toContain('#ffffff');
  });
  it('glitch puts one colour each side of the face, with plain source-over drawing', () => {
    const calls = draw({ kind: 'glitch', offset: 5, direction: 0, colorA: '#00ffff', colorB: '#ff00ff' });
    const fills = calls.filter((c) => c.startsWith('fill:'));
    expect(fills.map((c) => c.split(':')[2])).toEqual(['#00ffff', '#ff00ff', '#ffffff']);
    expect(fills[0]).toContain('@10,'); // the box grew by 5 on each side, so the face sits at 5
    expect(fills[1]).toContain('@0,');
    expect(fills[2]).toContain('@5,');
  });
  it('neon stacks three glow passes of growing blur under a bright core', () => {
    const calls = draw({ kind: 'neon', intensity: 50 }, 'ab', { color: '#ff2d95' });
    const fills = calls.filter((c) => c.startsWith('fill:'));
    expect(fills).toHaveLength(4);
    const blurs = fills.map((c) => Number(c.split(':b')[1]));
    expect(blurs[0]).toBeLessThan(blurs[1]!);
    expect(blurs[1]).toBeLessThan(blurs[2]!);
    expect(blurs[3]).toBe(0);
    expect(fills[3]).not.toContain('#ff2d95'); // the core is lighter than the glow
  });
  it('splice strokes an offset copy first, then the outline itself, without a fill', () => {
    const calls = draw({ kind: 'splice', width: 3, offset: 6, direction: 90, color: '#ff00ff' });
    const strokes = calls.filter((c) => c.startsWith('stroke:'));
    expect(strokes).toEqual(['stroke:ab@0,68.5:#ff00ff:3', 'stroke:ab@0,62.5:#ffffff:3']);
    expect(calls.some((c) => c.startsWith('fill:'))).toBe(false);
  });
  it('lift fills once with a soft shadow', () => {
    const calls = draw({ kind: 'lift', intensity: 60 });
    const fills = calls.filter((c) => c.startsWith('fill:'));
    expect(fills).toHaveLength(1);
    expect(Number(fills[0]!.split(':b')[1])).toBeGreaterThan(0);
  });
  it('curve draws one rotated glyph at a time inside save and restore, and spaces glyphs itself', () => {
    const calls = draw({ kind: 'curve', amount: 50 }, 'abc', { letterSpacing: 0 });
    expect(calls.filter((c) => c.startsWith('rotate:'))).toHaveLength(3);
    expect(calls.filter((c) => c.startsWith('fill:')).map((c) => c.slice(0, 6))).toEqual(['fill:a', 'fill:b', 'fill:c']);
    expect(calls.filter((c) => c === 'save').length).toBe(calls.filter((c) => c === 'restore').length);
  });
  it('a flat curve draws like plain text', () => {
    const a = recorder();
    const b = recorder();
    drawText(a.ctx, 'ab', style({ kind: 'curve', amount: 0 }), 3, 4, 0);
    drawText(b.ctx, 'ab', style({ kind: 'none' }), 3, 4, 0);
    expect(a.calls).toEqual(b.calls);
  });
  it('returns the rectangle of the grown box', () => {
    const { ctx } = recorder();
    const r = drawText(ctx, 'abcd', style({ kind: 'echo', offset: 10, direction: 0, color: '#000', count: 2 }, { size: 100 }), 7, 8, 0);
    expect(r).toEqual({ x: 7, y: 8, w: 60, h: 125 });
  });
});
