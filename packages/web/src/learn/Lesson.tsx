import { useState } from 'react';
import { toCyrillic } from '../../../morph/src/orthography.ts';
import { ReportForm } from '../components/ReportForm.tsx';
import { Link } from '../router.tsx';
import { anchor, parseInline } from './inline.ts';
import { LESSONS, SECTIONS } from './lessons.ts';
import { answered, isDone, recordAnswer, setDone } from './progress.ts';
import type { Block, LessonPage } from './types.ts';

/** One lesson page: sidebar, the lesson, "on this page", previous/next. */
export function Lesson({ slug }: { slug: string }) {
  const index = LESSONS.findIndex((l) => l.slug === slug);
  const lesson = LESSONS[index];

  if (!lesson) {
    return (
      <main className="learn">
        <LearnNav current={null} />
        <article className="lesson">
          <h1>Page not found</h1>
          <p>
            There is no lesson at this address. <Link href={`/learn/${LESSONS[0]!.slug}`}>Start
            from the beginning</Link>.
          </p>
        </article>
      </main>
    );
  }

  const prev = LESSONS[index - 1];
  const next = LESSONS[index + 1];
  const headings = lesson.blocks.filter((b): b is Extract<Block, { kind: 'h2' }> => b.kind === 'h2');

  return (
    <main className="learn">
      <LearnNav current={lesson.slug} />
      <article className="lesson" key={lesson.slug}>
        <p className="lesson-section">{lesson.section}</p>
        <h1>{lesson.title}</h1>
        <p className="lesson-summary">{lesson.summary}</p>
        <p className="lesson-draft">
          New page - if you spot a mistake, use &ldquo;Report a problem&rdquo; at the bottom.
        </p>

        {lesson.blocks.map((b, i) => (
          <BlockView key={i} block={b} id={`${lesson.slug}#${i}`} />
        ))}

        <LessonFoot lesson={lesson} />

        <nav className="prevnext" aria-label="Lessons">
          {prev ? (
            <Link href={`/learn/${prev.slug}`} className="prevnext-link">
              <span>Previous</span>
              {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/learn/${next.slug}`} className="prevnext-link is-next">
              <span>Next</span>
              {next.title}
            </Link>
          )}
        </nav>
      </article>

      {headings.length > 1 && (
        <aside className="toc" aria-label="On this page">
          <p className="toc-label">On this page</p>
          {headings.map((h) => (
            <a key={h.text} href={`#${anchor(h.text)}`}>
              {h.text}
            </a>
          ))}
        </aside>
      )}
    </main>
  );
}

function LearnNav({ current }: { current: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <nav className={`learn-nav${open ? ' is-open' : ''}`} aria-label="Lessons">
      <button type="button" className="learn-nav-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        All lessons
      </button>
      {SECTIONS.map((section) => (
        <div key={section} className="learn-nav-group">
          <p className="learn-nav-section">{section}</p>
          {LESSONS.filter((l) => l.section === section).map((l) => (
            <Link
              key={l.slug}
              href={`/learn/${l.slug}`}
              title={l.summary}
              className={`learn-nav-link${l.slug === current ? ' is-current' : ''}`}
              aria-current={l.slug === current ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {l.title}
              {isDone(l.slug) && <span className="learn-nav-done" aria-label="done"> ✓</span>}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

function LessonFoot({ lesson }: { lesson: LessonPage }) {
  const [done, setDoneState] = useState(() => isDone(lesson.slug));
  const [reporting, setReporting] = useState(false);
  return (
    <div className="lesson-foot">
      <label className="lesson-done">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => {
            setDone(lesson.slug, e.target.checked);
            setDoneState(e.target.checked);
          }}
        />
        I have finished this lesson
      </label>
      <button type="button" className="text-button" onClick={() => setReporting((r) => !r)} aria-expanded={reporting}>
        Report a problem
      </button>
      {reporting && (
        <ReportForm
          source={`/learn/${lesson.slug}`}
          output=""
          lang="lesson"
          orthography="standard"
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}

export function Text({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i) => {
        switch (part.kind) {
          case 'text':
            return part.text;
          case 'bold':
            return <strong key={i}>{part.text}</strong>;
          case 'italic':
            return <em key={i}>{part.text}</em>;
          case 'code':
            return <code key={i}>{part.text}</code>;
          case 'link':
            return part.url.startsWith('/') ? (
              <Link key={i} href={part.url}>
                {part.text}
              </Link>
            ) : (
              <a key={i} href={part.url} target="_blank" rel="noreferrer">
                {part.text}
              </a>
            );
          case 'isv':
            return (
              <span key={i} className="isv" title={toCyrillic(part.text)}>
                {part.text}
              </span>
            );
        }
      })}
    </>
  );
}

function BlockView({ block, id }: { block: Block; id: string }) {
  switch (block.kind) {
    case 'h2':
      return <h2 id={anchor(block.text)}>{block.text}</h2>;
    case 'p':
      return (
        <p>
          <Text text={block.text} />
        </p>
      );
    case 'note':
      return (
        <p className="lesson-note">
          <Text text={block.text} />
        </p>
      );
    case 'example':
      return (
        <figure className="example">
          <p className="example-isv">{block.isv}</p>
          <p className="example-cyr">{toCyrillic(block.isv)}</p>
          <figcaption>
            <span className="example-en">{block.en}</span>
            {block.note && (
              <span className="example-note">
                {' '}
                - <Text text={block.note} />
              </span>
            )}
            {block.tryIt && (
              <a className="example-try" href={`/?lang=en&text=${encodeURIComponent(block.en)}`}>
                Try it in the translator
              </a>
            )}
          </figcaption>
        </figure>
      );
    case 'table':
      return (
        <div className="table-wrap">
          <table>
            {block.caption && <caption>{block.caption}</caption>}
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) =>
                    c === 0 ? (
                      <th key={c} scope="row">
                        <Text text={cell} />
                      </th>
                    ) : (
                      <td key={c} className={block.isvColumns?.includes(c) ? 'isv' : undefined}>
                        <Text text={cell} />
                        {block.isvColumns?.includes(c) && cell && (
                          <span className="cell-cyr">{toCyrillic(cell)}</span>
                        )}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'forms':
      return (
        <div className="table-wrap">
          <table>
            <caption>{block.caption}</caption>
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {row.cells.map((cell, c) => (
                    <td key={c} className="isv">
                      {cell.form}
                      <span className="cell-cyr">{toCyrillic(cell.form)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'choice':
      return <Choice block={block} id={id} />;
    case 'fill':
      return <Fill block={block} id={id} />;
    case 'source':
      return (
        <p className="lesson-source">
          Source:{' '}
          <a href={block.url} target="_blank" rel="noreferrer">
            {block.title}
          </a>
          {block.quote && <q>{block.quote}</q>}
        </p>
      );
  }
}

function Choice({ block, id }: { block: Extract<Block, { kind: 'choice' }>; id: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const before = answered(id);
  return (
    <fieldset className="exercise">
      <legend>
        <Text text={block.prompt} />
      </legend>
      <div className="exercise-options">
        {block.options.map((o) => (
          <button
            key={o}
            type="button"
            className={[
              'exercise-option',
              picked === o ? (o === block.answer ? 'is-right' : 'is-wrong') : '',
              picked && o === block.answer ? 'is-answer' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-pressed={picked === o}
            disabled={picked !== null}
            onClick={() => {
              setPicked(o);
              recordAnswer(id, o === block.answer);
            }}
          >
            {o}
          </button>
        ))}
      </div>
      {picked !== null ? (
        <p className="exercise-result" role="status">
          {picked === block.answer ? 'Right. ' : `Not quite - it is ${block.answer}. `}
          <Text text={block.why} />{' '}
          <button type="button" className="text-button" onClick={() => setPicked(null)}>
            Try again
          </button>
        </p>
      ) : (
        before !== undefined && <p className="exercise-before">{before ? 'You got this right before.' : 'You missed this one last time.'}</p>
      )}
    </fieldset>
  );
}

/** Letters a learner may type without the diacritics: the answer still counts. */
const loose = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

function Fill({ block, id }: { block: Extract<Block, { kind: 'fill' }>; id: string }) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<'right' | 'close' | 'wrong' | null>(null);
  const accepted = [block.answer, ...(block.accept ?? [])];
  const check = (e: React.FormEvent) => {
    e.preventDefault();
    const exact = accepted.some((a) => a.toLowerCase() === value.trim().toLowerCase());
    const close = !exact && accepted.some((a) => loose(a) === loose(value));
    const r = exact ? 'right' : close ? 'close' : 'wrong';
    setResult(r);
    recordAnswer(id, r !== 'wrong');
  };
  return (
    <form className="exercise" onSubmit={check}>
      <label>
        <span className="exercise-prompt">
          <Text text={block.prompt} />
        </span>
        <span className="exercise-fill">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setResult(null);
            }}
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="text-button is-primary" disabled={!value.trim()}>
            Check
          </button>
        </span>
      </label>
      {result && (
        <p className="exercise-result" role="status">
          {result === 'right'
            ? 'Right. '
            : result === 'close'
              ? `Right letters - with the marks it is ${block.answer}. `
              : `Not quite - it is ${block.answer}. `}
          <Text text={block.why} />
        </p>
      )}
    </form>
  );
}
