import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GlossedWord, RuleCitation, Translation } from '../../engine/src/pipeline.ts';
import type { Orthography } from '../../morph/src/orthography.ts';

// Same origin: the engine serves the page in production, Vite proxies in dev.
const API = '';

type Lang = 'en' | 'ru';

const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
];

const ORTHS: { value: Orthography; label: string }[] = [
  { value: 'standard', label: 'Latin' },
  { value: 'etymological', label: 'Etymological' },
  { value: 'simplified', label: 'Simplified' },
  { value: 'cyrillic', label: 'Cyrillic' },
];

/** The script shown as the quiet second line: Latin and Cyrillic map 1:1. */
const alternateOf = (o: Orthography): Orthography =>
  o === 'cyrillic' ? 'standard' : 'cyrillic';

const CONFIDENCE_ORDER = ['guess', 'default', 'high', 'certain'] as const;

/** Sentence-final punctuation, which lives on the sentence rather than a word. */
const terminalPunctuation = (text: string): string => text.match(/[.!?…]+$/)?.[0] ?? '';

/**
 * The words are bare forms; the sentence carries the capital, as it carries the
 * full stop. Shown as-is the line read "žena pročitala ..." under a heading-cased
 * Cyrillic "Жена прочитала ...".
 */
const asWritten = (surface: string, sentence: string, first: boolean): string =>
  first && sentence.toLowerCase().startsWith(surface.toLowerCase())
    ? sentence.slice(0, surface.length)
    : surface;

async function fetchTranslation(
  text: string,
  lang: Lang,
  orthography: Orthography,
): Promise<Translation[]> {
  const res = await fetch(`${API}/api/translate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, lang, orthography }),
  });
  const body = (await res.json()) as { sentences?: Translation[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);
  return body.sentences ?? [];
}

export default function App() {
  const [text, setText] = useState('The woman read a new book.');
  const [lang, setLang] = useState<Lang>('en');
  const [orth, setOrth] = useState<Orthography>('standard');
  const [primary, setPrimary] = useState<Translation[]>([]);
  const [alternate, setAlternate] = useState<Translation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const requestId = useRef(0);

  const run = useCallback(async () => {
    const id = ++requestId.current;
    if (!text.trim()) {
      setPrimary([]);
      setAlternate([]);
      setError(null);
      return;
    }
    setBusy(true);
    try {
      const [main, alt] = await Promise.all([
        fetchTranslation(text, lang, orth),
        fetchTranslation(text, lang, alternateOf(orth)),
      ]);
      if (id !== requestId.current) return; // a newer request won
      setPrimary(main);
      setAlternate(alt);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setPrimary([]);
      setAlternate([]);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }, [text, lang, orth]);

  // Debounced so typing does not fire a parse per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void run(), 450);
    return () => clearTimeout(t);
  }, [run]);

  const words = useMemo(() => primary.flatMap((s) => s.words), [primary]);

  const rate = useMemo(() => {
    const rated = primary.filter((s) => s.validationRate !== null);
    if (rated.length === 0) return null;
    const checked = words.filter((w) => w.validation === 'validated').length;
    return words.length === 0 ? 1 : checked / words.length;
  }, [primary, words]);

  const unresolved = words.filter((w) => w.validation !== 'validated');
  const dropped = primary.flatMap((s) => s.dropped);

  /**
   * Every word in the result, flat and in reading order. The panel shows one
   * at a time, so it needs an order to step through rather than a nested shape
   * to search.
   */
  const wordKeys = useMemo(
    () => primary.flatMap((s, i) => s.words.map((_, j) => `${i}-${j}`)),
    [primary],
  );

  /**
   * The panel is never empty: a translation shows its first word unless the
   * reader has picked another one.
   *
   * DERIVED during render rather than set by an effect. An effect would leave
   * one render where the words exist but nothing is selected - a visible flash
   * of an empty panel under a heading reading "Why this word", and a real race
   * for anything observing the DOM. Falling back here means the words and the
   * panel appear in the same paint.
   */
  const active =
    activeWord && wordKeys.includes(activeWord) ? activeWord : (wordKeys[0] ?? null);

  const selected = useMemo(() => {
    if (!active) return null;
    for (const [i, s] of primary.entries()) {
      for (const [j, w] of s.words.entries()) {
        if (`${i}-${j}` === active) return { word: w, citations: s.citations ?? {} };
      }
    }
    return null;
  }, [primary, active]);

  const selectedIndex = active ? wordKeys.indexOf(active) : -1;
  const stepWord = (delta: number) => {
    const next = selectedIndex + delta;
    if (next >= 0 && next < wordKeys.length) setActiveWord(wordKeys[next]!);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <h1 className="wordmark">Medžuslovjansky</h1>
        <p className="tagline">Interslavic translator that shows its reasoning for every word</p>
      </header>

      <main className="translator">
        <div className="langbar">
          <Tabs label="Translate from" options={LANGS} value={lang} onChange={setLang} />
          <span className="langbar-arrow" aria-hidden="true">
            →
          </span>
          <div className="langbar-target">
            <span className="target-lang">Interslavic</span>
            <Tabs label="Script" options={ORTHS} value={orth} onChange={setOrth} />
          </div>
        </div>

        <div className="panes">
          <section className="pane pane-source">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              placeholder={lang === 'en' ? 'Type a sentence…' : 'Введите предложение…'}
              aria-label="Text to translate"
            />
            {text && (
              <button
                type="button"
                className="icon-button pane-clear"
                onClick={() => setText('')}
                aria-label="Clear text"
                title="Clear text"
              >
                ×
              </button>
            )}
          </section>

          <section className={`pane pane-target${busy ? ' is-busy' : ''}`} aria-live="polite">
            {primary.length === 0 && !error ? (
              <p className="placeholder">{busy ? 'Translating…' : 'Translation'}</p>
            ) : (
              <>
                <div className="output-lines">
                  {primary.map((s, i) => (
                    <p className="output" key={i}>
                      {s.words.map((w, j) => (
                        <Fragment key={`${i}-${j}`}>
                          {/* An explicit space: adjacent JSX elements have none,
                              so the words ran together as one string. */}
                          {j > 0 ? ' ' : null}
                          <button
                            type="button"
                            className={[
                              'output-word',
                              active === `${i}-${j}` ? 'is-active' : '',
                              w.validation !== 'validated' ? 'is-flagged' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() => setActiveWord(`${i}-${j}`)}
                            aria-pressed={active === `${i}-${j}`}
                            title={`${w.lemma} · ${w.pos}`}
                          >
                            {asWritten(w.surface, s.text, j === 0)}
                          </button>
                        </Fragment>
                      ))}
                      {/* The words carry no punctuation; the sentence does. */}
                      {terminalPunctuation(s.text)}
                    </p>
                  ))}
                </div>

                {alternate.length > 0 && (
                  <p className="alt-script" aria-label="The same text in the other script">
                    {alternate.map((s) => s.text).join(' ')}
                  </p>
                )}

                <div className="pane-foot">
                  {rate !== null && (
                    <div className="meter">
                      <span className="meter-bar" aria-hidden="true">
                        <span style={{ width: `${Math.round(rate * 100)}%` }} />
                      </span>
                      <span className="meter-label">
                        {words.length - unresolved.length} of {words.length} words found in the
                        lexicon
                      </span>
                    </div>
                  )}
                  <div className="pane-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setReporting((r) => !r)}
                      aria-expanded={reporting}
                    >
                      Report a problem
                    </button>
                    <CopyButton text={primary.map((s) => s.text).join(' ')} />
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {reporting && primary.length > 0 && (
        <ReportForm
          source={text}
          output={primary.map((s) => s.text).join(' ')}
          lang={lang}
          orthography={orth}
          onClose={() => setReporting(false)}
        />
      )}

      {error && (
        <div className="error">
          <h2>The translator is not answering</h2>
          <p>It may still be starting up - please try again in a minute.</p>
          {/* How to start the services is for whoever runs it locally, not for testers. */}
          {import.meta.env.DEV && (
            <>
              <p>{error}</p>
              <p>
                The parser and engine both need to be running: <code>npm run parser</code> in one
                terminal, <code>npm run server</code> in another.
              </p>
            </>
          )}
        </div>
      )}

      {selected && (
        <section className="block">
          <div className="detail-head">
            <h2 className="block-label">Why this word</h2>
            <div className="stepper">
              <button
                type="button"
                onClick={() => stepWord(-1)}
                disabled={selectedIndex <= 0}
                aria-label="Previous word"
              >
                ‹ prev
              </button>
              <span className="stepper-count">
                {selectedIndex + 1} of {wordKeys.length}
              </span>
              <button
                type="button"
                onClick={() => stepWord(1)}
                disabled={selectedIndex >= wordKeys.length - 1}
                aria-label="Next word"
              >
                next ›
              </button>
            </div>
          </div>
          <WordDetail word={selected.word} citations={selected.citations} />
        </section>
      )}

      {words.length > 0 && (
        <div className="legend">
          <span className="legend-label">How much to trust a line</span>
          {CONFIDENCE_ORDER.map((c) => (
            <span key={c}>
              <i style={{ background: `var(--${c})` }} />
              {c === 'certain'
                ? 'certain'
                : c === 'high'
                  ? 'lexically governed'
                  : c === 'default'
                    ? 'default, exceptions exist'
                    : 'guess'}
            </span>
          ))}
        </div>
      )}

      {(dropped.length > 0 || unresolved.length > 0) && (
        <section className="footnotes">
          {dropped.length > 0 && (
            <div>
              <h3>Left out</h3>
              {dropped.map((d, i) => (
                <div key={i}>
                  <span className="dropped-word">{d.form}</span> — {d.why}
                </div>
              ))}
            </div>
          )}
          {unresolved.length > 0 && (
            <div>
              <h3>Not verified</h3>
              {unresolved.map((w, i) => (
                <div key={i}>
                  <span className="dropped-word">{w.surface}</span> —{' '}
                  {w.validation === 'untranslated'
                    ? 'no Interslavic word found; the original is kept'
                    : 'not in the full-form lexicon, so it may not be a real form'}
                </div>
              ))}
            </div>
          )}
        </section>
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

/**
 * What testers send back: the sentence, our output, and what is wrong with it.
 * The server appends it to a file the maintainer downloads; nothing else is
 * collected - no name, no address.
 */
function ReportForm({
  source,
  output,
  lang,
  orthography,
  onClose,
}: {
  source: string;
  output: string;
  lang: Lang;
  orthography: Orthography;
  onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    try {
      const res = await fetch(`${API}/api/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source, output, lang, orthography, comment, suggestion }),
      });
      setState(res.ok ? 'sent' : 'failed');
    } catch {
      setState('failed');
    }
  };

  if (state === 'sent') {
    return (
      <section className="report" aria-live="polite">
        <p className="report-thanks">Thank you - the report was sent.</p>
        <button type="button" className="text-button" onClick={onClose}>
          Close
        </button>
      </section>
    );
  }

  return (
    <form className="report" onSubmit={(e) => void send(e)}>
      <h2 className="block-label">Report a problem</h2>
      <p className="report-context">
        &ldquo;{source}&rdquo; &rarr; &ldquo;{output}&rdquo;
      </p>
      <label>
        <span>What is wrong?</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="e.g. wrong word, wrong ending, wrong word order…"
          rows={3}
        />
      </label>
      <label>
        <span>Better translation (optional)</span>
        <textarea value={suggestion} onChange={(e) => setSuggestion(e.target.value)} rows={2} />
      </label>
      {state === 'failed' && <p className="report-error">Could not send - please try again.</p>}
      <div className="report-actions">
        <button type="button" className="text-button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          className="text-button is-primary"
          disabled={state === 'sending' || (!comment.trim() && !suggestion.trim())}
        >
          {state === 'sending' ? 'Sending…' : 'Send report'}
        </button>
      </div>
    </form>
  );
}

/**
 * A row of tabs in place of a dropdown. There are two source languages and four
 * scripts - few enough to show them all, so choosing one is one click and the
 * current choice is always visible, as in any translator's language bar.
 */
function Tabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`tab${o.value === value ? ' is-selected' : ''}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; the text is still selectable.
    }
  };
  return (
    <button type="button" className="text-button" onClick={() => void copy()} disabled={!text}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/**
 * What says so.
 *
 * The confidence rail already told the reader how sure the engine is. This
 * tells them WHY, which for a language-learning tool is the more useful half:
 * a learner can follow the rule to van Steenbergen's own sentence and decide
 * for themselves, instead of taking our word for it.
 *
 * Collapsed by default. A gloss panel that shouted every citation at once
 * would bury the translation it is explaining.
 */
const TIER_LABEL: Record<RuleCitation['tier'], string> = {
  normative: 'grammar',
  corpus: 'attested usage',
  dictionary: 'dictionary',
  transfer: 'from the source text',
  structural: 'sentence structure',
};

function Citation({ citation, ruleId }: { citation?: RuleCitation; ruleId: string }) {
  // A rule with no entry is a bug the registry test catches; say so plainly
  // rather than quietly showing nothing.
  if (!citation) return <span className="citation-missing">no source recorded for {ruleId}</span>;
  return (
    <details className="citation">
      <summary data-tier={citation.tier}>{TIER_LABEL[citation.tier]}</summary>
      <div className="citation-body">
        <p className="citation-why">{citation.why}</p>
        {citation.quote && <blockquote className="citation-quote">{citation.quote}</blockquote>}
        {citation.source &&
          (citation.source.startsWith('http') ? (
            <a className="citation-source" href={citation.source} target="_blank" rel="noreferrer">
              {citation.source}
            </a>
          ) : (
            <span className="citation-source">{citation.source}</span>
          ))}
        <span className="citation-rule">{ruleId}</span>
      </div>
    </details>
  );
}

/**
 * One word's reasoning, in full.
 *
 * This replaced a list of every word in the sentence. The list was complete and
 * unreadable: ten words times four features times a citation each is forty
 * blocks of small print, with nothing to say where to look. Showing one word at
 * a time costs nothing - the sentence above is the index, and every word in it
 * is a button - and buys room to set the reasoning at a size a person can read.
 */
function WordDetail({
  word,
  citations,
}: {
  word: GlossedWord;
  citations: Record<string, RuleCitation>;
}) {
  return (
    <div className="entry" role="group" aria-label={word.surface}>
      <div className="entry-head">
        <span className="entry-form">{word.surface}</span>
        <span className="entry-source">from “{word.sourceForm}”</span>
      </div>

      <div className="entry-meta">
        <span className="entry-lemma">
          {word.lemma} · {word.pos}
        </span>
        {word.validation !== 'validated' && (
          <span className="flag">
            {word.validation === 'untranslated' ? 'not translated' : 'unverified'}
          </span>
        )}
      </div>

      {/* An untranslated word has no features; an empty block left two rules
          with nothing between them. */}
      {(word.features.length > 0 || word.aspect) && (
        <div className="entry-features">
          {word.features.map((f) => (
            <div className="feature" data-confidence={f.confidence} key={f.name}>
              <span className="feature-value">{readable(f.name, f.value)}</span>
              <span className="feature-why">{f.because}</span>
              {f.alternatives.length > 0 && (
                <ul className="alts">
                  {f.alternatives.map((a, i) => (
                    <li key={i}>
                      could also be {readable(f.name, a.value)} — {a.because}
                    </li>
                  ))}
                </ul>
              )}
              <Citation citation={citations[f.ruleId]} ruleId={f.ruleId} />
            </div>
          ))}

          {word.aspect && (
            <div className="feature" data-confidence="high">
              <span className="feature-value">
                {word.aspect.chosen === 'Imp' ? 'imperfective' : 'perfective'}
              </span>
              <span className="feature-why">{word.aspect.because}</span>
            </div>
          )}
        </div>
      )}

      {(word.lexicalChoice || word.notes.length > 0) && (
        <div className="entry-notes">
          {word.lexicalChoice && <p className="note">{word.lexicalChoice.because}</p>}
          {word.lexicalChoice?.rejected.length ? (
            <p className="note">chosen over {word.lexicalChoice.rejected.join('; ')}</p>
          ) : null}
          {word.notes.map((n, i) => (
            <p className="note" key={i}>
              {n}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Feature names and values as a learner would say them aloud. */
const CASES: Record<string, string> = {
  Nom: 'nominative',
  Acc: 'accusative',
  Gen: 'genitive',
  Dat: 'dative',
  Ins: 'instrumental',
  Loc: 'locative',
  Voc: 'vocative',
};

const PLAIN: Record<string, string> = {
  Sing: 'singular',
  Plur: 'plural',
  Masc: 'masculine',
  Fem: 'feminine',
  Neut: 'neuter',
  Anim: 'animate',
  Inan: 'inanimate',
  Pres: 'present',
  Past: 'past',
  Imp: 'imperfective',
  Perf: 'perfective',
  Part: 'participle',
  Fin: 'finite',
  Ind: 'indicative',
  Act: 'active',
  Pass: 'passive',
};

function readable(name: string, value: string): string {
  if (name === 'Case') return CASES[value] ?? value;
  if (name === 'Person') return `${value}rd person`.replace('1rd', '1st').replace('2rd', '2nd');
  return PLAIN[value] ?? value;
}
