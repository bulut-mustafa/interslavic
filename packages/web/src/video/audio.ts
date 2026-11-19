import { newId } from '../editor/layers.ts';
import type { AudioLayer } from './project.ts';

/**
 * Pure helpers for the sound side of an item: speed, volume, fades, and
 * lifting a video's sound onto its own lane. What was verified, and what was
 * not, is in docs/ideas/video-research-audio.md.
 */

/** HTMLMediaElement.playbackRate: MDN names 0.25..4.0 as the range Gecko keeps sound in; the transport clamps to the same. */
export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4;
export const SPEED_PRESETS: readonly number[] = [0.25, 0.5, 1, 1.5, 2, 3, 4];

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A speed the player can honour: 0.25..4, two decimals; anything that is not a number is 1. */
export function clampSpeed(s: number | undefined): number {
  if (s === undefined || !Number.isFinite(s)) return 1;
  return round2(Math.min(Math.max(s, SPEED_MIN), SPEED_MAX));
}

export const speedLabel = (s: number): string => `${round2(s)}x`;

/** How long `srcSeconds` of source last on the edit clock at this speed. */
export const lengthAtSpeed = (srcSeconds: number, speed: number): number => srcSeconds / clampSpeed(speed);

/** The speed slider is logarithmic (-2..2 = 0.25x..4x) so 0.5x and 2x sit the same distance from 1x. */
export const speedToSlider = (speed: number): number => Math.log2(clampSpeed(speed));
export const sliderToSpeed = (v: number): number => clampSpeed(2 ** v);

/** What one fade slider may be set to: the item's length less the other fade, so fadeIn + fadeOut never exceed it. */
export function fadeLimits(duration: number, other = 0): { min: number; max: number; step: number } {
  const d = Math.max(Number.isFinite(duration) ? duration : 0, 0);
  return { min: 0, max: Math.max(d - Math.max(other, 0), 0), step: 0.1 };
}

/** Both fades after one of them was set: the one just changed wins, the other shrinks to fit. */
export function clampFades(fadeIn: number, fadeOut: number, duration: number, changed: 'in' | 'out'): { fadeIn: number; fadeOut: number } {
  const d = Math.max(duration, 0);
  const pos = (n: number) => Math.max(Number.isFinite(n) ? n : 0, 0);
  if (changed === 'in') {
    const a = Math.min(pos(fadeIn), d);
    return { fadeIn: a, fadeOut: Math.min(pos(fadeOut), d - a) };
  }
  const b = Math.min(pos(fadeOut), d);
  return { fadeIn: Math.min(pos(fadeIn), d - b), fadeOut: b };
}

/** Gain (amplitude ratio) from decibels, and back. 0 gain is -Infinity dB. */
export const dBToGain = (db: number): number => 10 ** (db / 20);
export const gainToDb = (gain: number): number => (gain > 0 ? 20 * Math.log10(gain) : -Infinity);

/** Volume as the panel shows it: "0 dB", "-6.0 dB", "-∞ dB". The volume is 0..1, so it never goes above 0 dB. */
export function dbLabel(gain: number): string {
  const db = gainToDb(gain);
  if (db === -Infinity) return '-∞ dB';
  return Math.abs(db) < 0.05 ? '0 dB' : `${db.toFixed(1)} dB`;
}

/**
 * Scale to apply to each of `n` sounds summed into one output so that n
 * full-scale sounds cannot add up past 1. 1/n is the worst case (every
 * sound at its peak at once), so it is safe but quiet for many sounds; it is
 * a bound, not a loudness target.
 */
export const mixHeadroom = (n: number): number => 1 / Math.max(1, Math.floor(n) || 1);

export interface ExtractInput {
  srcId: string;
  /** Where in the source the picture item starts playing. */
  in: number;
  /** Where the item sits on the edit clock, and how long it lasts there. */
  editStart: number;
  editLength: number;
  speed?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  /** The lane for the new sound. */
  track: number;
}

/**
 * "Extract audio": a sound layer that plays the same file's sound over the same
 * stretch of the edit, plus the patch that mutes the picture item so the
 * sound is not heard twice. The file is not copied.
 */
export function extractAudioLayer(i: ExtractInput): { layer: AudioLayer; mute: { volume: number } } {
  const layer: AudioLayer = { id: newId('a'), kind: 'audio', srcId: i.srcId, in: i.in, start: i.editStart, end: i.editStart + i.editLength, track: i.track };
  if (i.speed !== undefined) layer.speed = i.speed;
  if (i.volume !== undefined) layer.volume = i.volume;
  if (i.fadeIn !== undefined) layer.fadeIn = i.fadeIn;
  if (i.fadeOut !== undefined) layer.fadeOut = i.fadeOut;
  return { layer, mute: { volume: 0 } };
}
