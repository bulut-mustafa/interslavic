import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../analytics.ts';
import { DropZone, OpenAnother } from '../components/DropZone.tsx';
import { Icon } from '../components/Icon.tsx';
import { downloadText } from '../download.ts';
import { navigate } from '../router.tsx';
import { putHandoff } from '../subtitles/handoff.ts';
import { formatSrt, type Cue } from '../subtitles/srt.ts';
import { Elapsed } from './Elapsed.tsx';
import { MODELS, type Lang, type WhisperModel } from './models.ts';
import { stageFraction, stageText, transcribeFile, type Deps, type Stage } from './run.ts';

/** Where a subtitle starts, in seconds, from its "00:00:01,500 --> 00:00:03,000" line. */
export function startOf(timing: string): number {
  const m = timing.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : 0;
}

const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
  { value: 'uk', label: 'Ukrainian' },
];

/**
 * Speech in a recording to subtitles, on the user's own device: the file is
 * decoded here, a Whisper model (downloaded once, then cached by the browser)
 * transcribes it in a worker, and the result can be corrected, saved as an .srt,
 * or sent on to the Subtitles page to be translated into Interslavic.
 */
export default function Transcribe({ makeTranscriber, decodeAudio }: Deps) {
  const [file, setFile] = useState<File | null>(null);
  const [lang, setLang] = useState<Lang>('en');
  const [modelId, setModelId] = useState<WhisperModel['id']>('small');
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [cues, setCues] = useState<Cue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const model = MODELS.find((m) => m.id === modelId)!;
  const running = stage.kind !== 'idle' && stage.kind !== 'done';

  const stop = () => abort.current?.abort();

  const start = async () => {
    if (!file) return;
    setError(null);
    setCues(null);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const done = await transcribeFile(file, { lang, model, signal: ctl.signal, makeTranscriber, decodeAudio, onStage: setStage });
      if (!done) return;
      setCues(done.cues);
      setStage({ kind: 'done' });
      track('transcribe', { lang, model: modelId, minutes: Math.round(done.seconds / 60) });
    } catch (err) {
      if (!ctl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      setStage({ kind: 'idle' });
    }
  };

  const base = (file?.name ?? 'transcript').replace(/\.[^.]+$/, '');

  // The recording, to listen to while correcting what was heard.
  const audioRef = useRef<HTMLAudioElement>(null);
  const url = useMemo(() => (file && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => (url && typeof URL.revokeObjectURL === 'function' ? URL.revokeObjectURL(url) : undefined), [url]);
  const playFrom = (t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = t;
    void a.play?.();
  };

  const pick = (f: File) => {
    setFile(f);
    setCues(null);
    setError(null);
    setStage({ kind: 'idle' });
  };

  const notes = (
    <details className="transcribe-more">
      <summary>How this works, and how accurate it is</summary>
      <section className="transcribe-notes" aria-label="How this works">
        <p>
          The first time, your browser downloads a speech model ({model.downloadMb} MB for {model.id}) from huggingface.co and a small
          runtime from cdn.jsdelivr.net, then keeps them. Those two sites see that you downloaded the model, not your recording.
        </p>
        <p>
          Quality depends on the language and the model. On clean read speech the Whisper paper reports these word error rates for
          the {model.id} model: <strong>English {model.wer.en}%</strong>, <strong>Russian {model.wer.ru}%</strong>,{' '}
          <strong>Ukrainian {model.wer.uk}%</strong>. Recordings with music, noise or several speakers do worse, so read the
          transcript and correct it before translating. Errors in the transcript carry over into the Interslavic.
        </p>
      </section>
    </details>
  );

  const fraction = stageFraction(stage);

  return (
    <main className="transcribe">
      {!file ? (
        <>
          <h1>Recording to subtitles</h1>
          <p className="lesson-summary">Turn the speech in an audio or video file into subtitles. The recording is processed in your browser and never uploaded.</p>
          <DropZone
            name="Audio or video file"
            title="Drop a recording here, or click to browse"
            hint="MP3, WAV, M4A, MP4, WebM · up to 200 MB"
            accept="audio/*,video/*"
            kind="audio"
            noun="an audio or video file"
            file={file}
            disabled={running}
            onFile={pick}
          />
        </>
      ) : (
        <div className="editor-bar" role="toolbar" aria-label="Recording tools">
          <span className="editor-file" title={file.name}>
            {file.name}
          </span>
          <OpenAnother name="Audio or video file" accept="audio/*,video/*" noun="an audio or video file" disabled={running} onFile={pick} />
          <span className="editor-gap" />
          <label className="sub-field">
            <span>Spoken language</span>
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} disabled={running} aria-label="Spoken language">
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sub-field">
            <span>Model</span>
            <select value={modelId} onChange={(e) => setModelId(e.target.value as WhisperModel['id'])} disabled={running} aria-label="Model">
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.downloadMb} MB)
                </option>
              ))}
            </select>
          </label>
          {running ? (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                stop();
                setStage({ kind: 'idle' });
              }}
            >
              Cancel
            </button>
          ) : (
            <button type="button" className="text-button is-primary" onClick={() => void start()}>
              <Icon name="mic" /> Transcribe
            </button>
          )}
        </div>
      )}

      {stage.kind !== 'idle' && stage.kind !== 'done' && (
        <div role="status" className="transcribe-progress">
          <div className="progress-bar" aria-hidden="true">
            <span className={fraction === null ? 'is-moving' : undefined} style={fraction === null ? undefined : { width: `${Math.round(fraction * 100)}%` }} />
          </div>
          <p>
            {stageText(stage)} <Elapsed />
          </p>
        </div>
      )}
      {error && (
        <div className="error">
          <h2>Transcription stopped</h2>
          <p>{error}</p>
        </div>
      )}

      {cues && (
        <section className="transcribe-result" aria-label="Transcript">
          <p role="status">{cues.length === 0 ? 'No speech was found.' : `${cues.length} subtitles. Listen, and correct what is wrong.`}</p>
          {cues.length > 0 && (
            <>
              <div className="transcribe-deck">
                {url && <audio ref={audioRef} src={url} controls preload="metadata" aria-label="The recording" />}
                <span className="editor-gap" />
                <button type="button" className="text-button" onClick={() => downloadText(`${base}.srt`, formatSrt(cues), 'application/x-subrip')}>
                  <Icon name="save" /> Download .srt
                </button>
                <button
                  type="button"
                  className="text-button is-primary"
                  onClick={() => {
                    putHandoff({ srt: formatSrt(cues), lang, name: `${base}.srt` });
                    navigate('/studio/subtitles');
                  }}
                >
                  <Icon name="translate" /> Translate to Interslavic
                </button>
              </div>
              <ol className="transcribe-cues">
                {cues.map((c, i) => {
                  const at = c.timing.split(' --> ')[0]!.slice(0, 8);
                  return (
                    <li key={i}>
                      <button type="button" className="transcribe-time" aria-label={`Play subtitle ${i + 1} from ${at}`} title="Play from here" onClick={() => playFrom(startOf(c.timing))}>
                        <Icon name="play" size="0.7rem" /> {at}
                      </button>
                      <textarea
                        aria-label={`Subtitle ${i + 1}`}
                        value={c.lines.join(' ')}
                        rows={2}
                        spellCheck={false}
                        onChange={(e) => setCues(cues.map((x, j) => (j === i ? { ...x, lines: [e.target.value] } : x)))}
                      />
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </section>
      )}

      {notes}
    </main>
  );
}
