import { describe, expect, it } from 'vitest';
import { layout, nextIndex, settle } from '../src/phone/sheetMath.ts';
import { placeBar } from '../src/phone/FloatingBar.tsx';

describe('sheet math', () => {
  const g = layout(['full', 'half'], 1000);
  it('sorts detents and derives offsets from the tallest', () => {
    expect(g.heights).toEqual([450, 850]);
    expect(g.max).toBe(850);
    expect(g.offsets).toEqual([400, 0]);
    expect(g.hidden).toBe(850);
  });
  it('accepts numeric percents', () => {
    expect(layout([30, 60], 500).heights).toEqual([150, 300]);
  });
  it('settles to the nearest detent, or dismisses past the lowest', () => {
    expect(settle(380, 0, g.offsets, g.hidden, true)).toBe(0);
    expect(settle(100, 0, g.offsets, g.hidden, true)).toBe(1);
    expect(settle(700, 0, g.offsets, g.hidden, true)).toBe(-1);
    expect(settle(700, 0, g.offsets, g.hidden, false)).toBe(0);
  });
  it('a fast flick carries it further', () => {
    expect(settle(300, 3, g.offsets, g.hidden, true)).toBe(-1); // 300 + 450 = 750 -> hidden
    expect(settle(300, -2, g.offsets, g.hidden, true)).toBe(1); // up
  });
  it('cycles detents', () => {
    expect(nextIndex(0, 2)).toBe(1);
    expect(nextIndex(1, 2)).toBe(0);
    expect(nextIndex(0, 1)).toBe(0);
  });
});

describe('placeBar', () => {
  const bar = { width: 100, height: 40 };
  const bounds = { width: 400, height: 600 };
  it('sits below, centred', () => {
    expect(placeBar({ x: 100, y: 100, width: 100, height: 100 }, bar, bounds)).toEqual({ x: 100, y: 208, side: 'below' });
  });
  it('flips above when there is no room below', () => {
    const p = placeBar({ x: 100, y: 450, width: 100, height: 120 }, bar, bounds);
    expect(p.side).toBe('above');
    expect(p.y).toBe(402);
  });
  it('stays inside the container', () => {
    expect(placeBar({ x: -50, y: 100, width: 40, height: 40 }, bar, bounds).x).toBe(8);
    expect(placeBar({ x: 380, y: 100, width: 40, height: 40 }, bar, bounds).x).toBe(292);
  });
});
