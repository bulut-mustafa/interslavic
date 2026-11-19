import { Icon } from '../components/Icon.tsx';
import type { ShapeKind } from './doc.ts';
import { PathIcon } from './path-icon.tsx';
import { FRAME_ENTRIES, SHAPE_ENTRIES, STICKER_GROUPS, type FrameKind } from './shapes-catalog.ts';
import './objects.css';

/** Files of a picture type, from a list of any files (a drop or a pick). */
export const onlyImages = (files: Iterable<File>): File[] => [...files].filter((f) => f.type.startsWith('image/'));

/**
 * The Add flyout: pictures, shapes, frames, stickers and text. It only reports
 * the choice; the editor puts the layer on the page. `onPickFrame` is optional:
 * frames are applied to the selected picture, so give it only when there is
 * one (the Frames section is hidden without it).
 */
export function AddPanel(props: {
  onPickFiles: (files: File[]) => void;
  onAddShape: (kind: ShapeKind) => void;
  onAddText: () => void;
  onAddSticker: (char: string) => void;
  onPickFrame?: (frame: FrameKind | undefined) => void;
}) {
  return (
    <section className="ap" aria-label="Add to the page">
      <div>
        <h4>Picture</h4>
        <label className="ap-pick">
          <Icon name="upload" />
          Add pictures
          <input
            type="file"
            accept="image/*"
            multiple
            aria-label="Add pictures"
            onChange={(e) => {
              const files = onlyImages(e.target.files ?? []);
              if (files.length) props.onPickFiles(files);
              e.target.value = '';
            }}
          />
        </label>
        <p className="ap-hint">Or drop pictures onto the page, or paste one (Ctrl+V, or Cmd+V on a Mac).</p>
      </div>

      <div>
        <h4>Text</h4>
        <button type="button" className="ap-pick" onClick={props.onAddText}>
          <Icon name="addText" />
          Add a text box
        </button>
      </div>

      <div>
        <h4>Shapes</h4>
        <div className="ap-grid" role="group" aria-label="Shapes">
          {SHAPE_ENTRIES.map((s) => (
            <button key={s.kind} type="button" className="ap-cell" aria-label={`Add ${s.label.toLowerCase()}`} title={s.label} onClick={() => props.onAddShape(s.kind)}>
              <PathIcon d={s.path} size="1.5rem" />
            </button>
          ))}
        </div>
      </div>

      {props.onPickFrame && (
        <div>
          <h4>Frames</h4>
          <div className="ap-grid" role="group" aria-label="Frames">
            {FRAME_ENTRIES.map((f) => (
              <button key={f.label} type="button" className="ap-cell" aria-label={f.frame ? `Frame: ${f.label.toLowerCase()}` : 'Frame: none'} title={f.label} onClick={() => props.onPickFrame?.(f.frame)}>
                <PathIcon d={f.path} size="1.5rem" />
              </button>
            ))}
          </div>
          <p className="ap-hint">Select a picture first; it is shown inside the frame.</p>
        </div>
      )}

      <div>
        <h4>Stickers</h4>
        {STICKER_GROUPS.map((g) => (
          <div key={g.id} className="ap-grid" role="group" aria-label={g.label}>
            {g.chars.map((c) => (
              <button key={c} type="button" className="ap-cell" aria-label={`Add sticker ${c}`} onClick={() => props.onAddSticker(c)}>
                {c}
              </button>
            ))}
          </div>
        ))}
        <p className="ap-hint">Stickers are emoji drawn by your device, so they look different on other devices.</p>
      </div>
    </section>
  );
}
