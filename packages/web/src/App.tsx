import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GlossedWord, Translation } from '../../engine/src/pipeline.ts';
import type { Orthography } from '../../morph/src/orthography.ts';

const API = 'http://127.0.0.1:8766';

type Lang = 'en' | 'ru';

const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
];

const ORTHS: { value: Orthography; label: string }[] = [
  { value: 'standard', label: 'Standard Latin' },
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

  return (
    <div className="shell">
      <header className="masthead">
        <h1 className="wordmark">Medžuslovjansky</h1>
        <p>
          Translates into Interslavic and shows its reasoning for every word, including
          where it is guessing.
        </p>
        <div className="controls">
          <label>
            From
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Script
            <select value={orth} onChange={(e) => setOrth(e.target.value as Orthography)}>
              {ORTHS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="panes">
        <section className="pane">
          <div className="pane-head">{lang === 'en' ? 'English' : 'Russian'}</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={lang === 'en' ? 'Type a sentence…' : 'Введите предложение…'}
            aria-label="Text to translate"
          />
        </section>

        <section className="pane">
          <div className="pane-head">
            Interslavic{busy ? ' · translating' : ''}
          </div>

          {primary.length === 0 && !error ? (
            <p className="placeholder">—</p>
          ) : (
            <>
              <div>
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
                            activeWord === `${i}-${j}` ? 'is-active' : '',
                            w.validation !== 'validated' ? 'is-flagged' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => setActiveWord(`${i}-${j}`)}
                          title={`${w.lemma} · ${w.pos}`}
                        >
                          {w.surface}
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

              {rate !== null && (
                <div className="meter">
                  <span>
                    {words.length - unresolved.length} of {words.length} words found in the
                    lexicon
                  </span>
                  <span className="meter-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(rate * 100)}%` }} />
                  </span>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {error && (
        <div className="error">
          <p>{error}</p>
          <p>
            The parser and engine both need to be running: <code>npm run parser</code> in one
            terminal, <code>npm run server</code> in another.
          </p>
        </div>
      )}

      {words.length > 0 && (
        <section className="analysis">
          <h2>Why each word came out this way</h2>
          <p>
            The rail beside each line shows how much to trust it. Thick plum means the engine
            guessed.
          </p>

          {primary.map((s, i) =>
            s.words.map((w, j) => (
              <WordEntry
                key={`${i}-${j}`}
                word={w}
                active={activeWord === `${i}-${j}`}
                onSelect={() => setActiveWord(`${i}-${j}`)}
              />
            )),
          )}

          <div className="legend">
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
        </section>
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
    </div>
  );
}

function WordEntry({
  word,
  active,
  onSelect,
}: {
  word: GlossedWord;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`entry${active ? ' is-active' : ''}`}
      onMouseEnter={onSelect}
      role="group"
      aria-label={word.surface}
    >
      <div>
        <span className="entry-form">{word.surface}</span>
        <span className="entry-source">from “{word.sourceForm}”</span>
        <span className="entry-lemma">
          {word.lemma} · {word.pos}
        </span>
        {word.validation !== 'validated' && (
          <span className="flag">
            {word.validation === 'untranslated' ? 'not translated' : 'unverified'}
          </span>
        )}
      </div>

      <div>
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
          </div>
        ))}

        {word.aspect && (
          <div className="feature" data-confidence="high">
            <span className="feature-value">{word.aspect.chosen === 'Imp' ? 'imperfective' : 'perfective'}</span>
            <span className="feature-why">{word.aspect.because}</span>
          </div>
        )}

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
