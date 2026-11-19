/**
 * Cutting a subject out of a picture: the pure part (no canvas, no model), so
 * every step can be tested with small arrays.
 *
 * A MATTE is one byte per pixel: 0 = background, 255 = subject, between = the
 * soft edge. The model produces one at its own small size; here it is made
 * the size of the picture, cleaned up, applied to the picture's colours and
 * edited with a brush.
 *
 * The contract the editor relies on (see cutout-client.ts: removeBackground):
 *   matte    - Matte at the PICTURE's size (the working picture, at most 2400 px on a side).
 *   cutout   - a canvas of the picture with `matte` as its alpha, i.e. a PNG with transparency
 *              once written out; trimmed to `box` when asked.
 *   box      - where the (trimmed) cutout sits in the picture, in picture pixels.
 */

export interface Matte {
  w: number;
  h: number;
  /** w * h bytes, row by row. */
  data: Uint8ClampedArray;
}

export interface Rgba {
  w: number;
  h: number;
  /** w * h * 4 bytes: R, G, B, A, as in a canvas ImageData. */
  data: Uint8ClampedArray;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const newMatte = (w: number, h: number, fill = 0): Matte => ({ w, h, data: new Uint8ClampedArray(w * h).fill(fill) });

/** The matte of a model's answer: the alpha bytes of an RGBA picture. */
export function matteFromAlpha(rgba: Rgba): Matte {
  const out = newMatte(rgba.w, rgba.h);
  for (let i = 0; i < out.data.length; i++) out.data[i] = rgba.data[i * 4 + 3]!;
  return out;
}

/**
 * The matte at another size, bilinear with pixel centres aligned (the same
 * mapping a canvas uses when it scales a picture), so a small model output
 * becomes a smooth full-size matte instead of blocks.
 */
export function resizeMatte(m: Matte, w: number, h: number): Matte {
  if (m.w === w && m.h === h) return { w, h, data: m.data.slice() };
  const out = newMatte(w, h);
  const sx = m.w / w;
  const sy = m.h / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), m.h - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, m.h - 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), m.w - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, m.w - 1);
      const tx = fx - x0;
      const top = m.data[y0 * m.w + x0]! * (1 - tx) + m.data[y0 * m.w + x1]! * tx;
      const bottom = m.data[y1 * m.w + x0]! * (1 - tx) + m.data[y1 * m.w + x1]! * tx;
      out.data[y * w + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
}

/** Puts the matte in the picture's alpha (times the alpha it already has). Returns a new picture; the input is not changed. */
export function applyMatte(pic: Rgba, m: Matte): Rgba {
  if (pic.w !== m.w || pic.h !== m.h) throw new Error(`The matte is ${m.w}x${m.h} but the picture is ${pic.w}x${pic.h}.`);
  const data = new Uint8ClampedArray(pic.data);
  for (let i = 0; i < m.data.length; i++) data[i * 4 + 3] = Math.round((pic.data[i * 4 + 3]! * m.data[i]!) / 255);
  return { w: pic.w, h: pic.h, data };
}

/**
 * Levels on the edge: values at or under `low` become 0, at or over `high`
 * become 255, between them a smoothstep. Pulling `low` up removes the faint
 * halo a model leaves around the subject; pulling `high` down firms up a
 * soft body. Needs low < high.
 */
export function levelsMatte(m: Matte, low: number, high: number): Matte {
  if (!(low < high)) throw new Error('levelsMatte needs low < high.');
  const out = newMatte(m.w, m.h);
  for (let i = 0; i < m.data.length; i++) {
    const t = Math.min(Math.max((m.data[i]! - low) / (high - low), 0), 1);
    out.data[i] = 255 * t * t * (3 - 2 * t);
  }
  return out;
}

/** Running window along one line, `radius` each side, edges clamped (so a window never sees past the picture). */
function boxLine(src: Float32Array, dst: Float32Array, n: number, radius: number): void {
  const size = 2 * radius + 1;
  let sum = 0;
  for (let k = -radius; k <= radius; k++) sum += src[Math.min(Math.max(k, 0), n - 1)]!;
  for (let i = 0; i < n; i++) {
    dst[i] = sum / size;
    sum += src[Math.min(i + radius + 1, n - 1)]! - src[Math.max(i - radius, 0)]!;
  }
}

/** Softens the edge: a box blur of the given radius in pixels (done twice, which is close to a Gaussian), 0 = untouched. */
export function featherMatte(m: Matte, radius: number): Matte {
  const r = Math.round(radius);
  if (r <= 0) return { ...m, data: m.data.slice() };
  let cur = Float32Array.from(m.data);
  const tmp = new Float32Array(cur.length);
  const line = new Float32Array(Math.max(m.w, m.h));
  const lineOut = new Float32Array(line.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) line[x] = cur[y * m.w + x]!;
      boxLine(line, lineOut, m.w, r);
      for (let x = 0; x < m.w; x++) tmp[y * m.w + x] = lineOut[x]!;
    }
    for (let x = 0; x < m.w; x++) {
      for (let y = 0; y < m.h; y++) line[y] = tmp[y * m.w + x]!;
      boxLine(line, lineOut, m.h, r);
      for (let y = 0; y < m.h; y++) cur[y * m.w + x] = lineOut[y]!;
    }
  }
  const out = newMatte(m.w, m.h);
  for (let i = 0; i < cur.length; i++) out.data[i] = cur[i]!;
  return out;
}

/** Grows (radius > 0, maximum) or shrinks (radius < 0, minimum) the subject by a square window of |radius| pixels each way. */
export function growMatte(m: Matte, radius: number): Matte {
  const r = Math.round(Math.abs(radius));
  if (r === 0) return { ...m, data: m.data.slice() };
  const pick = radius > 0 ? Math.max : Math.min;
  const tmp = new Uint8ClampedArray(m.data.length);
  const out = newMatte(m.w, m.h);
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      let v = m.data[y * m.w + x]!;
      for (let k = Math.max(x - r, 0); k <= Math.min(x + r, m.w - 1); k++) v = pick(v, m.data[y * m.w + k]!);
      tmp[y * m.w + x] = v;
    }
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      let v = tmp[y * m.w + x]!;
      for (let k = Math.max(y - r, 0); k <= Math.min(y + r, m.h - 1); k++) v = pick(v, tmp[k * m.w + x]!);
      out.data[y * m.w + x] = v;
    }
  return out;
}

/**
 * Replaces the colour of edge pixels (partly transparent) with the average
 * colour of the solid subject pixels within `radius`, so the old background
 * does not tint the rim ("fringe"). Pixels with no solid neighbour keep their
 * colour. Returns a new picture; alpha is untouched.
 */
export function decontaminate(pic: Rgba, m: Matte, radius = 3, solid = 250): Rgba {
  if (pic.w !== m.w || pic.h !== m.h) throw new Error('The matte and the picture differ in size.');
  const data = new Uint8ClampedArray(pic.data);
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      if (m.data[i]! >= solid || m.data[i] === 0) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = Math.max(y - radius, 0); yy <= Math.min(y + radius, m.h - 1); yy++)
        for (let xx = Math.max(x - radius, 0); xx <= Math.min(x + radius, m.w - 1); xx++) {
          const j = yy * m.w + xx;
          if (m.data[j]! < solid) continue;
          r += pic.data[j * 4]!;
          g += pic.data[j * 4 + 1]!;
          b += pic.data[j * 4 + 2]!;
          n++;
        }
      if (n) {
        data[i * 4] = Math.round(r / n);
        data[i * 4 + 1] = Math.round(g / n);
        data[i * 4 + 2] = Math.round(b / n);
      }
    }
  return { w: pic.w, h: pic.h, data };
}

/** The smallest rectangle holding every pixel whose matte is above `min`, or null when there is none. */
export function boundingBox(m: Matte, min = 8): Box | null {
  let x0 = m.w;
  let y0 = m.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++)
      if (m.data[y * m.w + x]! > min) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** `box` grown by `pad` pixels each way, kept inside a w x h picture. */
export function padBox(b: Box, pad: number, w: number, h: number): Box {
  const x = Math.max(b.x - pad, 0);
  const y = Math.max(b.y - pad, 0);
  return { x, y, w: Math.min(b.x + b.w + pad, w) - x, h: Math.min(b.y + b.h + pad, h) - y };
}

export function cropRgba(pic: Rgba, b: Box): Rgba {
  const data = new Uint8ClampedArray(b.w * b.h * 4);
  for (let y = 0; y < b.h; y++) {
    const from = ((b.y + y) * pic.w + b.x) * 4;
    data.set(pic.data.subarray(from, from + b.w * 4), y * b.w * 4);
  }
  return { w: b.w, h: b.h, data };
}

/** How much of the picture the matte keeps, 0..1 (a sanity check: close to 0 or 1 means the model found nothing, or everything). */
export function coverage(m: Matte): number {
  let sum = 0;
  for (let i = 0; i < m.data.length; i++) sum += m.data[i]!;
  return m.data.length ? sum / (255 * m.data.length) : 0;
}

/** One dab or stroke of the refine brush, in picture pixels. */
export interface Stroke {
  /** Points the brush passed through (one point = one dab). */
  points: { x: number; y: number }[];
  radius: number;
  /** 'add' paints subject back in, 'erase' paints it away. */
  mode: 'add' | 'erase';
}

/**
 * Paints a stroke into the matte: round dabs along the path, with a one-pixel
 * soft rim so the edge is not jagged. `scale` maps the stroke's picture pixels
 * onto a matte of another size, so the same strokes can be drawn on a small
 * preview while the user paints and replayed on the full-size matte after.
 */
export function paintStroke(m: Matte, s: Stroke, scale = 1): void {
  const r = Math.max(s.radius * scale, 0.5);
  const target = s.mode === 'add' ? 255 : 0;
  const dab = (cx: number, cy: number): void => {
    for (let y = Math.max(Math.floor(cy - r - 1), 0); y <= Math.min(Math.ceil(cy + r + 1), m.h - 1); y++)
      for (let x = Math.max(Math.floor(cx - r - 1), 0); x <= Math.min(Math.ceil(cx + r + 1), m.w - 1); x++) {
        // Distance from the pixel's centre to the dab's centre; full strength inside r - 0.5, none past r + 0.5.
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const k = Math.min(Math.max(r + 0.5 - d, 0), 1);
        if (k <= 0) continue;
        const i = y * m.w + x;
        m.data[i] = m.data[i]! + (target - m.data[i]!) * k;
      }
  };
  let prev: { x: number; y: number } | null = null;
  for (const p of s.points) {
    const cx = p.x * scale;
    const cy = p.y * scale;
    if (prev) {
      // Dabs no further apart than a third of the radius leave no gaps.
      const step = Math.max(r / 3, 0.5);
      const n = Math.ceil(Math.hypot(cx - prev.x, cy - prev.y) / step);
      for (let k = 1; k < n; k++) dab(prev.x + ((cx - prev.x) * k) / n, prev.y + ((cy - prev.y) * k) / n);
    }
    dab(cx, cy);
    prev = { x: cx, y: cy };
  }
}

/**
 * The finished cut-out from the picture and matte: edge cleaned by `refine`
 * (levels, optional feather, fringe colours) and applied. `box` is where the
 * trimmed picture sits, or the whole picture when `trim` is false.
 */
export interface Finish {
  /** Softening of the edge, pixels; 0 keeps the model's edge. */
  feather?: number;
  /** Cut the picture down to the subject's bounding box (plus `pad`). */
  trim?: boolean;
  pad?: number;
  /** Fix the colour of the rim. */
  decontaminate?: boolean;
}

export function finishCutout(pic: Rgba, matte: Matte, o: Finish = {}): { rgba: Rgba; matte: Matte; box: Box } {
  let m = matte;
  if (o.feather && o.feather > 0) m = featherMatte(m, o.feather);
  let colours = pic;
  if (o.decontaminate) colours = decontaminate(pic, m);
  let rgba = applyMatte(colours, m);
  let box: Box = { x: 0, y: 0, w: pic.w, h: pic.h };
  if (o.trim) {
    const found = boundingBox(m);
    if (found) {
      box = padBox(found, o.pad ?? 0, pic.w, pic.h);
      rgba = cropRgba(rgba, box);
    }
  }
  return { rgba, matte: m, box };
}

/** What can be cut out with, and what each is. Sizes are the files the browser downloads (read from the repositories' file lists; see docs/ideas/photo-research-cutout.md). */
export interface CutoutModel {
  id: 'portrait' | 'general';
  label: string;
  repo: string;
  /** Transformers.js weight type: 'q8' reads onnx/model_quantized.onnx, 'fp32' onnx/model.onnx. */
  dtype: 'q8' | 'fp32';
  downloadMb: number;
  license: string;
  /** The longest side the picture is shrunk to before it is given to the model. */
  inputMax: number;
  note: string;
}

export const CUTOUT_MODELS: CutoutModel[] = [
  {
    id: 'portrait',
    label: 'Quick - people and portraits',
    repo: 'Xenova/modnet',
    dtype: 'q8',
    downloadMb: 6.6,
    license: 'Apache-2.0',
    inputMax: 1024,
    note: 'A portrait matting model: best on people, weaker on objects.',
  },
  {
    id: 'general',
    label: 'Better - any subject, big download',
    repo: 'studioludens/birefnet-lite-512',
    dtype: 'fp32',
    downloadMb: 192,
    license: 'MIT',
    inputMax: 512,
    note: 'BiRefNet-lite at 512 px: handles products, animals and things as well as people, but is a large download and takes a few seconds a picture.',
  },
];

/** The size to shrink a w x h picture to so its longest side is at most `max` (never enlarged). */
export function fitInside(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** A plain sentence for what went wrong, from the error a download, the runtime or the memory limit threw. */
export function readableError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed|could not locate file|unauthorized|404/i.test(text))
    return 'The model could not be downloaded. Check your connection and try again; nothing was sent anywhere.';
  if (/out of memory|allocation|memory access out of bounds|std::bad_alloc|bad_alloc|RangeError/i.test(text))
    return 'The device ran out of memory for this picture. Try the quick model, or a smaller picture.';
  if (/aborted|AbortError/i.test(text)) return 'Cancelled.';
  return `The background could not be removed: ${text}`;
}
