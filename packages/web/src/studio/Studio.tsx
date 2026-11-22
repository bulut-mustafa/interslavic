import { useEffect, useRef, useState } from 'react';
import { Credits } from '../components/Credits.tsx';
import { Icon as LineIcon } from '../components/Icon.tsx';
import { Tip } from '../components/Tip.tsx';
import { Link } from '../router.tsx';
import { ActiveContext } from './active.tsx';
import { LibraryProvider, useLibrary } from './library.tsx';
import { GROUPS, TOOLS, toolAt, toolPath, type Tool } from './tools.tsx';
import { PerfOverlay, wantsPerf } from './PerfOverlay.tsx';
import { UploadsSheet } from './UploadsSheet.tsx';
import './mobile-studio.css';

/** The tools that work on pictures and clips, and so have the Uploads sheet. */
const WITH_UPLOADS = new Set(['photo', 'video']);

/**
 * The Studio: one workspace for every tool, with its own interface - a rail of
 * tools down the left, the tool in the middle - instead of a page per tool in
 * the site's menu. The site's header and footer are not shown here.
 */

function Icon({ d }: { d: string }) {
  return (
    <svg className="studio-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

type Health = { api: boolean | null; parser: boolean | null };

/** Whether the translator service answers, and whether its parser does - what the service tools need. */
function useHealth(): Health {
  const [h, setH] = useState<Health>({ api: null, parser: null });
  useEffect(() => {
    let live = true;
    fetch('/api/health')
      .then((r) => r.json().catch(() => ({})))
      .then((b: { ok?: boolean; parser?: boolean }) => live && setH({ api: b.ok === true, parser: b.parser === true }))
      .catch(() => live && setH({ api: false, parser: false }));
    return () => {
      live = false;
    };
  }, []);
  return h;
}

function Chip({ name, on }: { name: string; on: boolean | null }) {
  const state = on === null ? 'checking' : on ? 'online' : 'offline';
  return (
    <span className={`studio-chip is-${state}`} title={`${name}: ${state}`}>
      <i aria-hidden="true" />
      {name} {state}
    </span>
  );
}

const RAIL_KEY = 'studio-rail-collapsed';

/** Whether the rail is folded to its icons. Remembered between visits where the browser allows. */
function useRailFolded(): [boolean, () => void] {
  const [folded, setFolded] = useState(() => {
    try {
      return window.localStorage.getItem(RAIL_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setFolded((f) => {
      try {
        window.localStorage.setItem(RAIL_KEY, f ? '0' : '1');
      } catch {
        /* a private window: the choice just is not remembered */
      }
      return !f;
    });
  return [folded, toggle];
}

/** The rail's Uploads button, which opens and closes the sheet beside the rail. */
function UploadsButton({ open, folded, onClick }: { open: boolean; folded: boolean; onClick: () => void }) {
  const lib = useLibrary();
  return (
    <Tip label={folded ? 'Uploads' : undefined} side="right">
      <button type="button" className={`studio-link is-button${open ? ' is-current' : ''}`} aria-expanded={open} aria-controls="uploads-sheet" onClick={onClick}>
        <LineIcon name="upload" />
        <span>Uploads</span>
        {lib.items.length > 0 && <em className="rail-badge">{lib.items.length}</em>}
      </button>
    </Tip>
  );
}

export default function Studio({ path }: { path: string }) {
  const tool = toolAt(path);
  const [folded, toggleFolded] = useRailFolded();
  const [sheet, setSheet] = useState(false);
  const usesUploads = !!tool && WITH_UPLOADS.has(tool.slug);
  const health = useHealth();
  const unknown = !tool && path.replace(/\/$/, '') !== '/studio';

  // A tool, once visited, stays mounted (hidden when another is shown), so leaving it
  // and coming back finds the work as it was left.
  const visited = useRef(new Set<string>());
  if (tool) visited.current.add(tool.slug);

  return (
    <LibraryProvider path={path}>
    <div className={`studio${folded ? ' is-folded' : ''}`}>
      <aside className="studio-rail" aria-label="Studio">
        <div className="studio-rail-head">
          <Tip label={folded ? 'Studio home' : undefined} side="right">
          <Link href="/studio" className="studio-brand" aria-label="Studio home">
            <span className="studio-mark" aria-hidden="true">S</span>
            <span className="studio-brand-name">
              Studio
              <small>Medžuslovjansky</small>
            </span>
          </Link>
          </Tip>
          <Tip label={folded ? 'Expand the sidebar' : 'Collapse the sidebar'} side="right">
          <button type="button" className="rail-toggle" aria-expanded={!folded} aria-label={folded ? 'Expand the sidebar' : 'Collapse the sidebar'} onClick={toggleFolded}>
            <LineIcon name={folded ? 'chevronRight' : 'chevronLeft'} />
          </button>
          </Tip>
        </div>

        {usesUploads && <UploadsButton open={sheet} folded={folded} onClick={() => setSheet((o) => !o)} />}

        <nav className="studio-nav" aria-label="Tools">
          {GROUPS.map((g) => (
            <div key={g} className="studio-group">
              <p className="studio-group-label">{g}</p>
              {TOOLS.filter((t) => t.group === g).map((t) => (
                <ToolLink key={t.slug} tool={t} current={tool?.slug === t.slug} folded={folded} />
              ))}
            </div>
          ))}
        </nav>

        <div className="studio-rail-foot">
          <Link href="/" className="studio-back">
            <LineIcon name="arrowLeft" /> Translator
          </Link>
          <Link href="/learn" className="studio-back">
            Lessons
          </Link>
        </div>
      </aside>

      {usesUploads && sheet && (
        <>
          {/* Phones only (hidden by CSS elsewhere): a tap outside the bottom sheet closes it. */}
          <button type="button" className="uploads-backdrop" tabIndex={-1} aria-hidden="true" onClick={() => setSheet(false)} />
          <UploadsSheet onClose={() => setSheet(false)} />
        </>
      )}

      <div className="studio-main">
        <header className="studio-bar">
          <Link href="/" className="studio-bar-back">
            <LineIcon name="arrowLeft" /> Translator
          </Link>
          <p className="studio-crumb">
            <Link href="/studio">Studio</Link>
            {tool && (
              <>
                <span aria-hidden="true"> / </span>
                <span>{tool.label}</span>
              </>
            )}
          </p>
          <div className="studio-chips">
            <Chip name="engine" on={health.api} />
            <Chip name="parser" on={health.parser} />
          </div>
        </header>

        <div className="studio-body">
          <div className="studio-canvas">
            {TOOLS.filter((t) => visited.current.has(t.slug)).map((t) => (
              <div key={t.slug} className="tool-pane" hidden={t.slug !== tool?.slug}>
                <ActiveContext.Provider value={t.slug === tool?.slug}>{t.element()}</ActiveContext.Provider>
              </div>
            ))}
            {!tool && (unknown ? <NotFound /> : <Home />)}
            <footer className="studio-credits">
              <Credits />
            </footer>
          </div>
        </div>
      </div>
    </div>
      {typeof window !== 'undefined' && wantsPerf(window.location.search) && <PerfOverlay />}
    </LibraryProvider>
  );
}

function ToolLink({ tool, current, folded }: { tool: Tool; current: boolean; folded: boolean }) {
  return (
    <Tip label={folded ? tool.label : undefined} side="right">
      <Link
        href={toolPath(tool)}
        className={`studio-link${current ? ' is-current' : ''}`}
        aria-label={tool.label}
        aria-current={current ? 'page' : undefined}
        title={folded ? undefined : tool.summary}
      >
        <Icon d={tool.icon} />
        <span>{tool.label}</span>
      </Link>
    </Tip>
  );
}

function Home() {
  return (
    <main className="studio-home">
      <h1>Studio</h1>
      <p className="lesson-summary">
        Tools for learning, teaching and making things in Interslavic. Pick one from the rail, or start here.
      </p>
      {GROUPS.map((g) => (
        <section key={g} aria-label={g}>
          <h2 className="studio-home-group">{g}</h2>
          <div className="studio-grid">
            {TOOLS.filter((t) => t.group === g).map((t) => (
              <Link key={t.slug} href={toolPath(t)} className="studio-card" aria-label={`Open ${t.label}`}>
                <Icon d={t.icon} />
                <strong>{t.label}</strong>
                <span>{t.summary}</span>
                {t.runs !== 'device' && <em className="studio-runs">Uses the engine</em>}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function NotFound() {
  return (
    <main className="not-found">
      <h1>No such tool</h1>
      <p>
        Pick one from the rail, or <Link href="/studio">go to the Studio home</Link>.
      </p>
    </main>
  );
}
