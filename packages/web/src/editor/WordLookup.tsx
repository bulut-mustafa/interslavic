import { useEffect, useState } from 'react';

/** The Slavic languages the dictionary has a column for, in its own order. */
export const SLAVIC_LANGUAGES: { code: string; name: string }[] = [
  { code: 'ru', name: 'Russian' }, { code: 'be', name: 'Belarusian' }, { code: 'uk', name: 'Ukrainian' },
  { code: 'pl', name: 'Polish' }, { code: 'cs', name: 'Czech' }, { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' }, { code: 'hr', name: 'Croatian' }, { code: 'sr', name: 'Serbian' },
  { code: 'mk', name: 'Macedonian' }, { code: 'bg', name: 'Bulgarian' },
];

interface Entry {
  isv: string;
  pos: string;
  en: string;
  languages: Record<string, { words: string[]; unconfirmed: boolean }>;
}

/** "chlapec (hovor.)" -> "chlapec": the word without the dictionary's note in brackets. */
export const bare = (w: string): string => w.replace(/\s*\([^)]*\)/g, '').trim();

/**
 * Words in the other Slavic languages, for text in a language the translator
 * cannot write: look up an Interslavic or English word, and tap its form in
 * the language wanted to add it to the text. The words are the dictionary's
 * own columns, not a translation.
 */
export function WordLookup({ onInsert }: { onInsert: (word: string) => void }) {
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setEntries([]);
      setAsked(false);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      fetch(`/api/lookup?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((b: { entries?: Entry[] }) => {
          if (!live) return;
          setEntries(b.entries ?? []);
          setAsked(true);
          setError(null);
        })
        .catch(() => live && setError('The dictionary is not answering. It may still be starting up.'));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <details className="lookup">
      <summary>Other Slavic languages</summary>
      <p className="note">
        The translator writes Interslavic only. For another Slavic language, look a word up here and tap
        its form to add it - these are the dictionary&rsquo;s own words, one at a time - or type the text yourself.
      </p>
      <label className="insp-row">
        <span>Word</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Interslavic or English" spellCheck={false} />
      </label>
      {error && <p className="error-line">{error}</p>}
      {asked && entries.length === 0 && <p className="note">Nothing found for that word.</p>}
      {entries.map((e, i) => (
        <div className="lookup-entry" key={`${e.isv}-${i}`}>
          <p className="lookup-head">
            <strong lang="isv">{e.isv}</strong> <span>{e.en}</span>
          </p>
          {SLAVIC_LANGUAGES.filter((l) => e.languages[l.code]).map((l) => (
            <p className="lookup-lang" key={l.code}>
              <span>{l.name}</span>
              {e.languages[l.code]!.words.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`lookup-word${e.languages[l.code]!.unconfirmed ? ' is-unconfirmed' : ''}`}
                  title={e.languages[l.code]!.unconfirmed ? 'The dictionary marks this word as unconfirmed' : undefined}
                  onClick={() => onInsert(bare(w))}
                >
                  {w}
                </button>
              ))}
            </p>
          ))}
        </div>
      ))}
    </details>
  );
}
