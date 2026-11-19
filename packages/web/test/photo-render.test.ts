import { afterEach, describe, expect, it, vi } from 'vitest';
import { newLayer } from '../src/editor/layers.ts';
import { renderScene } from '../src/editor/LayerCanvas.tsx';
import { emptyDoc, type ImageLayer, type PageDoc, type ShapeLayer } from '../src/photo/doc.ts';
import { createRenderCache, renderPage, renderToCanvas, resetRenderScratch, type PictureSource, type RenderRequest } from '../src/photo/render.ts';

/** A context that writes down every call and every property set, and measures text as 10 px a letter. */
function recorder(filter = true, extra: Record<string, unknown> = {}) {
  const log: string[] = [];
  const props: Record<string, unknown> = { filter: 'none', globalAlpha: 1 };
  const target: Record<string, unknown> = { measureText: (s: string) => ({ width: s.length * 10 }), ...extra };
  const ctx = new Proxy(target, {
    has: (t, k: string) => k in t || (k === 'filter' && filter),
    get: (t, k: string) => (k in t ? t[k] : k in props ? props[k] : (...a: unknown[]) => void log.push(`${k}(${a.map((x) => (Array.isArray(x) ? x.join(',') : typeof x === 'object' ? 'img' : x)).join(',')})`)),
    set: (_t, k: string, v) => {
      if (k === 'filter' && !filter) return true;
      props[k] = v;
      log.push(`${k}=${v}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

const pic = (w = 100, h = 50) => ({ name: 'pic', width: w, height: h }) as unknown as PictureSource;
const small = (name: string, w = 20, h = 10) => ({ name, width: w, height: h }) as unknown as CanvasImageSource;
const doc = (over: Partial<PageDoc> = {}): PageDoc => ({ ...emptyDoc(), ...over });
const req = (d: PageDoc, over: Partial<RenderRequest> = {}): RenderRequest => ({ doc: d, base: pic(), images: { pictureOf: () => null }, size: { w: 100, h: 50 }, cache: createRenderCache(), ...over });
const placed = { rotation: 0, opacity: 1, blend: 'normal' as const };
const image = (over: Partial<ImageLayer> = {}): ImageLayer => ({ id: 'i', kind: 'image', src: 's', x: 10, y: 5, w: 40, h: 20, ...placed, ...over });
const shape = (over: Partial<ShapeLayer> = {}): ShapeLayer => ({ id: 'sh', kind: 'shape', shape: 'rect', x: 10, y: 5, w: 40, h: 20, fill: '#f00', ...placed, ...over });
const count = (log: string[], prefix: string) => log.filter((l) => l.startsWith(prefix)).length;

afterEach(() => {
  vi.unstubAllGlobals();
  resetRenderScratch();
});

describe('renderPage: the page', () => {
  it('clears, draws the picture untouched with one plain drawImage, and fills no background when transparent', () => {
    const { ctx, log } = recorder();
    renderPage(ctx, req(doc()));
    expect(log[0]).toBe('clearRect(0,0,100,50)');
    expect(log).toContain('drawImage(img,0,0)');
    expect(log.some((l) => l.startsWith('fillRect'))).toBe(false);
    expect(log.some((l) => l.startsWith('filter='))).toBe(false);
  });

  it('fills the background behind the picture', () => {
    const { ctx, log } = recorder();
    renderPage(ctx, req(doc({ background: '#102030' })));
    expect(log).toContain('fillStyle=#102030');
    expect(log.indexOf('fillRect(0,0,100,50)')).toBeLessThan(log.indexOf('drawImage(img,0,0)'));
  });

  it('draws the picture through the geometry matrix, clipped to the output, and sizes the page from it', () => {
    const { ctx, log } = recorder();
    renderPage(ctx, req(doc({ base: { turns: 1 } }), { size: { w: 50, h: 100 } }));
    expect(log).toContain('rect(0,0,50,100)');
    expect(log).toContain('transform(0,1,-1,0,50,0)');
    expect(log).toContain('drawImage(img,0,0,100,50)');
    expect(count(log, 'scale(')).toBe(0); // 1 canvas pixel per output pixel
  });

  it('scales the page to the canvas', () => {
    const { ctx, log } = recorder();
    renderPage(ctx, req(doc(), { size: { w: 50, h: 25 } }));
    expect(log).toContain('scale(0.5,0.5)');
  });

  it('draws what it can when the picture is not ready, and never throws', () => {
    const { ctx, log } = recorder();
    const d = doc({ layers: [image(), shape()] });
    expect(() => renderPage(ctx, req(d, { base: null }))).not.toThrow();
    expect(count(log, 'drawImage')).toBe(0);
    expect(log).toContain('fill()'); // the shape still draws
  });
});

describe('renderPage: text', () => {
  const text = newLayer({ id: 't', x: 10, y: 10, text: 'abcd', erase: { x: 8, y: 8, w: 50, h: 20, color: '#abc' } });

  it('draws unrotated text and its erase rectangle exactly as the editor does today', () => {
    const old = recorder();
    renderScene(old.ctx, { w: 100, h: 50 }, (c) => c.drawImage(pic(), 0, 0), [text], null);
    const now = recorder();
    renderPage(now.ctx, req(doc({ layers: [text] })));
    // renderPage wraps the page in one more save/restore, so its last restore is not part of the text.
    const part = (log: string[]) => log.slice(log.indexOf('fillStyle=#abc')).filter((_, i, a) => i < a.length - (log === now.log ? 1 : 0));
    expect(part(now.log)).toEqual(part(old.log));
    expect(part(now.log).some((l) => l.startsWith('fillText(abcd'))).toBe(true);
  });

  it('turns rotated text about its centre', () => {
    const { ctx, log } = recorder();
    renderPage(ctx, req(doc({ layers: [{ ...text, erase: undefined, rotation: 90 }] })));
    expect(log.some((l) => l.startsWith('rotate('))).toBe(true);
    expect(log.some((l) => l.startsWith('fillText(abcd'))).toBe(true);
  });

  it('leaves out hidden layers, erase rectangles included', () => {
    const { ctx, log } = recorder();
    renderPage(ctx, req(doc({ layers: [{ ...text, hidden: true } as never] })));
    expect(log.some((l) => l.startsWith('fillText'))).toBe(false);
    expect(log).not.toContain('fillStyle=#abc');
  });
});

describe('renderPage: pictures', () => {
  it('draws image layers in order, with rotation, opacity and blend, cropped from the picture', () => {
    const { ctx, log } = recorder();
    const order: string[] = [];
    const wrapped = new Proxy(ctx, { get: (t, k: string) => (k === 'drawImage' ? (i: { name: string }) => order.push(i.name) : (t as any)[k]), set: (t, k: string, v) => ((t as any)[k] = v) });
    const d = doc({ layers: [image({ id: 'a', src: 'A' }), image({ id: 'b', src: 'B', hidden: true }), image({ id: 'c', src: 'C', rotation: 90, opacity: 0.4, blend: 'multiply', crop: { x: 2, y: 1, w: 10, h: 5 } })] });
    renderPage(wrapped, req(d, { images: { pictureOf: (s) => small(s) } }));
    expect(order).toEqual(['pic', 'A', 'C']);
    const { ctx: c2, log: l2 } = recorder();
    renderPage(c2, req(d, { images: { pictureOf: (s) => small(s) } }));
    expect(l2).toContain('globalAlpha=0.4');
    expect(l2).toContain('globalCompositeOperation=multiply');
    expect(l2).toContain('translate(30,15)'); // centre of C
    expect(l2).toContain(`rotate(${Math.PI / 2})`);
    expect(l2).toContain('drawImage(img,2,1,10,5,0,0,40,20)');
    expect(log.length).toBeGreaterThan(0);
  });

  it('skips an image layer whose picture is not ready, or has no size', () => {
    const { ctx, log } = recorder();
    renderPage(ctx, req(doc({ layers: [image(), image({ id: 'j', src: 'zero' })] }), { images: { pictureOf: (s) => (s === 'zero' ? ({ width: 0, height: 0 } as unknown as CanvasImageSource) : null) } }));
    expect(count(log, 'drawImage')).toBe(1); // only the base
  });

  it('flips about the centre, clips frames and rounded corners, and strokes a border inside the shape', () => {
    const { ctx, log } = recorder();
    renderPage(ctx, req(doc({ layers: [image({ flipX: true, frame: 'ellipse', border: { color: '#fff', width: 3 } })] }), { images: { pictureOf: () => small('p') } }));
    expect(log).toContain('scale(-1,1)');
    expect(log.some((l) => l.startsWith('ellipse(20,10,20,10'))).toBe(true);
    expect(log).toContain('clip()');
    expect(log).toContain('lineWidth=6');
    expect(log).toContain('strokeStyle=#fff');
    const { ctx: c2, log: l2 } = recorder();
    renderPage(c2, req(doc({ layers: [image({ radius: 5 })] }), { images: { pictureOf: () => small('p') } }));
    expect(count(l2, 'arcTo')).toBe(4);
  });

  it('draws a shadowed framed picture on a layer of its own so the shadow follows the shape', () => {
    const made: unknown[] = [];
    const lay = recorder(true);
    vi.stubGlobal('document', { createElement: () => (made.push(1), { width: 0, height: 0, getContext: () => lay.ctx }) });
    const { ctx, log } = recorder();
    renderPage(ctx, req(doc({ layers: [image({ frame: 'star', shadow: { color: '#000000', blur: 6, x: 2, y: 3, opacity: 0.5 } })] }), { images: { pictureOf: () => small('p') }, size: { w: 200, h: 100 } }));
    expect(log).toContain('shadowColor=rgba(0,0,0,0.5)');
    expect(log).toContain('shadowBlur=12'); // 6 px at scale 2
    expect(log).toContain('shadowOffsetX=4');
    expect(log).toContain('shadowOffsetY=6');
    expect(lay.log.some((l) => l.startsWith('drawImage(img,0,0,20,10,0,0,40,20)') || l.startsWith('drawImage(img,0,0,20,10'))).toBe(true);
    expect(log.some((l) => l.startsWith('drawImage(img,0,0,40,20)'))).toBe(true);
    expect(made.length).toBe(1);
  });
});

describe('renderPage: colour of the base', () => {
  function stubCanvas(filter: boolean) {
    const cache = recorder(filter, {
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(100), width: w, height: h }),
    });
    let made = 0;
    vi.stubGlobal('document', { createElement: () => (made++, { width: 0, height: 0, getContext: () => cache.ctx }) });
    return { cache, made: () => made };
  }

  it('applies the adjustment with ctx.filter where there is one, onto a kept canvas, and reuses it while only layers change', () => {
    const { cache, made } = stubCanvas(true);
    const c = createRenderCache();
    const base = pic();
    const d = doc({ base: { adjust: { brightness: 50, blur: 3 } } });
    const a = recorder();
    renderPage(a.ctx, req(d, { cache: c, base }));
    expect(cache.log).toContain('filter=brightness(1.5) blur(3px)');
    expect(count(cache.log, 'drawImage')).toBe(1);
    expect(a.log).toContain('drawImage(img,0,0,100,50)');
    // a layer moves: same base, one more draw of the kept canvas, no new work on it
    const b = recorder();
    renderPage(b.ctx, req({ ...d, layers: [shape()] }, { cache: c, base }));
    expect(count(cache.log, 'drawImage')).toBe(1);
    expect(made()).toBe(1);
    expect(b.log).toContain('drawImage(img,0,0,100,50)');
    // the adjustment changes: the kept canvas is redone
    renderPage(recorder().ctx, req(doc({ base: { adjust: { brightness: 60 } } }), { cache: c, base }));
    expect(count(cache.log, 'drawImage')).toBe(2);
    expect(made()).toBe(1);
  });

  it('scales the blur with the canvas, because filter lengths are not touched by the transform', () => {
    const { cache } = stubCanvas(true);
    renderPage(recorder().ctx, req(doc({ base: { adjust: { blur: 4 } } }), { size: { w: 50, h: 25 } }));
    expect(cache.log).toContain('filter=blur(2px)');
  });

  it('does the colour on the pixels when the browser has no ctx.filter, and always for the extras', () => {
    const { cache } = stubCanvas(false);
    renderPage(recorder().ctx, req(doc({ base: { adjust: { brightness: 50 } } })));
    expect(cache.log.some((l) => l.startsWith('filter='))).toBe(false);
    expect(count(cache.log, 'putImageData')).toBe(1);
    const on = stubCanvas(true);
    renderPage(recorder().ctx, req(doc({ base: { adjust: { brightness: 50 } } })));
    expect(count(on.cache.log, 'putImageData')).toBe(0);
    const extras = stubCanvas(true);
    renderPage(recorder().ctx, req(doc({ base: { adjust: { vignette: 40 } } })));
    expect(count(extras.cache.log, 'putImageData')).toBe(1);
  });

  it('applies a preset before the adjustment, through the function it is given', () => {
    const { cache } = stubCanvas(true);
    renderPage(recorder().ctx, req(doc({ base: { preset: 'warm', presetAmount: 0.5, adjust: { contrast: 20 } } }), { presets: (id, amount) => (id === 'warm' ? { saturation: 100 * amount } : null) }));
    expect(cache.log).toContain('filter=saturate(1.5) contrast(1.2)');
  });

  it('keys the kept canvas on the picture, so another picture is not drawn from it', () => {
    const { cache } = stubCanvas(true);
    const c = createRenderCache();
    const d = doc({ base: { adjust: { brightness: 10 } } });
    renderPage(recorder().ctx, req(d, { cache: c, base: pic() }));
    renderPage(recorder().ctx, req(d, { cache: c, base: pic() }));
    expect(count(cache.log, 'drawImage')).toBe(2);
  });

  it('colours straight onto the page when there is no offscreen canvas to be had', () => {
    vi.stubGlobal('document', undefined);
    const { ctx, log } = recorder();
    renderPage(ctx, req(doc({ base: { adjust: { brightness: 50 } } })));
    expect(log).toContain('filter=brightness(1.5)');
    expect(log).toContain('drawImage(img,0,0)');
  });
});

describe('renderPage: shapes', () => {
  it('draws the outlines and uses fill, stroke and dash', () => {
    const star = recorder();
    renderPage(star.ctx, req(doc({ layers: [shape({ shape: 'star', stroke: { color: '#00f', width: 2, dash: true } })] })));
    expect(count(star.log, 'lineTo')).toBe(9);
    expect(star.log).toContain('fillStyle=#f00');
    expect(star.log).toContain('setLineDash(6,4)');
    expect(star.log).toContain('stroke()');
    const el = recorder();
    renderPage(el.ctx, req(doc({ layers: [shape({ shape: 'ellipse' })] })));
    expect(el.log.some((l) => l.startsWith('ellipse(20,10,20,10'))).toBe(true);
    const heart = recorder();
    renderPage(heart.ctx, req(doc({ layers: [shape({ shape: 'heart' })] })));
    expect(count(heart.log, 'bezierCurveTo')).toBe(6);
    const tri = recorder();
    renderPage(tri.ctx, req(doc({ layers: [shape({ shape: 'triangle' })] })));
    expect(count(tri.log, 'lineTo')).toBe(2);
  });

  it('rounds a rectangle with a radius', () => {
    const r = recorder();
    renderPage(r.ctx, req(doc({ layers: [shape({ radius: 6 })] })));
    expect(count(r.log, 'arcTo')).toBe(4);
  });

  it('draws a line as a stroke through the middle, and an arrow with a head', () => {
    const line = recorder();
    renderPage(line.ctx, req(doc({ layers: [shape({ shape: 'line', h: 0, fill: undefined, stroke: { color: '#000', width: 3 } })] })));
    expect(line.log).toContain('moveTo(0,0)');
    expect(line.log).toContain('lineTo(40,0)');
    expect(count(line.log, 'fill()')).toBe(0);
    expect(line.log).toContain('stroke()');
    const arrow = recorder();
    renderPage(arrow.ctx, req(doc({ layers: [shape({ shape: 'arrow', h: 0, fill: undefined, stroke: { color: '#000', width: 3 } })] })));
    expect(count(arrow.log, 'lineTo')).toBe(3);
  });

  it('casts the shadow from the fill only, not a second one from the stroke', () => {
    const { ctx, log } = recorder();
    renderPage(ctx, req(doc({ layers: [shape({ shadow: { color: '#112233', blur: 4, x: 1, y: 2, opacity: 1 }, stroke: { color: '#000', width: 2 } })] })));
    const i = log.indexOf('shadowColor=rgba(17,34,51,1)');
    expect(i).toBeGreaterThan(-1);
    expect(log.indexOf('fill()')).toBeGreaterThan(i);
    expect(log.indexOf('shadowColor=rgba(0,0,0,0)')).toBeGreaterThan(log.indexOf('fill()'));
    expect(log.indexOf('shadowColor=rgba(0,0,0,0)')).toBeLessThan(log.indexOf('stroke()'));
  });
});

describe('renderPage: selection and canvas', () => {
  it('outlines the selected layers last, turned with them', () => {
    const { ctx, log } = recorder();
    renderPage(ctx, req(doc({ layers: [shape({ rotation: 30 }), shape({ id: 'b', x: 60 })] }), { selected: ['sh'] }));
    const last = log.map((l, i) => (l.startsWith('strokeRect') ? i : -1)).filter((i) => i >= 0).pop()!;
    expect(log[last]).toBe('strokeRect(-24,-14,48,28)');
    expect(log).toContain('setLineDash(8,6)');
    expect(log.indexOf('fill()')).toBeLessThan(last);
    const plain = recorder();
    renderPage(plain.ctx, req(doc({ layers: [shape({ x: 60 })] }), { selected: ['sh'] }));
    expect(plain.log).toContain('strokeRect(56,1,48,28)');
  });

  it('renderToCanvas sizes the canvas only when it differs, then draws', () => {
    const sets: string[] = [];
    const { ctx, log } = recorder();
    let w = 0;
    let h = 0;
    const canvas = {
      get width() { return w; },
      set width(v: number) { sets.push(`w${v}`); w = v; },
      get height() { return h; },
      set height(v: number) { sets.push(`h${v}`); h = v; },
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    expect(renderToCanvas(canvas, req(doc()))).toBe(true);
    renderToCanvas(canvas, req(doc()));
    expect(sets).toEqual(['w100', 'h50']);
    expect(count(log, 'clearRect')).toBe(2);
    expect(renderToCanvas({ width: 1, height: 1, getContext: () => null } as unknown as HTMLCanvasElement, req(doc()))).toBe(false);
  });
});
