import { boundsOf } from '../editor/layers.ts';
import { isImage, isShape, outputSize, type Geometry, type PhotoLayer } from './doc.ts';

/**
 * The picture's geometry as exact affine maths. Pure: no DOM, no canvas.
 *
 * Conventions (x right, y down, degrees clockwise, like canvas):
 *  - `Geometry.crop` is in the ORIGINAL picture's pixels. Without one it is the whole picture.
 *  - The picture is flipped (flipX/flipY) about the CENTRE OF THE CROP, so a flip never moves
 *    the cropped region; then rotated by `straighten` about the same centre; then turned by
 *    `turns` quarter turns about it; then the crop window is moved to the output's top-left.
 *  - The crop window is FIXED: straighten turns the picture under it, so the output size is
 *    `outputSize` (the crop, with width and height swapped for odd turns) whatever the
 *    straighten. Where the turned picture does not reach the window's corners the page
 *    background shows. `opts.fill` zooms the picture about the crop centre by the least
 *    amount that hides those corners (`fillScale`), the way phone editors do.
 *  - Layers sit in OUTPUT pixels, so `retargetLayers` maps them when the geometry changes.
 */

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Size = { w: number; h: number };

/** Canvas's matrix: a point (x, y) goes to (a*x + c*y + e, b*x + d*y + f) (MDN CanvasRenderingContext2D.transform). */
export interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** `m` after `n`: the map that applies `n` first, then `m`. */
export function mul(m: Mat, n: Mat): Mat {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export const det = (m: Mat): number => m.a * m.d - m.b * m.c;

export function invert(m: Mat): Mat {
  const k = det(m);
  if (!k) return IDENTITY;
  return { a: m.d / k, b: -m.b / k, c: -m.c / k, d: m.a / k, e: (m.c * m.f - m.d * m.e) / k, f: (m.b * m.e - m.a * m.f) / k };
}

export const apply = (m: Mat, p: Pt): Pt => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });

const translate = (x: number, y: number): Mat => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
const scale = (x: number, y: number): Mat => ({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 });
/** Clockwise (on screen, y down) rotation; exact for multiples of 90. */
function rotation(deg: number): Mat {
  const q = ((deg % 360) + 360) % 360;
  const exact: Record<number, [number, number]> = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] };
  const [c, s] = exact[q] ?? [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  return { a: c, b: s, c: -s, d: c, e: 0, f: 0 };
}

const cropOf = (src: Size, g: Geometry): Rect => g.crop ?? { x: 0, y: 0, w: src.w, h: src.h };

/** The size of the output picture: the crop, width and height swapped for odd turns. Straightening does not change it. */
export const outputBounds = (src: Size, g: Geometry): Size => outputSize(src.w, src.h, g);

/**
 * The least zoom (>= 1) of the picture about the crop centre after which the straightened crop window lies wholly inside the
 * picture, so no background shows in the corners. 1 when nothing is turned or the window already fits.
 */
export function fillScale(src: Size, g: Geometry): number {
  const th = ((g.straighten ?? 0) * Math.PI) / 180;
  if (!th) return 1;
  const c = cropOf(src, g);
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  let k = 1;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    // the window corner, seen in the picture's own axes (the inverse of the straighten)
    const ox = (sx * c.w) / 2;
    const oy = (sy * c.h) / 2;
    const ux = ox * cos + oy * sin;
    const uy = -ox * sin + oy * cos;
    const room = (u: number, lo: number, hi: number): number => (u > 0 ? (hi > 0 ? u / hi : Infinity) : u < 0 ? (lo > 0 ? -u / lo : Infinity) : 0);
    k = Math.max(k, room(ux, cx, src.w - cx), room(uy, cy, src.h - cy));
  }
  return Number.isFinite(k) ? k : 1;
}

/** The map from the ORIGINAL picture's pixels to the OUTPUT picture's pixels. */
export function geometryMatrix(src: Size, g: Geometry, opts: { fill?: boolean } = {}): Mat {
  const c = cropOf(src, g);
  const out = outputBounds(src, g);
  const zoom = opts.fill ? fillScale(src, g) : 1;
  let m = translate(-(c.x + c.w / 2), -(c.y + c.h / 2));
  m = mul(scale(g.flipX ? -1 : 1, g.flipY ? -1 : 1), m);
  m = mul(scale(zoom, zoom), m);
  m = mul(rotation(g.straighten ?? 0), m);
  m = mul(rotation(90 * (g.turns ?? 0)), m);
  return mul(translate(out.w / 2, out.h / 2), m);
}

export const mapPoint = (src: Size, g: Geometry, p: Pt, opts?: { fill?: boolean }): Pt => apply(geometryMatrix(src, g, opts), p);
export const unmapPoint = (src: Size, g: Geometry, p: Pt, opts?: { fill?: boolean }): Pt => apply(invert(geometryMatrix(src, g, opts)), p);

/** Whether two geometries put the picture in exactly the same place. */
export function sameGeometry(a: Geometry, b: Geometry): boolean {
  const ca = a.crop;
  const cb = b.crop;
  const cropSame = (!ca && !cb) || (!!ca && !!cb && ca.x === cb.x && ca.y === cb.y && ca.w === cb.w && ca.h === cb.h);
  return cropSame && (a.turns ?? 0) === (b.turns ?? 0) && (a.straighten ?? 0) === (b.straighten ?? 0) && !!a.flipX === !!b.flipX && !!a.flipY === !!b.flipY;
}

// ---------------------------------------------------------------- crop helpers

/** Keeps a crop inside the picture, at least `min` pixels each way. */
export function clampCrop(src: Size, crop: Rect, min = 1): Rect {
  const w = Math.min(src.w, Math.max(Math.min(min, src.w), crop.w));
  const h = Math.min(src.h, Math.max(Math.min(min, src.h), crop.h));
  return { x: Math.min(Math.max(0, crop.x), src.w - w), y: Math.min(Math.max(0, crop.y), src.h - h), w, h };
}

/**
 * The largest crop centred on the picture, of width : height `ratio` (default: the picture's own), that can be straightened by
 * `straighten` degrees without background showing: all four corners of the turned window stay inside the picture.
 * With c = |cos|, s = |sin| and h = w / ratio the window needs w c + h s <= W and w s + h c <= H.
 */
export function largestInscribedCrop(src: Size, straighten: number, ratio = src.w / src.h): Rect {
  const th = (straighten * Math.PI) / 180;
  const c = Math.abs(Math.cos(th));
  const s = Math.abs(Math.sin(th));
  const r = ratio > 0 && Number.isFinite(ratio) ? ratio : src.w / src.h;
  const h = Math.min(src.w / (r * c + s), src.h / (r * s + c));
  const w = h * r;
  return { x: (src.w - w) / 2, y: (src.h - h) / 2, w, h };
}

/** The largest rectangle of width : height `ratio` inside `existing` (default the whole picture), keeping its centre. Bad ratios change nothing. */
export function cropForAspect(src: Size, ratio: number, existing?: Rect): Rect {
  const box = existing ?? { x: 0, y: 0, w: src.w, h: src.h };
  if (!(ratio > 0) || !Number.isFinite(ratio)) return box;
  const wide = box.w / box.h > ratio;
  const w = wide ? box.h * ratio : box.w;
  const h = wide ? box.h : box.w / ratio;
  return clampCrop(src, { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }, 0);
}

// ---------------------------------------------------------------- shapes (shared by the renderer and the hit test)

/** The heart in a unit box: six cubic Beziers, the same drawing as the heart mask in video/effects.ts (copied, as it is not exported there). */
export const HEART: { move: [number, number]; curves: [number, number, number, number, number, number][] } = {
  move: [0.5, 1],
  curves: [
    [0.1, 0.7, 0, 0.45, 0, 0.28],
    [0, 0.1, 0.15, 0, 0.28, 0],
    [0.4, 0, 0.5, 0.1, 0.5, 0.22],
    [0.5, 0.1, 0.6, 0, 0.72, 0],
    [0.85, 0, 1, 0.1, 1, 0.28],
    [1, 0.45, 0.9, 0.7, 0.5, 1],
  ],
};

/** A regular five-pointed star's inner radius over its outer radius: 1 / phi^2. */
const STAR_INNER = (3 - Math.sqrt(5)) / 2;

/** The star's ten corners fitted to the box (0,0)-(w,h). */
export function starPoints(w: number, h: number): Pt[] {
  const raw = Array.from({ length: 10 }, (_, i) => {
    const a = (-90 + 36 * i) * (Math.PI / 180);
    const r = i % 2 === 0 ? 1 : STAR_INNER;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
  const x0 = Math.min(...raw.map((p) => p.x));
  const x1 = Math.max(...raw.map((p) => p.x));
  const y0 = Math.min(...raw.map((p) => p.y));
  const y1 = Math.max(...raw.map((p) => p.y));
  return raw.map((p) => ({ x: ((p.x - x0) / (x1 - x0)) * w, y: ((p.y - y0) / (y1 - y0)) * h }));
}

export const trianglePoints = (w: number, h: number): Pt[] => [{ x: w / 2, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

/** A closed outline of a shape in its own box (0,0)-(w,h), as a polygon (curves are sampled). Lines and arrows are the segment through the middle. */
export function shapeOutline(kind: 'rect' | 'ellipse' | 'triangle' | 'star' | 'heart' | 'line' | 'arrow', w: number, h: number): Pt[] {
  switch (kind) {
    case 'rect':
      return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    case 'ellipse':
      return Array.from({ length: 64 }, (_, i) => {
        const a = (i / 64) * 2 * Math.PI;
        return { x: w / 2 + (w / 2) * Math.cos(a), y: h / 2 + (h / 2) * Math.sin(a) };
      });
    case 'triangle':
      return trianglePoints(w, h);
    case 'star':
      return starPoints(w, h);
    case 'heart': {
      const pts: Pt[] = [];
      let [px, py] = HEART.move;
      for (const [x1, y1, x2, y2, x3, y3] of HEART.curves) {
        for (let i = 1; i <= 12; i++) {
          const t = i / 12;
          const u = 1 - t;
          pts.push({
            x: (u * u * u * px + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3) * w,
            y: (u * u * u * py + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3) * h,
          });
        }
        [px, py] = [x3, y3];
      }
      return pts;
    }
    default:
      return [{ x: 0, y: h / 2 }, { x: w, y: h / 2 }];
  }
}

// ---------------------------------------------------------------- moving layers with the geometry

type Measure = Parameters<typeof boundsOf>[0];

/** Used only when no canvas is at hand to measure text: a rough width. */
const roughMeasure = (size: number): Measure => ({ font: '', measureText: (s: string) => ({ width: s.length * size * 0.55 }) as TextMetrics }) as unknown as Measure;

const wrapDeg = (deg: number): number => {
  const r = ((((deg + 180) % 360) + 360) % 360) - 180;
  const v = r === -180 ? 180 : r;
  const rounded = Math.round(v * 1e9) / 1e9;
  return rounded === 0 ? 0 : rounded;
};

const EPS = 1e-9;

/**
 * Moves every layer so it stays on the same part of the PICTURE when the geometry goes from `from` to `to`. Layer positions are in
 * output pixels, so each is carried by T = M(to) after M(from)^-1 (a rigid map: turns, flips, shifts), which is exact:
 *  - position: the layer's box centre goes through T (text too: x/y come from its box centre, measured with `measure`);
 *  - rotation and flips follow the linear part of T: a mirrored T toggles flipX (text cannot be mirrored: only its direction follows);
 *  - size does not change.
 * `erase` rectangles (OCR replacements) are axis-aligned: they are carried exactly when T keeps the axes (turns, flips, crop) and
 * dropped when it does not (straighten): the second value lists the ids of the layers that lost theirs.
 */
export function retargetLayers(layers: PhotoLayer[], src: Size, from: Geometry, to: Geometry, measure?: Measure): [PhotoLayer[], string[]] {
  if (sameGeometry(from, to)) return [layers, []];
  const t = mul(geometryMatrix(src, to), invert(geometryMatrix(src, from)));
  const mirrored = det(t) < 0;
  /** The angle (degrees) a direction at `deg` has after T. */
  const dirAfter = (deg: number): number => {
    const r = (deg * Math.PI) / 180;
    return (Math.atan2(t.b * Math.cos(r) + t.d * Math.sin(r), t.a * Math.cos(r) + t.c * Math.sin(r)) * 180) / Math.PI;
  };
  const keepsAxes = (Math.abs(t.b) < EPS && Math.abs(t.c) < EPS) || (Math.abs(t.a) < EPS && Math.abs(t.d) < EPS);
  const lost: string[] = [];

  const out = layers.map((l): PhotoLayer => {
    if (isImage(l) || isShape(l)) {
      const c = apply(t, { x: l.x + l.w / 2, y: l.y + l.h / 2 });
      // Mirrored: L R(r) F = R(delta - r) Mx F, so the rotation becomes delta - r and flipX toggles.
      const rotation = mirrored ? wrapDeg((Math.atan2(-t.b, -t.a) * 180) / Math.PI - l.rotation) : wrapDeg(l.rotation + (Math.atan2(t.b, t.a) * 180) / Math.PI);
      return { ...l, x: c.x - l.w / 2, y: c.y - l.h / 2, rotation, ...(mirrored ? { flipX: !l.flipX } : {}) };
    }
    const b = boundsOf(measure ?? roughMeasure(l.style.size), l);
    const c = apply(t, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const next: typeof l = { ...l, x: c.x - b.w / 2, y: c.y - b.h / 2 };
    const rot = wrapDeg(dirAfter(l.rotation ?? 0));
    if (rot || l.rotation) next.rotation = rot;
    if (l.erase) {
      if (keepsAxes) {
        const p = apply(t, { x: l.erase.x, y: l.erase.y });
        const q = apply(t, { x: l.erase.x + l.erase.w, y: l.erase.y + l.erase.h });
        next.erase = { ...l.erase, x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) };
      } else {
        delete next.erase;
        lost.push(l.id);
      }
    }
    return next;
  });
  return [out, lost];
}
