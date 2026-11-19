import { useState } from 'react';
import { track } from '../analytics.ts';

/** Puts text on the clipboard and says so; a refused clipboard leaves the text selectable. */
export function CopyButton(props: { text: string; label?: string; event?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.text);
      track(props.event ?? 'copy-translation');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; the text is still selectable.
    }
  };
  return (
    <button type="button" className="text-button" onClick={() => void copy()} disabled={!props.text}>
      {copied ? 'Copied' : (props.label ?? 'Copy')}
    </button>
  );
}
