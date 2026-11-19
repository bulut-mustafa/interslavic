import { describeFeatures } from '../features.ts';
import type { AnalyzedWord } from '../../../lexicon/src/analyze.ts';

/** What the dictionary says about one tapped word, or that it is not found. */
export function WordCard({ word, onReplace }: { word: AnalyzedWord; onReplace?: (suggestion: string) => void }) {
  return (
    <section className="entry read-card" aria-label={`About ${word.text}`}>
      <h2 className="read-card-word" lang="isv">
        {word.text}
      </h2>

      {word.status === 'known' ? (
        <>
          {word.readAs && (
            <p className="note">
              Written without ě: read as <span lang="isv">{word.readAs.join(', ')}</span>. The
              orthography page allows e for ě.
            </p>
          )}
          <ul className="read-readings">
            {word.readings.map((r, i) => (
              <li key={i}>
                <p>
                  <span className="read-lemma" lang="isv">
                    {r.lemma}
                  </span>{' '}
                  <span className="read-pos">{r.pos}</span>
                </p>
                {r.featSets
                  .filter((f) => Object.keys(f).length > 0)
                  .map((f, k) => (
                    <p className="read-feats" key={k}>
                      {describeFeatures(f).join(', ')}
                    </p>
                  ))}
                {r.en.length > 0 && <p className="read-gloss">{r.en.join(', ')}</p>}
                {r.ru.length > 0 && (
                  <p className="read-gloss" lang="ru">
                    {r.ru.join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {word.totalReadings > word.readings.length && (
            <p className="note">
              {word.totalReadings - word.readings.length} more readings of this form are not shown.
            </p>
          )}
          {word.totalReadings > 1 && (
            <p className="note">
              One written form can be several forms at once; the dictionary does not say which one
              is meant here.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="note">
            {word.foreignLetters
              ? 'This word has letters that are not in any Interslavic alphabet, so it was not looked up.'
              : word.status === 'maybe-name'
                ? 'Not found among the dictionary’s forms. It starts with a capital, so it may be a name the dictionary does not list.'
                : 'Not found among the dictionary’s forms. It may be a misspelling, a form the dictionary’s rules do not generate, or a word the dictionary lacks.'}
          </p>
          {word.suggestions.length > 0 && (
            <div className="read-suggestions">
              <span className="read-pos">Nearest forms:</span>
              {word.suggestions.map((s) =>
                onReplace ? (
                  <button key={s} type="button" className="text-button" onClick={() => onReplace(s)}>
                    <span lang="isv">{s}</span>
                  </button>
                ) : (
                  <span key={s} lang="isv" className="read-suggestion">
                    {s}
                  </span>
                ),
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
