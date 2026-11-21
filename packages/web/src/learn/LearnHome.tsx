import { Icon } from '../components/Icon.tsx';
import { Link } from '../router.tsx';
import { LESSONS, SECTIONS } from './lessons.ts';
import { isDone } from './progress.ts';

/** The phone's Learn home: every lesson as a card, grouped by section, with progress. */
export function LearnHome({ missing = false }: { missing?: boolean }) {
  const finished = LESSONS.filter((l) => isDone(l.slug)).length;
  const first = LESSONS.find((l) => !isDone(l.slug)) ?? LESSONS[0]!;
  return (
    <div className="ph-screen ph-learn">
      {missing && <p className="ph-hint-strong">There is no lesson at this address. Pick one below.</p>}
      <section className="ph-card-box ph-learn-hero" aria-label="Your progress">
        <p className="ph-hint-strong">
          {finished} of {LESSONS.length} lessons finished
        </p>
        <span className="ph-progress-bar" aria-hidden="true">
          <span style={{ width: `${Math.round((finished / LESSONS.length) * 100)}%` }} />
        </span>
        <Link href={`/learn/${first.slug}`} className="ph-primary">
          {finished === 0 ? 'Start learning' : finished >= LESSONS.length ? 'Read again' : 'Continue'}: {first.title}
        </Link>
      </section>
      {SECTIONS.filter((section) => LESSONS.some((l) => l.section === section)).map((section) => (
        <section key={section} aria-label={section}>
          <h2 className="ph-section-title">{section}</h2>
          <ul className="ph-list">
            {LESSONS.filter((l) => l.section === section).map((l) => (
              <li key={l.slug}>
                <Link href={`/learn/${l.slug}`} className="ph-row ph-lesson-card">
                  <span className="ph-lesson-card-head">
                    <strong>{l.title}</strong>
                    {isDone(l.slug) && (
                      <span className="ph-done" role="img" aria-label="done">
                        <Icon name="check" size="1rem" />
                      </span>
                    )}
                  </span>
                  <small>{l.summary}</small>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
