import { Link } from '../router.tsx';
import { useLibrary } from '../studio/library.tsx';
import { TOOLS, toolPath } from '../studio/tools.tsx';

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
      <section aria-label="Tools">
        <ul className="ph-cards">
          {TOOLS.map((t) => (
            <li key={t.slug}>
              <Link href={toolPath(t)} className="ph-card" aria-label={`Open ${t.label}`}>
                <PathIcon d={t.icon} />
                <strong>{t.label}</strong>
                <span>{t.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Your uploads" className="ph-uploads">
        <h2>Your uploads</h2>
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
              {i.kind === 'image' ? <img src={i.url} alt="" /> : i.thumb ? <img src={i.thumb} alt="" /> : <span aria-hidden="true">{i.kind === 'audio' ? '♪' : '▶'}</span>}
            </button>
          ))}
        </div>
        {lib.items.length === 0 && <p className="ph-hint">Pictures, videos and sounds you open appear here.</p>}
      </section>
    </div>
  );
}
