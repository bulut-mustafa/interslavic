/**
 * A row of tabs in place of a dropdown. There are two source languages and four
 * scripts - few enough to show them all, so choosing one is one click and the
 * current choice is always visible, as in any translator's language bar.
 */
export function Tabs<T extends string>({
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
