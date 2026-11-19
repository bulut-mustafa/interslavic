/** Asks before a file replaces work that has edits in it, so nothing is lost by a stray click. */
export function ReplaceBanner(props: { noun: string; name: string; onReplace: () => void; onKeep: () => void }) {
  return (
    <div className="replace-banner" role="alertdialog" aria-label={`Replace the ${props.noun}?`}>
      <p>
        Open <strong>{props.name}</strong> instead? Your edits to the current {props.noun} will be lost.
      </p>
      <div className="insp-actions">
        <button type="button" className="text-button is-primary" onClick={props.onReplace}>
          Open it
        </button>
        <button type="button" className="text-button" onClick={props.onKeep}>
          Keep editing
        </button>
      </div>
    </div>
  );
}
