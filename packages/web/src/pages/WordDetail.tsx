import type { GlossedWord, RuleCitation } from '../../../engine/src/pipeline.ts';
import { readable } from '../features.ts';

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
export function WordDetail({
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
