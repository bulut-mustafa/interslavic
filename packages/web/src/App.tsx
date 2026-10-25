import { Lesson } from './learn/Lesson.tsx';
import { LESSONS } from './learn/lessons.ts';
import Translator from './pages/Translator.tsx';
import { Link, usePath } from './router.tsx';

/**
 * The site: the translator at the root, beside it the lessons and the
 * phrasebook. One header and one footer for all of them.
 */

const SECTIONS = [
  { href: '/', label: 'Translate', match: (p: string) => p === '/' },
  { href: '/learn', label: 'Learn', match: (p: string) => p.startsWith('/learn') },
  { href: '/phrasebook', label: 'Phrasebook', match: (p: string) => p.startsWith('/phrasebook') },
];

export default function App() {
  const path = usePath();

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

      {path.startsWith('/learn') ? (
        <Lesson slug={path.replace(/^\/learn\/?/, '').replace(/\/$/, '') || LESSONS[0]!.slug} />
      ) : path.startsWith('/phrasebook') ? (
        <main className="page">
          <p>Coming soon.</p>
        </main>
      ) : (
        <Translator />
      )}

      <footer className="site-footer">
        An experimental, rule-based translator - it can be wrong, and says where it is
        guessing. Dictionary and grammar: the Interslavic dictionary
        (interslavic-dictionary.com) and Jan van Steenbergen&rsquo;s grammar pages
        (steen.free.fr/interslavic), used non-commercially with thanks.
      </footer>
    </div>
  );
}
