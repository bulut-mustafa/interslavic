import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { track } from '../analytics.ts';
import { Elapsed } from '../transcribe/Elapsed.tsx';
import {
  CUTOUT_MODELS, applyMatte, coverage, featherMatte, fitInside, levelsMatte, paintStroke, readableError, resizeMatte,
  type Box, type CutoutModel, type Matte, type Rgba, type Stroke,
} from './cutout.ts';
import {
  buildCutout, canvasToPng, canvasToRgba, releaseCanvas, removeBackground, rgbaToCanvas, stageFraction, stageText,
  type Cutout, type PictureSource, type Stage,
} from './cutout-client.ts';
import './cutout.css';

/**
 * Remove a picture's background on the device. Asks first (what is downloaded,
 * from where, that the picture stays here), shows progress with a Cancel,
 * then a preview on a checkerboard to refine with a brush before it is used.
 *
 * What the editor receives (CutoutOutput): a PNG with transparency, its size,
 * and `box`, where that PNG sits inside the working picture (`scale` working
 * pixels per pixel of the original file, so `box / scale` is in file pixels).
 *  - onKeep:    the PNG trimmed to the subject, to be placed as a picture layer above the original.
 *  - onReplace: the PNG at the whole picture's size (box = the whole picture), to stand in for the original.
 */

export interface CutoutOutput {
  png: Blob;
  /** The PNG's own size. */
  width: number;
  height: number;
  /** Where it sits in the working picture. */
  box: Box;
  /** Working-picture pixels per source pixel. */
  scale: number;
  /** The working picture's size. */
  picture: { w: number; h: number };
}

/** Stand-ins for what needs a browser, so the dialog can be tested in jsdom. */
export interface CutoutDeps {
  run?: typeof removeBackground;
  readRgba?: (c: HTMLCanvasElement) => Rgba;
  /** The picture shrunk to w x h, for the preview. */
  shrink?: (c: HTMLCanvasElement, w: number, h: number) => Rgba;
  toCanvas?: (p: Rgba) => HTMLCanvasElement;
  toPng?: (c: HTMLCanvasElement) => Promise<Blob>;
}

export interface CutoutDialogProps {
  source: PictureSource;
  onKeep: (out: CutoutOutput) => void;
  onReplace: (out: CutoutOutput) => void;
  onClose: () => void;
  deps?: CutoutDeps;
  /** Shown inside something that is already a dialog (the phone's bottom sheet): no backdrop, no dialog role, no heading. */
  inline?: boolean;
}

const PREVIEW_MAX = 760;

function shrinkCanvas(c: HTMLCanvasElement, w: number, h: number): Rgba {
  const t = document.createElement('canvas');
  t.width = w;
  t.height = h;
  const ctx = t.getContext('2d')!;
  ctx.drawImage(c, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  releaseCanvas(t);
  return { w, h, data: d.data };
}

const mb = (n: number) => (n < 10 ? n.toFixed(1) : String(Math.round(n)));

export default function CutoutDialog({ source, onKeep, onReplace, onClose, deps = {}, inline = false }: CutoutDialogProps) {
  const run = deps.run ?? removeBackground;
  const readRgba = deps.readRgba ?? canvasToRgba;
  const shrink = deps.shrink ?? shrinkCanvas;
  const toCanvas = deps.toCanvas ?? rgbaToCanvas;
  const toPng = deps.toPng ?? canvasToPng;

  const [modelId, setModelId] = useState<CutoutModel['id']>('portrait');
  const model = CUTOUT_MODELS.find((m) => m.id === modelId)!;
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Cutout | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const running = stage.kind !== 'idle' && stage.kind !== 'done' && !result;

  // Refine state. The preview works on small copies; the strokes are replayed on the full-size matte at the end.
  const [mode, setMode] = useState<'add' | 'erase'>('erase');
  const [size, setSize] = useState(18);
  const [soften, setSoften] = useState(0);
  const [edge, setEdge] = useState(0);
  const [strokeCount, setStrokeCount] = useState(0);
  const strokes = useRef<Stroke[]>([]);
  const preview = useRef<{ pic: Rgba; matte: Matte; base: Matte; k: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const painting = useRef<Stroke | null>(null);

  const draw = useCallback(() => {
    const p = preview.current;
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!p || !c || !ctx) return;
    let m = p.matte;
    if (edge > 0) m = levelsMatte(m, edge * 8, 255 - edge * 4);
    if (soften > 0) m = featherMatte(m, soften * p.k);
    const out = applyMatte(p.pic, m);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(out.data), out.w, out.h), 0, 0);
  }, [soften, edge]);

  useEffect(draw, [draw, result, strokeCount]);

  // Let everything go when the dialog goes.
  const held = useRef<Cutout | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      releaseCanvas(held.current?.picture);
      releaseCanvas(held.current?.cutout);
    },
    [],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        abort.current?.abort();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const start = async () => {
    setError(null);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const r = await run(source, { model, signal: ctl.signal, onStage: setStage });
      if (ctl.signal.aborted) {
        releaseCanvas(r.picture);
        releaseCanvas(r.cutout);
        return;
      }
      held.current = r;
      const sz = fitInside(r.width, r.height, PREVIEW_MAX);
      const k = sz.w / r.width;
      const base = resizeMatte(r.matte, sz.w, sz.h);
      preview.current = { pic: shrink(r.picture, sz.w, sz.h), matte: { ...base, data: base.data.slice() }, base, k };
      strokes.current = [];
      setStrokeCount(0);
      setResult(r);
      setStage({ kind: 'done' });
      track('cutout', { model: modelId });
    } catch (err) {
      if (!ctl.signal.aborted) setError(readableError(err));
      setStage({ kind: 'idle' });
    }
  };
  const cancel = () => {
    abort.current?.abort();
    setStage({ kind: 'idle' });
  };

  // Brush.
  const at = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const k = preview.current!.k;
    return { x: ((e.clientX - r.left) * (c.width / (r.width || c.width))) / k, y: ((e.clientY - r.top) * (c.height / (r.height || c.height))) / k };
  };
  const paint = (s: Stroke) => paintStroke(preview.current!.matte, s, preview.current!.k);
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!preview.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const s: Stroke = { points: [at(e)], radius: size / preview.current.k, mode };
    painting.current = s;
    paint(s);
    draw();
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = painting.current;
    if (!s || !preview.current) return;
    const p = at(e);
    // Paint only the new piece: the line from the last point to this one.
    paint({ ...s, points: [s.points[s.points.length - 1]!, p] });
    s.points.push(p);
    draw();
  };
  const up = () => {
    if (!painting.current) return;
    strokes.current.push(painting.current);
    painting.current = null;
    setStrokeCount(strokes.current.length);
  };
  const undoStroke = () => {
    const p = preview.current;
    if (!p || !strokes.current.length) return;
    strokes.current.pop();
    p.matte = { ...p.base, data: p.base.data.slice() };
    for (const s of strokes.current) paint(s);
    setStrokeCount(strokes.current.length);
  };

  /** The refined matte at the picture's size: the model's, the strokes replayed, then the edge settings. */
  const finalMatte = (r: Cutout): Matte => {
    const m: Matte = { ...r.matte, data: r.matte.data.slice() };
    for (const s of strokes.current) paintStroke(m, s);
    return edge > 0 ? levelsMatte(m, edge * 8, 255 - edge * 4) : m;
  };

  const finish = async (trim: boolean, done: (o: CutoutOutput) => void) => {
    const r = result;
    if (!r) return;
    setBusy(true);
    try {
      const built = buildCutout(r.picture, finalMatte(r), { trim, feather: soften, decontaminate: true }, toCanvas, readRgba);
      const png = await toPng(built.canvas);
      const out: CutoutOutput = { png, width: built.box.w, height: built.box.h, box: built.box, scale: r.scale, picture: { w: r.width, h: r.height } };
      releaseCanvas(built.canvas);
      track('cutout-use', { how: trim ? 'layer' : 'replace' });
      done(out);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const sizeText = useMemo(() => `${mb(model.downloadMb)} MB`, [model]);

  const body = (
    <>
      <div className={inline ? 'cutout is-inline' : 'cutout'} role={inline ? 'group' : 'dialog'} aria-modal={inline ? undefined : true} aria-label="Remove the background">
        <h2>Remove the background</h2>

        {!result && !running && (
          <>
            <p className="cutout-consent">
              The first time, your browser downloads a model ({sizeText}) from huggingface.co and a small runtime from cdn.jsdelivr.net,
              then keeps them for next time. Those two sites see that you fetched the model; <strong>your picture is never uploaded</strong>,
              it is worked on in this tab.
            </p>
            <fieldset className="cutout-models">
              <legend>Model</legend>
              {CUTOUT_MODELS.map((m) => (
                <label key={m.id}>
                  <input type="radio" name="cutout-model" checked={m.id === modelId} onChange={() => setModelId(m.id)} />
                  <span>
                    {m.label} ({mb(m.downloadMb)} MB, {m.license})
                    <small>{m.note}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            {error && (
              <p className="cutout-error" role="alert">
                {error}
              </p>
            )}
            <div className="cutout-actions">
              <button type="button" className="text-button is-primary" onClick={start}>
                Download and remove the background
              </button>
              <button type="button" className="text-button" onClick={onClose}>
                Not now
              </button>
            </div>
          </>
        )}

        {running && (
          <div className="cutout-progress" role="status">
            <p>{stageText(stage)}</p>
            {stageFraction(stage) !== null ? <progress max={1} value={stageFraction(stage) ?? 0} /> : <progress />}
            <Elapsed />
            <div className="cutout-actions">
              <button type="button" className="text-button" onClick={cancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {result && (
          <>
            <div className="cutout-stage">
              <canvas
                ref={canvas}
                className="cutout-canvas"
                width={preview.current?.pic.w}
                height={preview.current?.pic.h}
                aria-label="Preview of the cut-out on a checkerboard. Paint to add back or erase."
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
              />
            </div>
            <div className="cutout-tools">
              <div role="radiogroup" aria-label="Brush" className="cutout-brush">
                <label>
                  <input type="radio" name="cutout-brush" checked={mode === 'erase'} onChange={() => setMode('erase')} /> Erase
                </label>
                <label>
                  <input type="radio" name="cutout-brush" checked={mode === 'add'} onChange={() => setMode('add')} /> Add back
                </label>
              </div>
              <label>
                Brush size
                <input type="range" min={4} max={80} value={size} onChange={(e) => setSize(+e.target.value)} />
              </label>
              <label>
                Soften the edge
                <input type="range" min={0} max={8} value={soften} onChange={(e) => setSoften(+e.target.value)} />
              </label>
              <label>
                Clean the edge
                <input type="range" min={0} max={8} value={edge} onChange={(e) => setEdge(+e.target.value)} />
              </label>
              <button type="button" className="text-button" onClick={undoStroke} disabled={!strokeCount}>
                Undo brush stroke
              </button>
            </div>
            {result && coverage(result.matte) < 0.01 && strokeCount === 0 && (
              <p className="cutout-error" role="status">
                Almost nothing was found to keep.{' '}
                {modelId === 'portrait' ? 'The quick model is made for people; choose the better model above and try again, or paint the part to keep with the brush.' : 'Paint the part to keep with the brush.'}
              </p>
            )}
            {error && (
              <p className="cutout-error" role="alert">
                {error}
              </p>
            )}
            <div className="cutout-actions">
              <button type="button" className="text-button is-primary" disabled={busy} onClick={() => finish(true, onKeep)}>
                Keep as picture layer
              </button>
              <button type="button" className="text-button" disabled={busy} onClick={() => finish(false, onReplace)}>
                Replace the background
              </button>
              <button type="button" className="text-button" onClick={onClose}>
                Discard
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
  if (inline) return body;
  return <div className="cutout-backdrop">{body}</div>;
}
