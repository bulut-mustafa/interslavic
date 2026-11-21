import { useEffect, useState, type ReactNode } from 'react';
import { Credits } from '../components/Credits.tsx';
import { Icon } from '../components/Icon.tsx';
import { Link } from '../router.tsx';
import { ActiveContext } from '../studio/active.tsx';
import { LibraryProvider } from '../studio/library.tsx';
import { UploadsSheet } from '../studio/UploadsSheet.tsx';
import { toolAt, type Tool } from '../studio/tools.tsx';
import { BottomSheet } from './BottomSheet.tsx';
import { PhoneMenuProvider, useMenuList } from './menu.tsx';
import { phoneElementFor } from './registry.ts';
import { StudioHome } from './StudioHome.tsx';
import { TabBar, type TabItem } from './TabBar.tsx';
import { TopBar } from './TopBar.tsx';
import './phone.css';
import './screens.css';

/** The phone's four tabs; the same sections as the desktop header. */
export const PHONE_TABS: TabItem[] = [
  { href: '/', label: 'Translate', icon: <Icon name="translate" size="1.5rem" />, match: (p) => p === '/' },
  { href: '/learn', label: 'Learn', icon: <Icon name="book" size="1.5rem" /> },
  { href: '/phrasebook', label: 'Phrasebook', icon: <Icon name="phrasebook" size="1.5rem" /> },
  { href: '/studio', label: 'Studio', icon: <Icon name="studio" size="1.5rem" /> },
];

const titleFor = (path: string): string => (path === '/' ? 'Medžuslovjansky' : path.startsWith('/learn') ? 'Learn' : path.startsWith('/phrasebook') ? 'Phrasebook' : path.startsWith('/studio') ? 'Studio' : 'Medžuslovjansky');

/** Tools that use the Uploads library, which the desktop opens from its rail. */
const WITH_UPLOADS = new Set(['photo', 'video']);

/** The page itself must not scroll: only `.ph-content` does. */
function useLockPage(): void {
  useEffect(() => {
    document.documentElement.classList.add('ph-locked');
    return () => document.documentElement.classList.remove('ph-locked');
  }, []);
}

/**
 * The phone shell, used by App.tsx when `useIsPhone()` is true. A 100svh grid:
 * top bar / scrolling content / tab bar. In the Studio, a tool opens full
 * screen (back arrow, no tab bar) and the Studio home replaces the rail.
 *
 * `page` is what App would render for the translator, lessons, phrasebook or
 * "not found"; the Studio is handled here.
 */
export default function PhoneApp({ path, page }: { path: string; page: ReactNode }) {
  useLockPage();
  // Only `.ph-content` scrolls, so a new page must start at its top by hand.
  useEffect(() => {
    document.querySelector('.ph-content')?.scrollTo?.({ top: 0, left: 0 });
  }, [path]);
  return (
    <PhoneMenuProvider>
      {path.startsWith('/studio') ? (
        <PhoneStudio path={path} />
      ) : (
        <div className="ph-app">
          <TopBar title={titleFor(path)} right={<MenuButton />} />
          <main className="ph-content">{page}</main>
          <TabBar items={PHONE_TABS} path={path} />
        </div>
      )}
    </PhoneMenuProvider>
  );
}

/** The menu: the current screen's actions (history, link, report, export), then what the desktop footer holds (credits). Opens a half-height sheet. */
function MenuButton() {
  const [open, setOpen] = useState(false);
  const items = useMenuList();
  return (
    <>
      <button type="button" className="ph-bar-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="menu" size="1.4rem" />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={items.length ? 'Menu' : 'About'} detents={items.length > 3 ? ['half', 'full'] : ['half']}>
        <div className="ph-menu">
          {items.length > 0 && (
            <ul className="ph-menu-list">
              {items.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    className="ph-menu-item"
                    onClick={() => {
                      setOpen(false);
                      it.onSelect();
                    }}
                  >
                    {it.icon && <Icon name={it.icon} size="1.3rem" />}
                    {it.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Credits />
        </div>
      </BottomSheet>
    </>
  );
}

function PhoneStudio({ path }: { path: string }) {
  const tool = toolAt(path);
  const unknown = !tool && path.replace(/\/$/, '') !== '/studio';
  return (
    <LibraryProvider path={path}>
      {tool ? (
        <ToolFrame tool={tool} />
      ) : (
        <div className="ph-app">
          <TopBar title="Studio" right={<MenuButton />} />
          <main className="ph-content">
            {unknown ? (
              <p className="ph-hint">
                No such tool. <Link href="/studio">Back to the Studio</Link>
              </p>
            ) : (
              <StudioHome />
            )}
          </main>
          <TabBar items={PHONE_TABS} path={path} />
        </div>
      )}
    </LibraryProvider>
  );
}

/** A tool full screen: back arrow to the Studio home, the whole rest of the screen for the tool. */
function ToolFrame({ tool }: { tool: Tool }) {
  const [uploads, setUploads] = useState(false);
  const usesUploads = WITH_UPLOADS.has(tool.slug);
  return (
    <div className="ph-app ph-tool-frame" data-tool={tool.slug}>
      <TopBar
        title={tool.label}
        backHref="/studio"
        backLabel="Back to Studio"
        right={
          usesUploads && (
            <button type="button" className="ph-bar-btn" aria-label="Uploads" aria-expanded={uploads} onClick={() => setUploads((o) => !o)}>
              <Icon name="upload" size="1.3rem" />
            </button>
          )
        }
      />
      <main className="ph-content ph-tool">
        <ActiveContext.Provider value>{phoneElementFor(tool)}</ActiveContext.Provider>
      </main>
      {usesUploads && (
        <BottomSheet open={uploads} onClose={() => setUploads(false)} title="Uploads" detents={['half', 'full']}>
          <div className="ph-uploads-pane">
            <UploadsSheet onClose={() => setUploads(false)} />
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
