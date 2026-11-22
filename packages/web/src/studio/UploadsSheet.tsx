import { useState } from 'react';
import { Icon, type IconName } from '../components/Icon.tsx';
import { Tip } from '../components/Tip.tsx';
import { useLibrary, type LibraryItem, type OpenMode } from './library.tsx';
import './uploads.css';

const VIDEO_PATH = '/studio/video';
const PHOTO_PATH = '/studio/photo';

interface Action {
  label: string;
  /** The words of the button's accessible name, after "Add <file>". */
  aria: string;
  icon: IconName;
  mode: OpenMode;
}

const TIMELINE: Action = { label: 'Add to timeline', aria: 'to the timeline', icon: 'plus', mode: 'append' };
const OVERLAY: Action = { label: 'Add as overlay', aria: 'as an overlay', icon: 'front', mode: 'overlay' };
const THIS_PICTURE: Action = { label: 'Add to this picture', aria: 'to this picture', icon: 'plus', mode: 'overlay' };
const SOUND: Action = { label: 'Add as sound', aria: 'as a sound', icon: 'volumeOn', mode: 'overlay' };

/** What the Uploads sheet offers for an item while a video project is open; the first is what clicking the thumbnail does. */
export function actionsFor(kind: LibraryItem['kind']): Action[] {
  return kind === 'video' ? [TIMELINE, OVERLAY] : kind === 'image' ? [OVERLAY] : [SOUND];
}

/**
 * The sheet that opens from the rail's Uploads button: everything opened so
 * far, one click to use it again, and a place to add more or drop files.
 */
export function UploadsSheet({ onClose }: { onClose: () => void }) {
  const lib = useLibrary();
  const [over, setOver] = useState(false);
  const [skipped, setSkipped] = useState(0);
  // Only beside the Video editor, and only once it has a project to add to.
  const here = lib.path.replace(/\/$/, '');
  const adding = lib.videoTarget.open && here === VIDEO_PATH;
  // Beside the Photo editor with a page open: pictures can also be placed on it. Clicking the thumbnail still opens a new page.
  const addingToPhoto = lib.photoTarget.open && here === PHOTO_PATH;

  const take = (files: FileList | File[]) => {
    const list = [...files];
    const added = lib.add(list);
    setSkipped(list.length - added.length);
  };

  return (
    <aside
      id="uploads-sheet"
      className={`uploads-sheet${over ? ' is-over' : ''}`}
      aria-label="Uploads"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
    >
      <header className="uploads-head">
        <h2>Uploads</h2>
        <button type="button" className="icon-button" aria-label="Close uploads" title="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>

      <label className="uploads-add text-button is-primary open-another">
        <Icon name="upload" /> Add pictures, videos or sounds
        <input
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          aria-label="Add to uploads"
          onChange={(e) => {
            if (e.target.files) take(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      {skipped > 0 && (
        <p className="dropzone-problem" role="alert">
          {skipped === 1 ? 'One file was' : `${skipped} files were`} not a picture, a video or a sound.
        </p>
      )}

      {lib.items.length === 0 ? (
        <p className="note">Pictures, videos and sounds you open appear here, ready to use again. Drop some here to add them.</p>
      ) : (
        <ul className="uploads-list">
          {lib.items.map((i, index) => {
            const actions = adding ? actionsFor(i.kind) : addingToPhoto && i.kind === 'image' ? [THIS_PICTURE] : [];
            const main = adding ? actions[0] : undefined;
            return (
              <li key={i.id} className={i.id === lib.openedId ? 'is-open' : undefined}>
                <button
                  type="button"
                  className="upload-item"
                  aria-label={main ? `Add ${i.file.name} ${main.aria}` : `Open ${i.file.name}`}
                  onClick={() => (main ? lib.open(i, { mode: main.mode }) : lib.open(i))}
                >
                  {i.kind === 'image' ? (
                    <img src={i.url} alt="" />
                  ) : i.thumb ? (
                    <img src={i.thumb} alt="" />
                  ) : (
                    <span className="upload-placeholder" aria-hidden="true">
                      <Icon name={i.kind === 'audio' ? 'volumeOn' : 'play'} />
                    </span>
                  )}
                  <span className="upload-kind">{i.kind === 'video' ? 'Video' : i.kind === 'audio' ? 'Sound' : 'Photo'}</span>
                  <span className="upload-name">{i.file.name}</span>
                </button>
                {actions.length > 0 && (
                  <div className="upload-actions">
                    {actions.map((a) => (
                      // The sheet scrolls and would cut a tooltip short at its edge, so the right-hand column opens its tooltips to the left.
                      <Tip key={a.mode + a.label} label={a.label} side={index % 2 === 0 ? 'right' : 'left'}>
                        <button type="button" className="upload-action" aria-label={`${a.label}: ${i.file.name}`} onClick={() => lib.open(i, { mode: a.mode })}>
                          <Icon name={a.icon} size="0.95rem" />
                        </button>
                      </Tip>
                    ))}
                  </div>
                )}
                <button type="button" className="upload-remove" aria-label={`Remove ${i.file.name} from uploads`} onClick={() => lib.remove(i.id)}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
