import { useState } from 'react';

/**
 * Where a file is chosen: a large target to drop a file on or click, in place
 * of the browser's bare "Choose file" control. It shows what was chosen, and
 * refuses a file of the wrong kind with a plain message instead of failing later.
 */

type Kind = 'image' | 'video' | 'audio' | 'file';

const ICONS: Record<Kind, string> = {
  image: 'M4 5h16v14H4zM8 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM4 17l5-5 4 4 3-3 4 4',
  video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3',
  audio: 'M9 18V6l10-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM19 16a3 3 0 11-6 0 3 3 0 016 0z',
  file: 'M6 3h9l4 4v14H6zM15 3v4h4',
};

/** Does `file` fit an <input accept> list such as "video/*,.mp4"? An empty list accepts anything. */
export function matchesAccept(file: Pick<File, 'name' | 'type'>, accept: string): boolean {
  const tokens = accept.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return tokens.some((t) => {
    if (t.startsWith('.')) return name.endsWith(t);
    // A file dragged in can have no type at all (.mkv, .m4a on some systems): let the decoder judge it.
    if (type === '') return true;
    return t.endsWith('/*') ? type.startsWith(t.slice(0, -1)) : type === t;
  });
}

export function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function DropZone(props: {
  /** The input's accessible name. */
  name: string;
  title: string;
  hint: string;
  accept: string;
  kind: Kind;
  file: File | null;
  onFile: (file: File) => void;
  /** When given, several files may be chosen or dropped at once, and they all arrive here together. */
  onFiles?: (files: File[]) => void;
  disabled?: boolean;
  /** What to call the thing in the "wrong kind" message. */
  noun?: string;
}) {
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const take = (f: File | undefined) => {
    if (!f) return;
    if (!matchesAccept(f, props.accept)) {
      setProblem(`That file is not ${props.noun ?? 'the right kind of file'}.`);
      return;
    }
    setProblem(null);
    props.onFile(f);
  };

  const takeMany = (list: FileList | null | undefined) => {
    const all = [...(list ?? [])];
    const good = all.filter((f) => matchesAccept(f, props.accept));
    if (good.length < all.length) setProblem(good.length === 0 ? `That file is not ${props.noun ?? 'the right kind of file'}.` : `${all.length - good.length === 1 ? 'One file was' : `${all.length - good.length} files were`} not ${props.noun ?? 'the right kind of file'} and left out.`);
    else setProblem(null);
    if (good.length > 0) props.onFiles!(good);
  };

  return (
    <div className="dropzone-wrap">
      <label
        className={['dropzone', over ? 'is-over' : '', props.file ? 'has-file' : '', props.disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}
        onDragOver={(e) => {
          e.preventDefault();
          if (!props.disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (props.disabled) return;
          if (props.onFiles) takeMany(e.dataTransfer.files);
          else take(e.dataTransfer.files[0]);
        }}
      >
        <input
          type="file"
          aria-label={props.name}
          accept={props.accept}
          multiple={!!props.onFiles}
          disabled={props.disabled}
          onChange={(e) => {
            if (props.onFiles) takeMany(e.target.files);
            else take(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <svg className="dropzone-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONS[props.kind]} />
        </svg>
        <span className="dropzone-text">
          {props.file ? (
            <>
              <strong>{props.file.name}</strong>
              <small>{size(props.file.size)} · click or drop to replace</small>
            </>
          ) : (
            <>
              <strong>{props.title}</strong>
              <small>{props.hint}</small>
            </>
          )}
        </span>
      </label>
      {problem && (
        <p className="dropzone-problem" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * A small "Open another" button for when a file is already open and the big
 * drop zone has made way for the work. It takes the same kinds of file and says
 * so in the same words when given the wrong one.
 */
export function OpenAnother(props: { name: string; accept: string; noun: string; onFile: (file: File) => void; disabled?: boolean }) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <label className={`text-button open-another${props.disabled ? ' is-disabled' : ''}`}>
        Open another
        <input
          type="file"
          aria-label={props.name}
          accept={props.accept}
          disabled={props.disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (!matchesAccept(f, props.accept)) {
              setProblem(`That file is not ${props.noun}.`);
              return;
            }
            setProblem(null);
            props.onFile(f);
          }}
        />
      </label>
      {problem && (
        <span className="dropzone-problem" role="alert">
          {problem}
        </span>
      )}
    </>
  );
}
