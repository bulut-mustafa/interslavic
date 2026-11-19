export const round = (n: number, places = 2): number => Math.round(n * 10 ** places) / 10 ** places;

/** A labelled range input with its value shown beside it; shared by the inspector panels. */
export function Slider(props: { label: string; value: number; min: number; max: number; step: number; show?: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="insp-row">
      <span>{props.label}</span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
      <output>{props.show ? props.show(props.value) : round(props.value)}</output>
    </label>
  );
}
