import type { TextLayer } from '../editor/layers.ts';

/**
 * Speaking the video's text aloud as it comes on screen, while the preview
 * plays. It decides only WHEN to speak; how the words are voiced is handed in,
 * so this can be tested without a speaker. A line is spoken when its start is
 * passed, and cut off when its text leaves the screen, so the voice never runs
 * on into the next scene. While a line is spoken the original sound is turned
 * down (ducked), and brought back when it ends.
 */

export interface VoiceDeps {
  speak(text: string, onEnd: () => void): void;
  stop(): void;
  duck(on: boolean): void;
}

/** A jump bigger than this between two updates is a seek, not playback: nothing is spoken for it. */
const JUMP = 1;

export class VoiceOver {
  private prev: number | null = null;
  private current: TextLayer | null = null;

  constructor(private readonly deps: VoiceDeps) {}

  /** Playback starts or the playhead moves: speak nothing until text newly arrives. */
  arm(time: number): void {
    this.halt();
    this.prev = time;
  }

  /** Called as the playhead moves, with the edit's text and the length of the edit. */
  update(now: number, layers: readonly TextLayer[], length: number): void {
    const prev = this.prev;
    this.prev = now;
    if (prev === null || now < prev || now - prev > JUMP) {
      this.halt();
      return;
    }
    const due = layers
      .filter((l) => l.text.trim() !== '' && (l.start ?? 0) > prev && (l.start ?? 0) <= now)
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
      .pop();
    if (due) {
      this.current = due;
      this.deps.duck(true);
      this.deps.speak(due.text, () => {
        if (this.current === due) {
          this.current = null;
          this.deps.duck(false);
        }
      });
      return;
    }
    if (this.current && now >= (this.current.end ?? length)) this.halt();
  }

  /** Stops speaking and brings the original sound back. */
  halt(): void {
    if (!this.current) return;
    this.current = null;
    this.deps.stop();
    this.deps.duck(false);
  }
}
