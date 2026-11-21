import { clampFades, clampSpeed, dbLabel, fadeLimits, sliderToSpeed, speedLabel, speedToSlider, SPEED_PRESETS } from '../video/audio.ts';
import './speed-audio.css';

export interface SpeedAudioPatch {
  speed?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
}

/**
 * Speed and sound settings of the selected item, for the right-hand panel.
 * `duration` is the item's length on the edit clock at its current speed;
 * fades are kept within it (fade in plus fade out never exceed it), also when
 * a speed change makes the item shorter. `onChange` gets only the fields that
 * changed. The button that lifts the sound onto its own lane shows only when
 * `onExtract` is given (the item is a video).
 */
export function SpeedAudioPanel(props: {
  speed: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  duration: number;
  onChange: (patch: SpeedAudioPatch) => void;
  onExtract?: () => void;
  /** Which half to show: the phone has a Speed sheet and a Volume sheet. Default both (the desktop panel). */
  parts?: 'speed' | 'sound' | 'both';
}) {
  const { duration, onChange } = props;
  const speed = clampSpeed(props.speed);
  const fadeIn = props.fadeIn || 0;
  const fadeOut = props.fadeOut || 0;

  const setSpeed = (next: number) => {
    const s = clampSpeed(next);
    const patch: SpeedAudioPatch = { speed: s };
    const newDuration = (duration * speed) / s;
    if (fadeIn + fadeOut > newDuration) Object.assign(patch, clampFades(fadeIn, fadeOut, newDuration, 'in'));
    onChange(patch);
  };
  const setFade = (which: 'in' | 'out', v: number) => {
    const f = clampFades(which === 'in' ? v : fadeIn, which === 'out' ? v : fadeOut, duration, which);
    onChange(which === 'in' ? (f.fadeOut !== fadeOut ? f : { fadeIn: f.fadeIn }) : f.fadeIn !== fadeIn ? f : { fadeOut: f.fadeOut });
  };

  const inLimits = fadeLimits(duration, fadeOut);
  const outLimits = fadeLimits(duration, fadeIn);
  const seconds = (v: number) => `${v.toFixed(1)} s`;
  const showSpeed = props.parts !== 'sound';
  const showSound = props.parts !== 'speed';

  return (
    <section className="inspector speed-audio" aria-label="Speed and sound">
      {showSpeed && (
        <>
      <h3 className="insp-title">Speed</h3>
      <div className="sa-presets" role="group" aria-label="Speed presets">
        {SPEED_PRESETS.map((p) => (
          <button key={p} type="button" className="sa-preset" aria-pressed={speed === p} onClick={() => setSpeed(p)}>
            {speedLabel(p)}
          </button>
        ))}
      </div>
      <label className="insp-row">
        <span>Speed</span>
        <input aria-label="Speed" type="range" min={-2} max={2} step={0.01} value={speedToSlider(speed)} onChange={(e) => setSpeed(sliderToSpeed(Number(e.target.value)))} />
        <output>{speedLabel(speed)}</output>
      </label>
        </>
      )}

      {showSound && (
        <>
      <h3 className="insp-title">Sound</h3>
      <label className="insp-row">
        <span>Volume</span>
        <input aria-label="Volume" type="range" min={0} max={1} step={0.01} value={props.volume} onChange={(e) => onChange({ volume: Number(e.target.value) })} />
        <output>{dbLabel(props.volume)}</output>
      </label>
      <label className="insp-row">
        <span>Fade in</span>
        <input aria-label="Fade in" type="range" min={inLimits.min} max={inLimits.max} step={inLimits.step} value={Math.min(fadeIn, inLimits.max)} onChange={(e) => setFade('in', Number(e.target.value))} />
        <output>{seconds(fadeIn)}</output>
      </label>
      <label className="insp-row">
        <span>Fade out</span>
        <input aria-label="Fade out" type="range" min={outLimits.min} max={outLimits.max} step={outLimits.step} value={Math.min(fadeOut, outLimits.max)} onChange={(e) => setFade('out', Number(e.target.value))} />
        <output>{seconds(fadeOut)}</output>
      </label>

      {props.onExtract && (
        <button type="button" className="sa-extract" onClick={props.onExtract}>
          Extract audio
        </button>
      )}
        </>
      )}
    </section>
  );
}
