import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../analytics.ts';
import { DropZone, OpenAnother } from '../components/DropZone.tsx';
import { Icon } from '../components/Icon.tsx';
import { BottomSheet } from '../phone/BottomSheet.tsx';
import { Chip, ChipRow, PhoneIconButton } from '../phone/parts.tsx';
import { useIsPhone } from '../phone/useIsPhone.ts';
import { downloadText } from '../download.ts';
import { useToolActive } from '../studio/active.tsx';
import { guessLang } from './guess.ts';
import { takeHandoff } from './handoff.ts';
import { parseSrt } from './srt.ts';
import { MAX_CUES, buildSrt, translateCues, type CueResult, type Output, type Script, type SourceLang } from './translate.ts';

/**
 * Subtitles in English, Russian or Ukrainian to Interslavic, as an .srt file.
 * Opening a file starts the translation at once, in the language it is written
 * in; every translated line can then be corrected where it stands, and the
 * lines the translator doubted are marked until they are looked at. Runs in the
 * page: the file is read here, its text goes to the translator in small
 * batches, and the finished file is built here. Nothing is stored.
 */

const LANGS: { value: SourceLang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
  { value: 'uk', label: 'Ukrainian' },
];
const SCRIPTS: { value: Script; label: string }[] = [
  { value: 'standard', label: 'Latin' },
  { value: 'etymological', label: 'Etymological' },
  { value: 'simplified', label: 'Simplified' },
  { value: 'cyrillic', label: 'Cyrillic' },
];
const OUTPUTS: { value: Output; label: string }[] = [
  { value: 'isv', label: 'Interslavic only' },
  { value: 'bilingual', label: 'Interslavic and the original' },
];
/** How long typing or pasting must pause before the text is translated. A file that is opened starts at once. */
const PAUSE = 700;

const readFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });

export default function Subtitles() {
  // A transcript sent here from the Recording page arrives once, ready to translate.
  const [arrived] = useState(takeHandoff);
  const active = useToolActive();
  const phone = useIsPhone();
  /** Phone: the row being edited in the sheet, or the import/export sheet. */
  const [editing, setEditing] = useState<number | null>(null);
  const [fileSheet, setFileSheet] = useState(false);
  const [text, setText] = useState(arrived?.srt ?? '');
  const [fileName, setFileName] = useState(arrived?.name ?? 'subtitles.srt');
  const [lang, setLang] = useState<SourceLang>(arrived?.lang ?? 'en');
  const [script, setScript] = useState<Script>('standard');
  const [output, setOutput] = useState<Output>('isv');
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [results, setResults] = useState<CueResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  /** Lines the person has corrected or marked as checked: no longer "to check". */
  const [looked, setLooked] = useState<Set<number>>(new Set());
  /** The settings changed after corrections were made, so translating again would replace them: ask first. */
  const [stale, setStale] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const runs = useRef(0);
  const pause = useRef(arrived ? 0 : PAUSE);
  const lastText = useRef(text);
  const corrected = useRef(false);

  const cues = useMemo(() => parseSrt(text), [text]);
  const running = progress !== null;
  const tooMany = cues.length > MAX_CUES;

  /** A new text: forget the last result, and start translating it. `quick` for a file, which needs no pause for typing to settle. */
  const load = (next: string, name: string | null, quick: boolean, said?: SourceLang) => {
    pause.current = quick ? 0 : PAUSE;
    if (name) setFileName(name);
    const guess = said ?? guessLang(next);
    if (guess) setLang(guess);
    setText(next);
  };

  // The tool stays open while the user is elsewhere, so a transcript sent here meanwhile is taken when they arrive.
  useEffect(() => {
    if (!active) return;
    const h = takeHandoff();
    if (!h) return;
    load(h.srt, h.name, true, h.lang); // the Recording page knows the language it heard
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const run = async () => {
    const ctl = new AbortController();
    abort.current?.abort();
    abort.current = ctl;
    const mine = ++runs.current;
    setError(null);
    setStale(false);
    setProgress([0, 1]);
    try {
      const r = await translateCues(cues, {
        lang,
        script,
        signal: ctl.signal,
        onProgress: (done, total) => mine === runs.current && setProgress([done, total]),
      });
      if (mine !== runs.current) return;
      setResults(r);
      setLooked(new Set());
      corrected.current = false;
      track('subtitles-translate', { lang, script, cues: cues.length });
    } catch (err) {
      if (!ctl.signal.aborted && mine === runs.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mine === runs.current) setProgress(null);
    }
  };

  // Translate whenever there is something new to translate: a new text, or another language or script.
  useEffect(() => {
    const textChanged = text !== lastText.current;
    lastText.current = text;
    if (textChanged) {
      setResults(null);
      setLooked(new Set());
      corrected.current = false;
      setError(null);
    }
    if (cues.length === 0 || tooMany) return;
    if (!textChanged && corrected.current) {
      setStale(true); // corrections would be lost: ask first
      return;
    }
    const t = setTimeout(() => void run(), textChanged ? pause.current : 0);
    return () => {
      clearTimeout(t);
      abort.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, lang, script]);

  const correct = (i: number, value: string) => {
    corrected.current = true;
    setResults((all) => all && all.map((r, k) => (k === i ? { ...r, lines: value.split('\n') } : r)));
    setLooked((s) => new Set(s).add(i));
  };

  const toCheck = (i: number) => !!results?.[i]?.flagged && !looked.has(i);
  const flagged = results ? results.filter((_, i) => toCheck(i)).length : 0;
  const rows = (results ?? []).map((r, i) => ({ r, cue: cues[i]!, i })).filter((x) => !onlyFlagged || toCheck(x.i));
  const hasFile = cues.length > 0 && !tooMany;

  if (phone && hasFile) {
    const shown = rows.map((x) => x.i);
    const at = editing === null ? -1 : shown.indexOf(editing);
    const row = editing === null ? null : { r: results?.[editing], cue: cues[editing] };
    const step = (d: number) => {
      const n = shown[at + d];
      if (n !== undefined) setEditing(n);
    };
    return (
      <div className="ph-tool-screen ph-sub">
        <header className="ph-tool-head">
          <div className="ph-tool-head-row">
            <div className="ph-tool-head-text">
              <strong title={fileName}>{fileName}</strong>
              <span role="status">
                {progress
                  ? `Translating… ${progress[0]} of ${progress[1]} lines`
                  : results
                    ? `${cues.length} subtitles. ${flagged === 0 ? 'None needs a second look.' : `${flagged} to check.`}`
                    : `${cues.length} subtitles found.`}
              </span>
            </div>
            <PhoneIconButton icon="fileText" label="Import and export" onClick={() => setFileSheet(true)} />
          </div>
          <ChipRow label="Language and script">
            {LANGS.map((l) => (
              <Chip key={l.value} selected={lang === l.value} onClick={() => setLang(l.value)}>
                {l.label}
              </Chip>
            ))}
            <span className="ph-chip-sep" aria-hidden="true" />
            {SCRIPTS.map((sc) => (
              <Chip key={sc.value} selected={script === sc.value} onClick={() => setScript(sc.value)} label={`${sc.label} script`}>
                {sc.label}
              </Chip>
            ))}
            {flagged > 0 && (
              <>
                <span className="ph-chip-sep" aria-hidden="true" />
                <Chip selected={onlyFlagged} onClick={() => setOnlyFlagged(!onlyFlagged)}>
                  To check ({flagged})
                </Chip>
              </>
            )}
          </ChipRow>
        </header>

        <div className={`ph-tool-scroll${editing !== null || fileSheet ? ' ph-sheet-open' : ''}`}>
          {stale && !running && (
            <p className="ph-note-card" role="status">
              The settings changed, but you have corrected some lines, and translating again would replace them.
            </p>
          )}
          {error && (
            <div className="ph-note-card is-error" role="alert">
              <strong>The translation stopped</strong>
              <span>{error}</span>
            </div>
          )}
          {results ? (
            <ul className="ph-list" aria-label="Subtitles">
              {rows.map(({ r, cue, i }) => (
                <li key={i}>
                  <button type="button" className={`ph-row ph-subrow${toCheck(i) ? ' is-flagged' : ''}`} aria-label={`Edit subtitle ${cue.index ?? i + 1}`} onClick={() => setEditing(i)}>
                    <small>{cue.index ?? i + 1}</small>
                    <span className="ph-subrow-isv" lang="isv">{r.lines.join(' ')}</span>
                    <span className="ph-subrow-orig">{cue.lines.join(' ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="ph-list" aria-label="Subtitles to translate">
              {cues.map((cue, i) => (
                <li key={i} className="ph-row ph-subrow">
                  <small>{cue.index ?? i + 1}</small>
                  <span className="ph-subrow-orig">{cue.lines.join(' ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ph-tool-bar">
          {running ? (
            <button type="button" className="ph-secondary is-wide" onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          ) : (
            <button
              type="button"
              className="ph-primary"
              onClick={() => {
                corrected.current = false;
                void run();
              }}
            >
              <Icon name="translate" /> Translate all
            </button>
          )}
        </div>

        <BottomSheet
          open={editing !== null || fileSheet}
          onClose={() => {
            setEditing(null);
            setFileSheet(false);
          }}
          title={fileSheet ? 'Import and export' : row ? `Subtitle ${row.cue?.index ?? (editing ?? 0) + 1}` : 'Subtitle'}
          detents={['half', 'full']}
          headerAction={
            <button
              type="button"
              className="ph-sheet-done"
              onClick={() => {
                setEditing(null);
                setFileSheet(false);
              }}
            >
              Done
            </button>
          }
        >
          {fileSheet ? (
            <div className="ph-sheet-stack">
              <label className="ph-secondary is-wide ph-file-pick">
                <Icon name="plus" /> Open another .srt file
                <input
                  type="file"
                  accept=".srt,text/plain"
                  aria-label="Subtitle file (.srt)"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    setResults(null);
                    load(await readFile(f), f.name, true);
                    setFileSheet(false);
                  }}
                />
              </label>
              <label>
                File contains
                <select value={output} onChange={(e) => setOutput(e.target.value as Output)} aria-label="File contains">
                  {OUTPUTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="ph-primary"
                disabled={!results || running}
                onClick={() => {
                  downloadText(fileName.replace(/\.srt$/i, '') + '.isv.srt', buildSrt(cues, results!, output), 'application/x-subrip');
                  track('subtitles-download', { output });
                }}
              >
                <Icon name="save" /> Download .srt
              </button>
            </div>
          ) : row && row.cue ? (
            <div className="ph-sheet-stack">
              <p className="ph-sub-orig">{row.cue.lines.join(' ')}</p>
              {row.r && (
                <label>
                  Interslavic
                  <textarea lang="isv" spellCheck={false} rows={Math.max(3, row.r.lines.length + 1)} aria-label={`Interslavic for subtitle ${row.cue.index ?? (editing ?? 0) + 1}`} value={row.r.lines.join('\n')} onChange={(e) => correct(editing!, e.target.value)} />
                </label>
              )}
              {editing !== null && toCheck(editing) && (
                <div className="ph-note-card">
                  <span>{results?.[editing]?.reasons.join('; ') || 'Worth a look'}</span>
                  <button type="button" className="ph-secondary" onClick={() => setLooked((x) => new Set(x).add(editing))}>
                    <Icon name="check" /> Mark as checked
                  </button>
                </div>
              )}
              <div className="ph-sheet-row">
                <button type="button" className="ph-secondary" disabled={at <= 0} onClick={() => step(-1)} aria-label="Previous subtitle">
                  <Icon name="chevronLeft" /> Previous
                </button>
                <button type="button" className="ph-secondary" disabled={at < 0 || at >= shown.length - 1} onClick={() => step(1)} aria-label="Next subtitle">
                  Next <Icon name="chevronRight" />
                </button>
              </div>
            </div>
          ) : null}
        </BottomSheet>
      </div>
    );
  }

  if (!hasFile) {
    return (
      <main className="subtitles">
        <h1>Subtitles to Interslavic</h1>
        <p className="lesson-summary">Open an .srt file in English, Russian or Ukrainian. It is translated as soon as it opens.</p>
        <DropZone
          name="Subtitle file (.srt)"
          title="Drop a subtitle file here, or click to browse"
          hint="SubRip (.srt), English, Russian or Ukrainian"
          accept=".srt,text/plain"
          kind="file"
          noun="a subtitle (.srt) file"
          file={null}
          onFile={async (f) => load(await readFile(f), f.name, true)}
        />
        <details className="sub-paste">
          <summary>Paste the text instead</summary>
          <textarea aria-label="or paste it here" value={text} onChange={(e) => load(e.target.value, null, false)} spellCheck={false} rows={8} />
        </details>
        {text.trim() !== '' && cues.length === 0 && (
          <p className="error-line" role="alert">
            No subtitles found. The file should be SubRip (.srt): a time line such as 00:00:01,000 --&gt; 00:00:03,500 followed by the text.
          </p>
        )}
        {tooMany && (
          <p className="error-line" role="alert">
            This file has {cues.length} subtitles; the limit is {MAX_CUES}. Split it and translate the parts.
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="subtitles is-open">
      <div className="editor-bar sub-bar" role="toolbar" aria-label="Subtitle tools">
        <span className="editor-file" title={fileName}>
          {fileName}
        </span>
        <span className="sub-count">{cues.length} subtitles found.</span>
        <OpenAnother
          name="Subtitle file (.srt)"
          accept=".srt,text/plain"
          noun="a subtitle (.srt) file"
          onFile={async (f) => {
            setResults(null);
            load(await readFile(f), f.name, true);
          }}
        />
        <span className="editor-gap" />
        <label className="sub-field">
          <span>From</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as SourceLang)} aria-label="Translate from">
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="sub-field">
          <span>Script</span>
          <select value={script} onChange={(e) => setScript(e.target.value as Script)} aria-label="Script">
            {SCRIPTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="sub-field">
          <span>File contains</span>
          <select value={output} onChange={(e) => setOutput(e.target.value as Output)} aria-label="File contains">
            {OUTPUTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {running ? (
          <button type="button" className="text-button" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="text-button is-primary"
            disabled={!results}
            onClick={() => {
              downloadText(fileName.replace(/\.srt$/i, '') + '.isv.srt', buildSrt(cues, results!, output), 'application/x-subrip');
              track('subtitles-download', { output });
            }}
          >
            <Icon name="save" /> Download .srt
          </button>
        )}
      </div>

      {progress && (
        <p role="status" className="note">
          Translating… {progress[0]} of {progress[1]} lines
        </p>
      )}
      {stale && !running && (
        <p className="replace-banner" role="status">
          The settings changed, but you have corrected some lines, and translating again would replace them.{' '}
          <button type="button" className="text-button is-primary" onClick={() => { corrected.current = false; void run(); }}>
            Translate again
          </button>
        </p>
      )}
      {error && (
        <div className="error">
          <h2>The translation stopped</h2>
          <p>{error}</p>
          <button type="button" className="text-button" onClick={() => void run()}>
            Try again
          </button>
        </div>
      )}

      {results && (
        <section className="subtitles-result" aria-label="Translated subtitles">
          <p role="status" className="sub-summary">
            {cues.length} subtitles translated. {flagged === 0 ? 'None needs a second look.' : `${flagged} to check.`}
            {flagged > 0 && (
              <label className="subtitles-only-flagged">
                <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
                <span>Show only the ones to check</span>
              </label>
            )}
          </p>
          <div className="sub-grid" role="table" aria-label="Subtitles">
            <div className="sub-row sub-head" role="row">
              <span role="columnheader">#</span>
              <span role="columnheader">Original</span>
              <span role="columnheader">Interslavic (you can correct it here)</span>
            </div>
            {rows.map(({ r, cue, i }) => (
              <div key={i} role="row" className={`sub-row${toCheck(i) ? ' is-flagged' : ''}`}>
                <span role="cell" className="sub-n">
                  {cue.index ?? i + 1}
                </span>
                <span role="cell" className="sub-original">
                  {cue.lines.join(' ')}
                </span>
                <span role="cell" className="sub-isv">
                  <textarea
                    lang="isv"
                    spellCheck={false}
                    rows={Math.max(1, r.lines.length)}
                    aria-label={`Interslavic for subtitle ${cue.index ?? i + 1}`}
                    value={r.lines.join('\n')}
                    onChange={(e) => correct(i, e.target.value)}
                  />
                  {toCheck(i) && (
                    <span className="sub-why">
                      <span>{r.reasons.join('; ') || 'Worth a look'}</span>
                      <button type="button" className="icon-button" aria-label={`Mark subtitle ${cue.index ?? i + 1} as checked`} title="Mark as checked" onClick={() => setLooked((s) => new Set(s).add(i))}>
                        <Icon name="check" size="0.9rem" />
                      </button>
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
