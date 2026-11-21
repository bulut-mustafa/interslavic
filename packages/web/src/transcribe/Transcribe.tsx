import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../analytics.ts';
import { DropZone, OpenAnother } from '../components/DropZone.tsx';
import { Icon } from '../components/Icon.tsx';
import { BottomSheet } from '../phone/BottomSheet.tsx';
import { Chip, ChipRow, PhoneIconButton } from '../phone/parts.tsx';
import { useIsPhone } from '../phone/useIsPhone.ts';
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
  const phone = useIsPhone();
  /** Phone: the cue being edited in the sheet, or the options sheet. */
  const [editing, setEditing] = useState<number | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [recording, setRecording] = useState<MediaRecorder | null>(null);
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

  /** Record with the microphone where the browser can; the take then goes the same way as a chosen file. */
  const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  const toggleRecording = async () => {
    if (recording) {
      recording.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null);
        const type = rec.mimeType || 'audio/webm';
        pick(new File(chunks, `recording.${type.includes('mp4') ? 'm4a' : 'webm'}`, { type }));
      };
      rec.start();
      setRecording(rec);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The microphone is not available.');
    }
  };

  if (phone) {
    const rows = cues ?? [];
    const row = editing === null ? null : rows[editing];
    return (
      <div className="ph-tool-screen ph-rec">
        <div className={`ph-tool-scroll${editing !== null || optionsOpen ? ' ph-sheet-open' : ''}`}>
          {!file ? (
            <section className="ph-rec-start" aria-label="Choose a recording">
              {canRecord && (
                <button type="button" className={`ph-rec-big${recording ? ' is-live' : ''}`} onClick={() => void toggleRecording()} aria-label={recording ? 'Stop recording' : 'Record with the microphone'}>
                  <Icon name="mic" size="2.4rem" />
                  <span>{recording ? 'Stop' : 'Record'}</span>
                </button>
              )}
              <label className={canRecord ? 'ph-secondary is-wide ph-file-pick' : 'ph-rec-big ph-file-pick'}>
                <Icon name="upload" size={canRecord ? '1.2rem' : '2.4rem'} />
                <span>{canRecord ? 'Upload a recording' : 'Choose a recording'}</span>
                <input
                  type="file"
                  accept="audio/*,video/*"
                  aria-label="Audio or video file"
                  disabled={running}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) pick(f);
                  }}
                />
              </label>
              <p className="ph-hint-strong">Turns the speech in a recording into subtitles. It is processed on your phone and never uploaded. MP3, WAV, M4A, MP4, WebM, up to 200 MB.</p>
            </section>
          ) : (
            <section className="ph-card-box ph-rec-file" aria-label="Recording">
              <div className="ph-tool-head-row">
                <div className="ph-tool-head-text">
                  <strong title={file.name}>{file.name}</strong>
                  <span>{MODELS.find((m) => m.id === modelId)?.label} model, {LANGS.find((l) => l.value === lang)?.label}</span>
                </div>
                <PhoneIconButton icon="sliders" label="Options" onClick={() => setOptionsOpen(true)} />
              </div>
              <ChipRow label="Spoken language">
                {LANGS.map((l) => (
                  <Chip key={l.value} selected={lang === l.value} onClick={() => !running && setLang(l.value)}>
                    {l.label}
                  </Chip>
                ))}
              </ChipRow>
            </section>
          )}

          {stage.kind !== 'idle' && stage.kind !== 'done' && (
            <div role="status" className="ph-card-box transcribe-progress">
              <div className="progress-bar" aria-hidden="true">
                <span className={fraction === null ? 'is-moving' : undefined} style={fraction === null ? undefined : { width: `${Math.round(fraction * 100)}%` }} />
              </div>
              <p className="ph-hint-strong">
                {stageText(stage)} <Elapsed />
              </p>
            </div>
          )}
          {error && (
            <div className="ph-note-card is-error" role="alert">
              <strong>Transcription stopped</strong>
              <span>{error}</span>
            </div>
          )}

          {cues && (
            <section aria-label="Transcript">
              <p role="status" className="ph-hint-strong">
                {cues.length === 0 ? 'No speech was found.' : `${cues.length} subtitles. Tap one to listen and correct it.`}
              </p>
              {url && cues.length > 0 && <audio ref={audioRef} src={url} controls preload="metadata" aria-label="The recording" className="ph-rec-audio" />}
              <ol className="ph-list">
                {cues.map((c, i) => {
                  const at = c.timing.split(' --> ')[0]!.slice(0, 8);
                  return (
                    <li key={i}>
                      <button type="button" className="ph-row" aria-label={`Edit subtitle ${i + 1} from ${at}`} onClick={() => setEditing(i)}>
                        <small>{at}</small>
                        <span>{c.lines.join(' ')}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </div>

        {file && (
          <div className="ph-tool-bar ph-tool-bar-split">
            {cues && cues.length > 0 && !running ? (
              <>
                <button type="button" className="ph-secondary" onClick={() => downloadText(`${base}.srt`, formatSrt(cues), 'application/x-subrip')}>
                  <Icon name="save" /> .srt
                </button>
                <button
                  type="button"
                  className="ph-primary"
                  onClick={() => {
                    putHandoff({ srt: formatSrt(cues), lang, name: `${base}.srt` });
                    navigate('/studio/subtitles');
                  }}
                >
                  <Icon name="translate" /> Translate to Interslavic
                </button>
              </>
            ) : running ? (
              <button
                type="button"
                className="ph-secondary is-wide"
                onClick={() => {
                  stop();
                  setStage({ kind: 'idle' });
                }}
              >
                Cancel
              </button>
            ) : (
              <button type="button" className="ph-primary" onClick={() => void start()}>
                <Icon name="mic" /> Transcribe
              </button>
            )}
          </div>
        )}

        <BottomSheet
          open={editing !== null || optionsOpen}
          onClose={() => {
            setEditing(null);
            setOptionsOpen(false);
          }}
          title={optionsOpen ? 'Options' : `Subtitle ${(editing ?? 0) + 1}`}
          detents={['half', 'full']}
          headerAction={
            <button
              type="button"
              className="ph-sheet-done"
              onClick={() => {
                setEditing(null);
                setOptionsOpen(false);
              }}
            >
              Done
            </button>
          }
        >
          {optionsOpen ? (
            <div className="ph-sheet-stack">
              <label>
                Model
                <select value={modelId} onChange={(e) => setModelId(e.target.value as WhisperModel['id'])} disabled={running} aria-label="Model">
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.downloadMb} MB)
                    </option>
                  ))}
                </select>
              </label>
              <label className="ph-secondary is-wide ph-file-pick">
                <Icon name="plus" /> Choose another file
                <input type="file" accept="audio/*,video/*" aria-label="Choose another file" disabled={running} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { pick(f); setOptionsOpen(false); } }} />
              </label>
              {notes}
            </div>
          ) : row && cues && editing !== null ? (
            <div className="ph-sheet-stack">
              <label>
                Subtitle {editing + 1}
                <textarea
                  aria-label={`Subtitle ${editing + 1}`}
                  rows={4}
                  spellCheck={false}
                  value={row.lines.join(' ')}
                  onChange={(e) => setCues(cues.map((x, j) => (j === editing ? { ...x, lines: [e.target.value] } : x)))}
                />
              </label>
              <button type="button" className="ph-secondary is-wide" onClick={() => playFrom(startOf(row.timing))}>
                <Icon name="play" size="0.9rem" /> Play from {row.timing.split(' --> ')[0]!.slice(0, 8)}
              </button>
              <div className="ph-sheet-row">
                <button type="button" className="ph-secondary" disabled={editing <= 0} onClick={() => setEditing(editing - 1)} aria-label="Previous subtitle">
                  <Icon name="chevronLeft" /> Previous
                </button>
                <button type="button" className="ph-secondary" disabled={editing >= cues.length - 1} onClick={() => setEditing(editing + 1)} aria-label="Next subtitle">
                  Next <Icon name="chevronRight" />
                </button>
              </div>
            </div>
          ) : null}
        </BottomSheet>
      </div>
    );
  }

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
