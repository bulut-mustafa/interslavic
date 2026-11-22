import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { track } from '../analytics.ts';
import type { Translation } from '../../../engine/src/pipeline.ts';
import type { Orthography } from '../../../morph/src/orthography.ts';
import { ReportForm } from '../components/ReportForm.tsx';
import { Tabs } from '../components/Tabs.tsx';
import { CopyButton } from '../components/CopyButton.tsx';
import { permalink } from '../permalink.ts';
import { Listen, VoicePicker } from '../speech/Listen.tsx';
import { useIsPhone } from '../phone/useIsPhone.ts';
import { WordDetail } from './WordDetail.tsx';
import { TranslatorPhone } from './TranslatorPhone.tsx';

// Same origin: the engine serves the page in production, Vite proxies in dev.
const API = '';

type Lang = 'en' | 'ru' | 'uk';

const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
  { value: 'uk', label: 'Ukrainian' },
];

const PLACEHOLDERS: Record<Lang, string> = {
  en: 'Type a sentence…',
  ru: 'Введите предложение…',
  uk: 'Введіть речення…',
};

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

type Line = Translation & { breakAfter?: true };

/** Both scripts from one request: the server parses once and renders twice. */
async function fetchTranslation(
  text: string,
  lang: Lang,
  orthography: Orthography,
): Promise<{ main: Line[]; alt: Line[] }> {
  const res = await fetch(`${API}/api/translate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, lang, orthography, alternate: alternateOf(orthography) }),
  });
  const body = (await res.json()) as { sentences?: Line[]; alternate?: Line[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);
  return { main: body.sentences ?? [], alt: body.alternate ?? [] };
}

/** The whole translation as text, with the input's line breaks kept. */
const joined = (sentences: Line[]): string =>
  sentences.map((s, i) => s.text + (i === sentences.length - 1 ? '' : s.breakAfter ? '\n' : ' ')).join('');

/** A lesson's "Try it" link opens the translator with its sentence: /?lang=en&text=... */
function fromAddress(): { text: string; lang: Lang; script: Orthography } {
  const q = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  return {
    text: q.get('text') ?? '',
    lang: LANGS.find((l) => l.value === q.get('lang'))?.value ?? 'en',
    script: ORTHS.find((o) => o.value === q.get('script'))?.value ?? 'standard',
  };
}

export default function Translator() {
  const [text, setText] = useState(() => fromAddress().text);
  const [lang, setLang] = useState<Lang>(() => fromAddress().lang);
  const [orth, setOrth] = useState<Orthography>(() => fromAddress().script);
  const [primary, setPrimary] = useState<Line[]>([]);
  const [alternate, setAlternate] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const requestId = useRef(0);
  const phone = useIsPhone();

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
      const { main, alt } = await fetchTranslation(text, lang, orth);
      if (id !== requestId.current) return; // a newer request won
      setPrimary(main);
      setAlternate(alt);
      setError(null);
      track('translate', { lang, script: orth });
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setPrimary([]);
      setAlternate([]);
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }, [text, lang, orth]);

  // Debounced so typing does not fire a parse per keystroke. On a phone the
  // Translate button asks instead (typing with a keyboard up should not move the
  // page under the thumb); a text that arrives with the address, or a changed
  // language or script, still translates by itself.
  const opened = useRef(false);
  const lastSettings = useRef(`${lang}|${orth}`);
  useEffect(() => {
    if (!phone) {
      const t = setTimeout(() => void run(), 450);
      return () => clearTimeout(t);
    }
    const settings = `${lang}|${orth}`;
    const changed = settings !== lastSettings.current;
    lastSettings.current = settings;
    const first = !opened.current;
    opened.current = true;
    if ((first || changed) && text.trim()) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, phone]);

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

  if (phone) {
    return (
      <TranslatorPhone
        text={text}
        setText={setText}
        lang={lang}
        setLang={setLang as (l: never) => void}
        langs={LANGS}
        placeholder={PLACEHOLDERS[lang]}
        orth={orth}
        setOrth={setOrth}
        orths={ORTHS}
        primary={primary}
        alternate={alternate}
        error={error}
        busy={busy}
        run={() => void run()}
        rate={rate}
        wordCount={words.length}
        unresolved={unresolved}
        dropped={dropped}
        wordKeys={wordKeys}
        active={active}
        setActiveWord={setActiveWord}
        selected={selected}
        selectedIndex={selectedIndex}
        stepWord={stepWord}
        asWritten={asWritten}
        terminal={terminalPunctuation}
        legend={CONFIDENCE_ORDER.map((c) => ({
          key: c,
          color: `var(--${c})`,
          label: c === 'certain' ? 'certain' : c === 'high' ? 'lexically governed' : c === 'default' ? 'default, exceptions exist' : 'guess',
        }))}
      />
    );
  }

  return (
    <>
      <h1 className="tagline">Interslavic translator that shows its reasoning for every word</h1>

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
              placeholder={PLACEHOLDERS[lang]}
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

          {/* On a phone the panes stack, so the target language and script move
              here, directly above the translation they describe; the bar at the
              top keeps only the source language. Four script tabs do not fit a
              phone's width, so here they are a dropdown. */}
          <div className="target-bar">
            <span className="target-lang">Interslavic</span>
            <select
              className="script-select"
              value={orth}
              onChange={(e) => setOrth(e.target.value as Orthography)}
              aria-label="Script"
            >
              {ORTHS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <section className={`pane pane-target${busy ? ' is-busy' : ''}`} aria-live="polite">
            {primary.length === 0 && !error ? (
              <p className="placeholder">{busy ? 'Translating…' : 'Translation'}</p>
            ) : (
              <>
                <div className="output-lines">
                  {primary.map((s, i) => (
                    <p className="output" lang="isv" key={i}>
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

                {primary.some((s) => s.warnings?.length) && (
                  <ul className="output-warnings" role="note" aria-label="Expressions translated word by word">
                    {primary.flatMap((s) => s.warnings ?? []).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}

                {alternate.length > 0 && (
                  <p className="alt-script" aria-label="The same text in the other script">
                    {joined(alternate)}
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
                      onClick={() => {
                        if (!reporting) track('report-open', { where: 'translator' });
                        setReporting((r) => !r);
                      }}
                      aria-expanded={reporting}
                    >
                      Report a problem
                    </button>
                    <CopyButton
                      text={permalink('/', { lang, script: orth, text })}
                      label="Copy link"
                      event="copy-link"
                    />
                    <Listen text={joined(primary)} where="translator" />
                    <CopyButton text={joined(primary)} />
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {primary.length > 0 && <VoicePicker />}

      {reporting && primary.length > 0 && (
        <ReportForm
          source={text}
          output={joined(primary)}
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
    </>
  );
}
