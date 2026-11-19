import { describe, expect, it } from 'vitest';
import { commitFrom, replace, sameValue, start } from '../src/editor/history.ts';

describe('commitFrom with an equal copy', () => {
  it('adds no step when base is deeply equal to the present', () => {
    const h = replace(start({ a: [1, { b: 2 }], c: 'x' }), { a: [1, { b: 2 }], c: 'x' });
    expect(commitFrom(h, { a: [1, { b: 2 }], c: 'x' })).toBe(h);
  });
  it('still adds a step when something differs', () => {
    const h = replace(start({ a: [1, 2] }), { a: [1, 3] });
    const out = commitFrom(h, { a: [1, 2] });
    expect(out.past).toEqual([{ a: [1, 2] }]);
    expect(out.present).toEqual({ a: [1, 3] });
  });
  it('null base and identical base add nothing', () => {
    const h = start({ a: 1 });
    expect(commitFrom(h, null)).toBe(h);
    expect(commitFrom(h, h.present)).toBe(h);
  });
});

describe('sameValue', () => {
  it('tells arrays from objects, extra keys, and undefined from missing', () => {
    expect(sameValue([], {})).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameValue({ a: undefined }, { b: undefined })).toBe(false);
    expect(sameValue([1, 2], [1, 2, 3])).toBe(false);
    expect(sameValue(NaN, NaN)).toBe(true);
  });
  it('survives a cycle and a huge value by reporting a difference', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    const b: Record<string, unknown> = {};
    b.self = b;
    expect(sameValue(a, b)).toBe(false);
    const big = () => Array.from({ length: 50000 }, (_, i) => ({ i }));
    expect(sameValue(big(), big())).toBe(false);
  });
});
