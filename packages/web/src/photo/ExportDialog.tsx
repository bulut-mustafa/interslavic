import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { EXTENSION, FORMAT_LABEL, SCALE_MAX, SCALE_MIN, estimateBytes, fitScale, formatBytes, hasQuality, supportsTransparency, type ExportFormat, type ExportRequest } from './export.ts';
import './export.css';

export interface ExportPageInfo {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface ExportDialogProps {
  pages: ExportPageInfo[];
  currentId: string;
  onExport(request: ExportRequest): void;
  onClose(): void;
  /** Canvas pixel limit for the size warning; the browser's own by default (a test gives one). */
  maxPixels?: number;
}

const FORMATS: ExportFormat[] = ['png', 'jpeg', 'webp', 'pdf'];
const PRESETS = [0.5, 1, 2];

const FORMAT_KEY = 'interslavic-photo-export-format';
const rememberedFormat = (): ExportFormat => {
  try {
    const f = localStorage.getItem(FORMAT_KEY) as ExportFormat | null;
    if (f && FORMATS.includes(f)) return f;
  } catch {
    /* storage blocked */
  }
  return 'png';
};

/** The window that asks how to hand the finished picture over. It makes nothing itself: `onExport` gets the choices. */
export function ExportDialog({ pages, currentId, onExport, onClose, maxPixels }: ExportDialogProps) {
  const [format, setFormatState] = useState<ExportFormat>(rememberedFormat);
  const setFormat = (f: ExportFormat) => {
    setFormatState(f);
    try {
      localStorage.setItem(FORMAT_KEY, f);
    } catch {
      /* not remembered where storage is blocked */
    }
  };
  const [quality, setQuality] = useState(0.92);
  const [scale, setScale] = useState(1);
  const [mode, setMode] = useState<'scale' | 'pixels'>('scale');
  const [transparent, setTransparent] = useState(false);
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const firstFocus = useRef<HTMLButtonElement>(null);

  const current = pages.find((p) => p.id === currentId) ?? pages[0]!;
  const many = pages.length > 1;

  // Focus goes in on opening and back to where it was on closing; Tab stays inside; Escape closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    firstFocus.current?.focus();
    return () => before?.focus?.();
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const targets = scope === 'all' ? pages : [current];
  const fits = useMemo(() => targets.map((p) => ({ p, fit: fitScale(p.width, p.height, scale, maxPixels) })), [targets, scale, maxPixels]);
  const shown = fits.find((f) => f.p.id === current.id) ?? fits[0]!;
  const capped = fits.some((f) => f.fit.capped);
  const total = fits.reduce((n, f) => n + estimateBytes(f.fit.width, f.fit.height, format === 'pdf' ? 'jpeg' : format, quality), 0);
  const clamp = (n: number) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, n));

  return (
    <div className="export-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} className="export-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <h2 id={titleId}>Download</h2>

        <fieldset>
          <legend>Format</legend>
          <div className="export-row" role="radiogroup" aria-label="Format">
            {FORMATS.map((f, i) => (
              <button key={f} ref={i === 0 ? firstFocus : undefined} type="button" role="radio" aria-checked={format === f} className="export-choice" onClick={() => setFormat(f)}>
                {FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
          {format === 'pdf' && <p className="export-note">The PDF holds each page as a JPG picture, one picture per page.</p>}
        </fieldset>

        {hasQuality(format) && (
          <fieldset>
            <legend>Quality</legend>
            <div className="export-row">
              <input type="range" aria-label="Quality" min={0.1} max={1} step={0.01} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
              <span>{Math.round(quality * 100)}%</span>
            </div>
          </fieldset>
        )}

        <fieldset>
          <legend>Size</legend>
          <div className="export-row" role="radiogroup" aria-label="Size">
            {PRESETS.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={mode === 'scale' && scale === s} className="export-choice" onClick={() => { setMode('scale'); setScale(s); }}>
                {s}x
              </button>
            ))}
            <button type="button" role="radio" aria-checked={mode === 'pixels'} className="export-choice" onClick={() => setMode('pixels')}>
              Pixels
            </button>
          </div>
          {mode === 'pixels' && (
            <div className="export-row" style={{ marginTop: 'var(--space-2)' }}>
              <label>
                Width{' '}
                <input type="number" inputMode="numeric" min={1} aria-label="Width in pixels" value={Math.round(current.width * scale)} onChange={(e) => { const v = Number(e.target.value); if (v > 0) setScale(clamp(v / current.width)); }} />
              </label>
              <span aria-hidden="true">×</span>
              <label>
                Height{' '}
                <input type="number" inputMode="numeric" min={1} aria-label="Height in pixels" value={Math.round(current.height * scale)} onChange={(e) => { const v = Number(e.target.value); if (v > 0) setScale(clamp(v / current.height)); }} />
              </label>
            </div>
          )}
          {mode === 'pixels' && <p className="export-note">Width and height keep the picture's shape; sizes from {SCALE_MIN}x to {SCALE_MAX}x of the page.</p>}
        </fieldset>

        {supportsTransparency(format) ? (
          <label className="export-check">
            <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent background
          </label>
        ) : (
          <p className="export-note">{format === 'pdf' ? 'A PDF' : 'JPG'} has no see-through parts, so the background is filled white.</p>
        )}

        {many && (
          <fieldset style={{ marginTop: 'var(--space-3)' }}>
            <legend>Pages</legend>
            <div className="export-row" role="radiogroup" aria-label="Pages">
              <button type="button" role="radio" aria-checked={scope === 'current'} className="export-choice" onClick={() => setScope('current')}>
                This page
              </button>
              <button type="button" role="radio" aria-checked={scope === 'all'} className="export-choice" onClick={() => setScope('all')}>
                {format === 'pdf' ? `All ${pages.length} pages in one PDF` : `All ${pages.length} pages as a zip`}
              </button>
            </div>
          </fieldset>
        )}

        <p className="export-summary" aria-live="polite">
          {shown.fit.width} × {shown.fit.height} px · {EXTENSION[format].toUpperCase()}, at most about {formatBytes(total)}
          {scope === 'all' && ` for all ${pages.length}`}
          {capped && <span className="export-warning" role="alert"> This browser cannot make a picture that large, so it is made as large as it can: the size shown.</span>}
        </p>

        <div className="export-actions">
          <button type="button" className="text-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="text-button is-primary" onClick={() => onExport({ format, quality, scale, transparent: transparent && supportsTransparency(format), scope })}>
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
