import { useEffect } from 'react';
import { Lesson } from './learn/Lesson.tsx';
import { LESSONS } from './learn/lessons.ts';
import { Phrasebook } from './learn/Phrasebook.tsx';
import { Credits } from './components/Credits.tsx';
import Translator from './pages/Translator.tsx';
import Studio from './studio/Studio.tsx';
import { pageMeta } from './meta.ts';
import { Link, usePath } from './router.tsx';
import PhoneApp from './phone/PhoneApp.tsx';
import { useIsPhone } from './phone/useIsPhone.ts';

/**
 * The site: the translator at the root, beside it the lessons and the
 * phrasebook, with one header and one footer; and the Studio, whose tools
 * live in a workspace of their own (studio/Studio.tsx).
 */

const SECTIONS = [
  { href: '/', label: 'Translate', match: (p: string) => p === '/' },
  { href: '/learn', label: 'Learn', match: (p: string) => p.startsWith('/learn') },
  { href: '/phrasebook', label: 'Phrasebook', match: (p: string) => p.startsWith('/phrasebook') },
  { href: '/studio', label: 'Studio', match: (p: string) => p.startsWith('/studio') },
];

export default function App() {
  const path = usePath();
  const phone = useIsPhone();

  // The prerendered head is right for the first page; keep it right after
  // moving to another without a reload.
  useEffect(() => {
    const meta = pageMeta(path);
    document.title = meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description);
  }, [path]);

  const lessonSlug = path.replace(/^\/learn\/?/, '').replace(/\/$/, '');
  const page = path.startsWith('/learn') ? (
    <Lesson slug={lessonSlug || LESSONS[0]!.slug} home={lessonSlug === ''} />
  ) : path.startsWith('/phrasebook') ? (
    <Phrasebook />
  ) : path === '/' ? (
    <Translator />
  ) : (
    <NotFound />
  );

  // On a phone the app is a different layout (src/phone), not the desktop one made smaller.
  if (phone) return <PhoneApp path={path} page={page} />;

  // The Studio has an interface of its own, without the site's header and footer.
  if (path.startsWith('/studio')) return <Studio path={path} />;

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="wordmark">
          Medžuslovjansky
        </Link>
        <nav className="sitenav" aria-label="Site">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={`sitenav-link${s.match(path) ? ' is-current' : ''}`}
              aria-current={s.match(path) ? 'page' : undefined}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </header>

      {page}

      <footer className="site-footer">
        <Credits />
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <main className="not-found">
      <h1>Page not found</h1>
      <p>
        There is nothing at this address. Try the <Link href="/">translator</Link> or the{' '}
        <Link href={`/learn/${LESSONS[0]!.slug}`}>lessons</Link>.
      </p>
    </main>
  );
}
