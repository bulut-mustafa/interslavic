import { useState } from 'react';

/**
 * What testers send back: what they were looking at, what we showed, and what
 * is wrong with it. The server appends it to a file the maintainer downloads;
 * nothing else is collected - no name, no address.
 *
 * `lang` is the source language for a translation, or "lesson" for a page of
 * the Learn section, where `source` is the page and `output` the example.
 */
export function ReportForm({
  source,
  output,
  lang,
  orthography,
  onClose,
}: {
  source: string;
  output: string;
  lang: string;
  orthography: string;
  onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    try {
      const res = await fetch('/api/feedback', {
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
        &ldquo;{source}&rdquo;{output && <> &rarr; &ldquo;{output}&rdquo;</>}
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
        <span>{lang === 'lesson' ? 'What should it say? (optional)' : 'Better translation (optional)'}</span>
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
