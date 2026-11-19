import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_STYLE, PRESETS, applyPreset, drawText, fontString, layoutText, wrapLines } from '../src/editor/text-style.ts';
import { boundsOf, clampPosition, duplicateLayer, hitTest, newLayer, removeLayer, reorder, updateLayer, updateStyle, visibleAt } from '../src/editor/layers.ts';
import * as H from '../src/editor/history.ts';
import { ringColor } from '../src/editor/sample.ts';

/** A measuring context where every character is 10 px wide. */
const ruler = () => ({ font: '', letterSpacing: '', measureText: (s: string) => ({ width: s.length * 10 }) }) as never;

describe('wrapLines', () => {
  const m = (s: string) => s.length * 10;
  it('keeps short text on a line and honours newlines', () => {
    expect(wrapLines(m, 'ab\ncd', 0)).toEqual(['ab', 'cd']);
    expect(wrapLines(m, 'ab cd', 100)).toEqual(['ab cd']);
  });
  it('breaks at spaces so no line is wider than the limit', () => {
    expect(wrapLines(m, 'aaa bbb ccc', 70)).toEqual(['aaa bbb', 'ccc']);
  });
  it('lets one word longer than the limit stand alone, unbroken', () => {
    expect(wrapLines(m, 'abcdefghij kl', 50)).toEqual(['abcdefghij', 'kl']);
  });
});

describe('layoutText', () => {
  it('sizes the box from the widest line, the line height and the padding', () => {
    const s = { ...DEFAULT_STYLE, size: 20, lineHeight: 1.5, box: { color: '#000', padding: 5, radius: 0 } };
    const L = layoutText(ruler(), 'abc\nde', s, 0);
    expect(L.width).toBe(30 + 10);
    expect(L.height).toBe(2 * 30 + 10);
  });
  it('upper-cases when asked', () => {
    expect(layoutText(ruler(), 'ab', { ...DEFAULT_STYLE, uppercase: true }, 0).lines).toEqual(['AB']);
  });
  it('wraps inside the padding', () => {
    const s = { ...DEFAULT_STYLE, box: { color: '#000', padding: 10, radius: 0 } };
    expect(layoutText(ruler(), 'aaa bbb', s, 50).lines).toEqual(['aaa', 'bbb']);
  });
});

describe('fontString', () => {
  it('writes weight, size and family', () => {
    expect(fontString({ ...DEFAULT_STYLE, bold: true, italic: true, size: 30 })).toMatch(/^italic 700 30px "IBM Plex Sans"/);
  });
});

describe('presets', () => {
  it('every preset names a real font', () => {
    for (const p of PRESETS) expect(['sans', 'serif', 'mono', 'display', 'script']).toContain(applyPreset(DEFAULT_STYLE, p.id).font);
  });
  it('applying one changes the look but keeps the size unless it sets one', () => {
    const s = applyPreset({ ...DEFAULT_STYLE, size: 99 }, 'neon');
    expect(s.glow).not.toBeNull();
    expect(s.size).toBe(99);
    expect(applyPreset(DEFAULT_STYLE, 'nope')).toBe(DEFAULT_STYLE);
  });
});

describe('drawText', () => {
  const recorder = () => {
    const calls: string[] = [];
    const ctx: Record<string, unknown> = {
      measureText: (s: string) => ({ width: s.length * 10 }),
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      beginPath: () => {},
      roundRect: () => calls.push('box'),
      fill: () => calls.push('fill-box'),
      strokeText: (t: string) => calls.push(`stroke:${t}`),
      fillText: (t: string, x: number) => calls.push(`text:${t}@${x}`),
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  };
  it('draws the box first, then each line outlined before it is filled', () => {
    const { ctx, calls } = recorder();
    drawText(ctx, 'ab', { ...DEFAULT_STYLE, box: { color: '#000', padding: 4, radius: 2 }, outline: { width: 3, color: '#000' } }, 0, 0, 0);
    expect(calls.indexOf('box')).toBeLessThan(calls.indexOf('stroke:ab'));
    expect(calls.indexOf('stroke:ab')).toBeLessThan(calls.indexOf('text:ab@4'));
  });
  it('centres a line inside a wrap width, and returns the rectangle it covers', () => {
    const { ctx, calls } = recorder();
    const r = drawText(ctx, 'ab', { ...DEFAULT_STYLE, outline: null, align: 'center' }, 100, 50, 200);
    expect(calls).toContain('text:ab@190'); // 100 + (200 - 20) / 2
    expect(r).toEqual({ x: 100, y: 50, w: 200, h: DEFAULT_STYLE.size * DEFAULT_STYLE.lineHeight });
  });
  it('draws nothing outside save and restore', () => {
    const { ctx, calls } = recorder();
    drawText(ctx, 'x', DEFAULT_STYLE, 0, 0, 0);
    expect(calls[0]).toBe('save');
    expect(calls.at(-1)).toBe('restore');
  });
});

describe('layers', () => {
  const a = newLayer({ x: 0, y: 0, text: 'aa' });
  const b = newLayer({ x: 100, y: 0, text: 'bb' });
  it('updates and removes without changing the list it was given', () => {
    const list = [a, b];
    const next = updateLayer(list, a.id, { text: 'zz' });
    expect(list[0]!.text).toBe('aa');
    expect(next[0]!.text).toBe('zz');
    expect(removeLayer(list, a.id)).toEqual([b]);
    expect(updateStyle(list, b.id, { size: 9 })[1]!.style.size).toBe(9);
  });
  it('duplicates a layer a little down and right, on top, without its erase patch', () => {
    const withErase = { ...a, erase: { x: 0, y: 0, w: 5, h: 5, color: '#fff' }, original: 'aa' };
    const out = duplicateLayer([withErase, b], a.id);
    const copy = out.at(-1)!;
    expect(copy.id).not.toBe(a.id);
    expect(copy.x).toBe(24);
    expect(copy.erase).toBeUndefined();
    expect(copy.original).toBeUndefined();
  });
  it('brings a layer to the front or sends it to the back', () => {
    expect(reorder([a, b], a.id, 'front').map((l) => l.id)).toEqual([b.id, a.id]);
    expect(reorder([a, b], b.id, 'back').map((l) => l.id)).toEqual([b.id, a.id]);
  });
  it('keeps a layer from being dragged out of the frame', () => {
    expect(clampPosition(5000, -5000, { w: 800, h: 600 })).toEqual({ x: 776, y: -576 });
    expect(clampPosition(10, 10, { w: 800, h: 600 })).toEqual({ x: 10, y: 10 });
  });
  it('finds the top-most layer under a point', () => {
    const c = ruler();
    const over = newLayer({ x: 0, y: 0, text: 'aa' });
    const under = newLayer({ x: 0, y: 0, text: 'aaaa' });
    expect(hitTest(c, [under, over], 5, 5)).toBe(over.id);
    expect(hitTest(c, [under, over], 35, 5)).toBe(under.id);
    expect(hitTest(c, [under, over], 900, 900)).toBeNull();
  });
  it('measures a wrapped layer at least as wide as its wrap width', () => {
    expect(boundsOf(ruler(), { ...a, maxWidth: 300 }).w).toBe(300);
  });
  it('shows a timed layer only within its time', () => {
    const timed = { ...a, start: 2, end: 4 };
    expect(visibleAt([timed, b], 1).map((l) => l.id)).toEqual([b.id]);
    expect(visibleAt([timed, b], 2).map((l) => l.id)).toEqual([a.id, b.id]);
    expect(visibleAt([timed, b], 4).map((l) => l.id)).toEqual([b.id]);
  });
});

describe('history', () => {
  it('undoes and redoes, and a new edit forgets the undone ones', () => {
    let h = H.start(1);
    h = H.push(H.push(h, 2), 3);
    expect(h.present).toBe(3);
    h = H.undo(h);
    expect(h.present).toBe(2);
    expect(H.canRedo(h)).toBe(true);
    h = H.redo(h);
    expect(h.present).toBe(3);
    h = H.push(H.undo(h), 9);
    expect(H.canRedo(h)).toBe(false);
    expect(h.present).toBe(9);
  });
  it('does nothing past either end, and ignores an unchanged state', () => {
    const h = H.start('a');
    expect(H.undo(h)).toBe(h);
    expect(H.redo(h)).toBe(h);
    expect(H.push(h, 'a')).toBe(h);
  });
  it('replaces the present without making a step', () => {
    const h = H.replace(H.push(H.start(1), 2), 5);
    expect(h.present).toBe(5);
    expect(H.undo(h).present).toBe(1);
  });
  it('keeps a bounded number of steps', () => {
    let h = H.start(0);
    for (let i = 1; i <= 150; i++) h = H.push(h, i);
    expect(h.past.length).toBe(100);
  });
});

describe('ringColor', () => {
  const image = (w: number, h: number, paint: (x: number, y: number) => [number, number, number]) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...paint(x, y), 255], (y * w + x) * 4);
    return { width: w, height: h, data };
  };
  it('takes the colour around a box, ignoring what is inside it', () => {
    const img = image(40, 40, (x, y) => (x >= 10 && x < 20 && y >= 10 && y < 20 ? [0, 0, 0] : [200, 220, 240]));
    expect(ringColor(img, { x: 10, y: 10, w: 10, h: 10 })).toBe('rgb(200, 220, 240)');
  });
  it('is not thrown by a few stray pixels in the ring', () => {
    const img = image(40, 40, (x, y) => (x === 9 && y === 12 ? [0, 0, 0] : [10, 20, 30]));
    expect(ringColor(img, { x: 10, y: 10, w: 10, h: 10 })).toBe('rgb(10, 20, 30)');
  });
  it('copes with a box at the edge of the picture', () => {
    const img = image(20, 20, () => [5, 6, 7]);
    expect(ringColor(img, { x: 0, y: 0, w: 5, h: 5 })).toBe('rgb(5, 6, 7)');
  });
});

describe('commitFrom', () => {
  it('makes one undo step of a run of replaced states', () => {
    let h = H.start('a');
    const base = h.present;
    h = H.replace(h, 'b');
    h = H.replace(h, 'c');
    h = H.commitFrom(h, base);
    expect(h.past).toEqual(['a']);
    expect(H.undo(h).present).toBe('a');
  });
  it('does nothing when nothing changed or no run began', () => {
    const h = H.start('a');
    expect(H.commitFrom(h, 'a')).toBe(h);
    expect(H.commitFrom(h, null)).toBe(h);
  });
});

describe('inkColor', () => {
  const img = (w: number, h: number, fn: (x: number, y: number) => [number, number, number]) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...fn(x, y), 255], (y * w + x) * 4);
    return { width: w, height: h, data };
  };
  it('finds the colour of lettering on a plain background', async () => {
    const { inkColor } = await import('../src/editor/sample.ts');
    const px = img(20, 10, (x) => (x < 4 ? [255, 216, 120] : [40, 90, 120]));
    expect(inkColor(px, { x: 0, y: 0, w: 20, h: 10 }, 'rgb(40, 90, 120)')).toBe('#ffd878');
  });
  it('says nothing when there is no lettering to see', async () => {
    const { inkColor } = await import('../src/editor/sample.ts');
    const px = img(20, 10, () => [40, 90, 120]);
    expect(inkColor(px, { x: 0, y: 0, w: 20, h: 10 }, 'rgb(40, 90, 120)')).toBeNull();
  });
});

describe('withRegion', () => {
  const canvas = (w: number, h: number) => {
    const calls: number[][] = [];
    return {
      calls,
      el: { width: w, height: h, getContext: () => ({ getImageData: (x: number, y: number, rw: number, rh: number) => (calls.push([x, y, rw, rh]), { width: rw, height: rh, data: new Uint8ClampedArray(rw * rh * 4) }) }) } as unknown as HTMLCanvasElement,
    };
  };
  it('reads only the rectangle and its margin, and moves the rectangle into the piece\'s own coordinates', async () => {
    const { withRegion } = await import('../src/editor/sample.ts');
    const c = canvas(1000, 800);
    const got = withRegion(c.el, { x: 100, y: 50, w: 40, h: 20 }, 8, (img, at) => ({ img: [img.width, img.height], at }));
    expect(c.calls).toEqual([[92, 42, 56, 36]]);
    expect(got).toEqual({ img: [56, 36], at: { x: 8, y: 8, w: 40, h: 20 } });
  });
  it('stops at the edges of the picture', async () => {
    const { withRegion } = await import('../src/editor/sample.ts');
    const c = canvas(100, 100);
    withRegion(c.el, { x: 2, y: 2, w: 200, h: 200 }, 8, () => 0);
    expect(c.calls).toEqual([[0, 0, 100, 100]]);
  });
  it('gives nothing from a canvas that has been let go', async () => {
    const { withRegion } = await import('../src/editor/sample.ts');
    expect(withRegion(canvas(0, 0).el, { x: 0, y: 0, w: 5, h: 5 }, 0, () => 1)).toBeNull();
  });
});
