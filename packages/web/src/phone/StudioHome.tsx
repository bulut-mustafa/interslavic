import { Link } from '../router.tsx';
import { Icon as LineIcon } from '../components/Icon.tsx';
import { useLibrary } from '../studio/library.tsx';
import { GROUPS, TOOLS, toolPath } from '../studio/tools.tsx';

/** One line each: what the tool is for (the longer `summary` is for the desktop). */
const PURPOSE: Record<string, string> = {
  photo: 'Change the text in a photo',
  video: 'Cut, caption and save a video',
  recording: 'Speech in a recording to subtitles',
  subtitles: 'Subtitle file to Interslavic',
  watch: 'Learn from a video, tap any word',
  worksheets: 'Printable worksheet with a key',
};

function PathIcon({ d }: { d: string }) {
  return (
    <svg className="ph-card-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/**
 * The phone's Studio home: big tool cards in two columns (from TOOLS, the one
 * list the desktop rail uses too) and a "Your uploads" row from the library.
 */
export function StudioHome() {
  const lib = useLibrary();
  return (
    <div className="ph-studio-home">
      {GROUPS.map((g) => (
        <section key={g} aria-label={g} className="ph-tool-group">
          <h2 className="ph-section-title">{g}</h2>
          <ul className="ph-cards">
            {TOOLS.filter((t) => t.group === g).map((t) => (
              <li key={t.slug}>
                <Link href={toolPath(t)} className="ph-card" aria-label={`Open ${t.label}`}>
                  <span className="ph-card-badge">
                    <PathIcon d={t.icon} />
                  </span>
                  <strong>{t.label}</strong>
                  <span className="ph-card-purpose">{PURPOSE[t.slug] ?? t.summary}</span>
                  {t.runs === 'device' && <small className="ph-card-tag">On your phone</small>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-label="Your uploads" className="ph-uploads">
        <h2 className="ph-section-title">Your uploads</h2>
        <div className="ph-uploads-row">
          <label className="ph-upload-add">
            <span aria-hidden="true">+</span>
            <small>Add</small>
            <input
              type="file"
              multiple
              accept="image/*,video/*,audio/*"
              aria-label="Add to uploads"
              onChange={(e) => {
                if (e.target.files) lib.add([...e.target.files]);
                e.target.value = '';
              }}
            />
          </label>
          {lib.items.map((i) => (
            <button key={i.id} type="button" className="ph-upload" aria-label={`Open ${i.file.name}`} onClick={() => lib.open(i)}>
              {i.kind === 'image' ? <img src={i.url} alt="" /> : i.thumb ? <img src={i.thumb} alt="" /> : <LineIcon name={i.kind === 'audio' ? 'volumeOn' : 'play'} />}
            </button>
          ))}
        </div>
        {lib.items.length === 0 && (
          <p className="ph-empty">
            Nothing here yet. Tap <strong>Add</strong> to open a picture, a video or a sound; it appears here, ready for Photo and Video.
          </p>
        )}
      </section>
    </div>
  );
}
