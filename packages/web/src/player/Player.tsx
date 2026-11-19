import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '../analytics.ts';
import { DropZone } from '../components/DropZone.tsx';
import { Icon } from '../components/Icon.tsx';
import { useToolActive } from '../studio/active.tsx';
import { downloadText } from '../download.ts';
import type { Direction } from '../learn/anki.ts';
import { WordCard } from '../read/WordCard.tsx';
import { cueSeconds, parseSrt, type Cue } from '../subtitles/srt.ts';
import type { AnalyzedWord, TextAnalysis } from '../../../lexicon/src/analyze.ts';
import { addNote, clearNotes, loadNotes, removeNote, type Note } from './notebook.ts';
import { notesTsv } from './notes-anki.ts';
import { assignSubtitles, isMedia, isSubtitles, type Subtitle } from './files.ts';
import { clock, cueAt, cueNear } from './timeline.ts';

// Same origin: the engine serves the page in production, Vite proxies in dev.
const API = '';
const SPEEDS = [0.5, 0.75, 1, 1.25];

async function analyse(text: string): Promise<TextAnalysis> {
  const res = await fetch(`${API}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const body = (await res.json().catch(() => ({}))) as TextAnalysis & { error?: string };
  if (!res.ok) throw new Error(body.error ?? 'The reader is not answering.');
  return body;
}

const readText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });

/**
 * Watch a video with its Interslavic subtitles and learn from them: tap a word
 * to see what it is, repeat a line, slow the speech down, save a sentence for
 * Anki. The video never leaves the device - it plays from the file on disk -
 * and the words are looked up with the same dictionary as the Read page.
 */
export default function Player() {
  const video = useRef<HTMLVideoElement>(null);
  const active = useToolActive();
  // Moving to another tool must not leave a video playing out of sight.
  useEffect(() => {
    if (!active) video.current?.pause();
  }, [active]);
  const [src, setSrc] = useState<string | null>(null);
  const [videoName, setVideoName] = useState('video');
  const [isvSub, setIsvSub] = useState<Subtitle | null>(null);
  const [origSub, setOrigSub] = useState<Subtitle | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isv, setIsv] = useState<Cue[]>([]);
  const [original, setOriginal] = useState<Cue[]>([]);
  const [time, setTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [loopCue, setLoopCue] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<TextAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [word, setWord] = useState<AnalyzedWord | null>(null);
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const cache = useRef(new Map<string, TextAnalysis>());
  const loopRef = useRef<number | null>(null);
  loopRef.current = loopCue;
  const cuesRef = useRef<Cue[]>([]);
  cuesRef.current = isv;

  const current = cueNear(isv, time);
  const cue = current >= 0 ? isv[current]! : null;
  const cueText = cue ? cue.lines.join(' ') : '';
  const originalCue = cue ? original[cueAt(original, cueSeconds(cue).start + 0.01)] : undefined;

  // Follow the video's clock closely enough to loop a line without running into the next one.
  const follow = useCallback(() => {
    const v = video.current;
    if (!v) return;
    const loop = loopRef.current;
    if (loop !== null && cuesRef.current[loop]) {
      const { start, end } = cueSeconds(cuesRef.current[loop]!);
      if (v.currentTime >= end || v.currentTime < start - 0.3) v.currentTime = start;
    }
    setTime(v.currentTime);
  }, []);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      follow();
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const stop = () => cancelAnimationFrame(raf);
    v.addEventListener('play', start);
    v.addEventListener('pause', stop);
    v.addEventListener('ended', stop);
    v.addEventListener('timeupdate', follow);
    v.addEventListener('seeked', follow);
    return () => {
      stop();
      v.removeEventListener('play', start);
      v.removeEventListener('pause', stop);
      v.removeEventListener('ended', stop);
      v.removeEventListener('timeupdate', follow);
      v.removeEventListener('seeked', follow);
    };
  }, [src, follow]);

  useEffect(() => {
    if (video.current) video.current.playbackRate = rate;
  }, [rate, src]);

  // The words of the line on screen, looked up once per line.
  useEffect(() => {
    setWord(null);
    if (!cueText) {
      setAnalysis(null);
      return;
    }
    const hit = cache.current.get(cueText);
    if (hit) {
      setAnalysis(hit);
      return;
    }
    let live = true;
    analyse(cueText)
      .then((a) => {
        cache.current.set(cueText, a);
        if (live) {
          setAnalysis(a);
          setError(null);
        }
      })
      .catch((e: unknown) => live && (setAnalysis(null), setError(e instanceof Error ? e.message : String(e))));
    return () => {
      live = false;
    };
  }, [cueText]);

  const jump = (i: number) => {
    const v = video.current;
    const c = isv[i];
    if (!v || !c) return;
    v.currentTime = cueSeconds(c).start;
    setLoopCue((l) => (l === null ? null : i));
    void v.play?.();
  };

  const setSubtitles = (isvNext: Subtitle | null, origNext: Subtitle | null) => {
    setIsvSub(isvNext);
    setOrigSub(origNext);
    setIsv(isvNext ? parseSrt(isvNext.text) : []);
    setOriginal(origNext ? parseSrt(origNext.text) : []);
    setLoopCue(null);
  };

  /** Files dropped or chosen, together or one at a time: the video, and up to two subtitle files, each put where it belongs. */
  const takeFiles = async (files: File[]) => {
    setProblem(null);
    const media = files.find(isMedia);
    if (media) {
      if (src) URL.revokeObjectURL(src);
      setSrc(URL.createObjectURL(media));
      setVideoName(media.name);
    }
    const subs = files.filter(isSubtitles);
    if (subs.length > 0) {
      const read = await Promise.all(subs.map(async (f) => ({ name: f.name, text: await readText(f) })));
      const kept = [isvSub, origSub].filter((x): x is Subtitle => x !== null);
      const all = [...kept.filter((k) => !read.some((r) => r.name === k.name)), ...read].slice(-2);
      const { isv: a, original: b } = assignSubtitles(all);
      setSubtitles(a ?? null, b ?? null);
    }
    if (!media && subs.length === 0) setProblem('Drop a video and its subtitles (an .srt).');
  };

  const save = () => {
    if (!cue) return;
    setNotes(addNote({ isv: cueText, original: originalCue?.lines.join(' '), video: videoName, at: cueSeconds(cue).start }));
    track('player-save');
  };

  const loaded = src !== null || isv.length > 0;
  const FILES = 'video/*,audio/*,.srt,text/plain';

  if (!loaded) {
    return (
      <main className="player">
        <h1>Learn from a video</h1>
        <p className="lesson-summary">Drop a video and its Interslavic subtitles (an .srt, made on the Subtitles page) together. Tap any word to see what it is. The video plays from your own file and is never uploaded.</p>
        <DropZone
          name="Video and subtitle files"
          title="Drop a video and its subtitles here"
          hint="MP4, WebM, MOV and one or two .srt files, in any order"
          accept={FILES}
          kind="video"
          noun="a video or subtitle (.srt) file"
          file={null}
          onFile={(f) => void takeFiles([f])}
          onFiles={(fs) => void takeFiles(fs)}
        />
        {problem && (
          <p className="error-line" role="alert">
            {problem}
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="player">
      <div className="editor">
        <div className="editor-stage">
          <div className="editor-bar" role="toolbar" aria-label="Watch tools">
            <span className="chip" title={videoName}>
              <Icon name="play" size="0.8rem" /> {src ? videoName : 'No video yet'}
            </span>
            <span className="chip" title="Interslavic subtitles">
              <Icon name="subtitles" size="0.9rem" /> {isvSub ? isvSub.name : 'No subtitles yet'}
            </span>
            {origSub && (
              <>
                <button type="button" className="icon-button" aria-label="Swap the Interslavic and original subtitles" title="Swap them, if the wrong one is shown as Interslavic" onClick={() => setSubtitles(origSub, isvSub)}>
                  <Icon name="swap" size="0.95rem" />
                </button>
                <span className="chip is-quiet" title="Original subtitles">
                  {origSub.name}
                </span>
              </>
            )}
            <span className="editor-gap" />
            <label className="text-button open-another">
              <Icon name="plus" /> Add files
              <input
                type="file"
                multiple
                accept={FILES}
                aria-label="Video and subtitle files"
                onChange={(e) => {
                  void takeFiles([...(e.target.files ?? [])]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {problem && (
            <p className="error-line" role="alert">
              {problem}
            </p>
          )}

          {src ? <video ref={video} src={src} controls className="player-video" /> : <p className="note">Add the video (drop it here or use Add files) to watch it with the subtitles.</p>}
          {src && isv.length === 0 && <p className="note">Add the Interslavic subtitles (an .srt) to see them here.</p>}

          {src && isv.length > 0 && (
            <section className="player-line" aria-label="Current subtitle">
              <p className="player-cue" lang="isv" aria-live="polite">
                {cue === null
                  ? '…'
                  : (analysis?.tokens ?? [{ kind: 'gap' as const, text: cueText }]).map((t, i) =>
                      t.kind === 'gap' ? (
                        <span key={i}>{t.text}</span>
                      ) : (
                        <button
                          key={i}
                          type="button"
                          className={['output-word', t.status === 'unknown' ? 'is-unfound' : '', t.status === 'maybe-name' ? 'is-name' : '', word === t ? 'is-active' : ''].filter(Boolean).join(' ')}
                          onClick={() => {
                            video.current?.pause();
                            setWord(t);
                          }}
                        >
                          {t.text}
                        </button>
                      ),
                    )}
              </p>
              {originalCue && <p className="player-original">{originalCue.lines.join(' ')}</p>}
              {error && <p className="error-line">{error}</p>}

              <div className="player-controls">
                <button type="button" className="icon-button" aria-label="Previous line" title="Previous line" onClick={() => jump(Math.max(0, current - 1))} disabled={current <= 0}>
                  <Icon name="arrowLeft" />
                </button>
                <button type="button" className="icon-button" aria-label="Next line" title="Next line" onClick={() => jump(Math.min(isv.length - 1, current + 1))} disabled={current >= isv.length - 1}>
                  <Icon name="arrowRight" />
                </button>
                <button
                  type="button"
                  className={`switch is-compact${loopCue !== null ? ' is-on' : ''}`}
                  aria-pressed={loopCue !== null}
                  onClick={() => setLoopCue(loopCue === null && current >= 0 ? current : null)}
                  disabled={current < 0}
                >
                  <Icon name="redo" />
                  <span>{loopCue !== null ? 'Stop repeating' : 'Repeat this line'}</span>
                </button>
                <label className="player-speed">
                  <span>Speed</span>
                  <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>
                    {SPEEDS.map((s) => (
                      <option key={s} value={s}>
                        {s}×
                      </option>
                    ))}
                  </select>
                </label>
                <span className="editor-gap" />
                <button type="button" className="text-button is-primary" onClick={save} disabled={!cue}>
                  <Icon name="plus" /> Save sentence
                </button>
              </div>
            </section>
          )}
        </div>

        <aside className="editor-side" aria-label="Words and saved sentences">
          {word ? (
            <WordCard word={word} />
          ) : (
            <section className="inspector is-idle" aria-label="Words">
              <p className="note">Tap a word in the subtitle to see what it is.</p>
            </section>
          )}

          {notes.length > 0 && (
            <section className="player-notes inspector" aria-label="Saved sentences">
              <h2>Saved sentences ({notes.length})</h2>
              <ul>
                {notes.map((n) => (
                  <li key={n.id}>
                    <span lang="isv">{n.isv}</span>
                    <span className="player-note-from">
                      {n.video}, {clock(n.at)}
                    </span>
                    <button type="button" className="icon-button" onClick={() => setNotes(removeNote(n.id))} aria-label={`Remove: ${n.isv}`} title="Remove">
                      <Icon name="trash" size="0.9rem" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="player-export">
                {(['isv-en', 'en-isv'] as Direction[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="text-button"
                    onClick={() => {
                      downloadText('interslavic-video-sentences-anki.txt', notesTsv(notes, d), 'text/tab-separated-values');
                      track('anki-export', { direction: d, from: 'video' });
                    }}
                  >
                    {d === 'isv-en' ? 'Download for Anki: Interslavic first' : 'Download for Anki: original first'}
                  </button>
                ))}
                <button type="button" className="text-button" onClick={() => setNotes(clearNotes())}>
                  Clear all
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
