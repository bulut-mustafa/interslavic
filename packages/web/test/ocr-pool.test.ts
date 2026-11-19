import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOcrPool, type TesseractLike, type WorkerLike } from '../src/photo/ocr.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A stand-in for tesseract.js that counts what is made and shut down, and reports progress through the logger it was given. */
function fake() {
  const log = { created: [] as string[], terminated: 0, jobs: 0, loads: 0 };
  let fail = false;
  const t: TesseractLike = {
    createWorker: async (lang, _oem, { logger }) => {
      log.created.push(lang);
      const w: WorkerLike = {
        recognize: async () => {
          log.jobs++;
          logger({ progress: 0.5, status: 'recognizing' });
          if (fail) throw new Error('engine fell over');
          return { data: { text: 'hi', confidence: 90, blocks: [] } };
        },
        terminate: async () => {
          log.terminated++;
        },
      };
      return w;
    },
  };
  return { log, t, load: async () => (log.loads++, t), failNext: () => (fail = true), ok: () => (fail = false) };
}
const image = new Blob(['x']);
const convert = (d: { text: string; confidence: number }) => ({ text: d.text, confidence: d.confidence, lines: [] });

describe('the OCR pool', () => {
  it('makes one worker and reuses it for every picture', async () => {
    const f = fake();
    const pool = createOcrPool(f.load, convert);
    await pool.recognize(image, 'en', () => {});
    await pool.recognize(image, 'en', () => {});
    await pool.recognize(image, 'en', () => {});
    expect(f.log.created).toEqual(['eng']);
    expect(f.log.jobs).toBe(3);
    expect(f.log.loads).toBe(1);
  });

  it('can be warmed up before the first picture, and then the picture does not make a second worker', async () => {
    const f = fake();
    const pool = createOcrPool(f.load, convert);
    pool.warm!('en');
    await vi.advanceTimersByTimeAsync(10);
    expect(f.log.created).toEqual(['eng']); // ready already
    await pool.recognize(image, 'en', () => {});
    expect(f.log.created).toEqual(['eng']);
  });

  it('tells each picture its own progress', async () => {
    const f = fake();
    const pool = createOcrPool(f.load, convert);
    const a: number[] = [];
    const b: number[] = [];
    await pool.recognize(image, 'en', (p) => a.push(p));
    await pool.recognize(image, 'en', (p) => b.push(p));
    expect(a).toEqual([0.5]);
    expect(b).toEqual([0.5]);
  });

  it('reads pictures given together one after another, not at once', async () => {
    const f = fake();
    const order: string[] = [];
    const t: TesseractLike = {
      createWorker: async () => ({
        recognize: async () => {
          order.push('start');
          await new Promise((r) => setTimeout(r, 10));
          order.push('end');
          return { data: { text: '', confidence: 0 } };
        },
        terminate: async () => {},
      }),
    };
    const pool = createOcrPool(async () => t, convert);
    const all = Promise.all([pool.recognize(image, 'en', () => {}), pool.recognize(image, 'en', () => {}), pool.recognize(image, 'en', () => {})]);
    await vi.advanceTimersByTimeAsync(100);
    await all;
    expect(order).toEqual(['start', 'end', 'start', 'end', 'start', 'end']);
    expect(f.log.created).toEqual([]);
  });

  it('shuts the worker down after a quiet spell, and makes a new one when it is needed again', async () => {
    const f = fake();
    const pool = createOcrPool(f.load, convert, { idleMs: 1000 });
    await pool.recognize(image, 'en', () => {});
    await vi.advanceTimersByTimeAsync(999);
    expect(f.log.terminated).toBe(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(f.log.terminated).toBe(1); // its memory is given back
    await pool.recognize(image, 'en', () => {});
    expect(f.log.created).toEqual(['eng', 'eng']);
  });

  it('is not shut down while it is working', async () => {
    const f = fake();
    const pool = createOcrPool(f.load, convert, { idleMs: 1000 });
    await pool.recognize(image, 'en', () => {});
    await vi.advanceTimersByTimeAsync(900);
    await pool.recognize(image, 'en', () => {}); // the quiet spell starts again from here
    await vi.advanceTimersByTimeAsync(900);
    expect(f.log.terminated).toBe(0);
  });

  it('replaces the worker after a number of pictures, because its memory only grows', async () => {
    const f = fake();
    const pool = createOcrPool(f.load, convert, { maxJobs: 3 });
    for (let i = 0; i < 4; i++) await pool.recognize(image, 'en', () => {});
    expect(f.log.created).toEqual(['eng', 'eng']);
    expect(f.log.terminated).toBe(1);
  });

  it('uses a different worker for a different language, and lets the old one go', async () => {
    const f = fake();
    const pool = createOcrPool(f.load, convert);
    await pool.recognize(image, 'en', () => {});
    await pool.recognize(image, 'ru', () => {});
    expect(f.log.created).toEqual(['eng', 'rus']);
    expect(f.log.terminated).toBe(1);
  });

  it('does not trust a worker after a failure: it is shut down and the next picture gets a new one', async () => {
    const f = fake();
    const pool = createOcrPool(f.load, convert);
    await pool.recognize(image, 'en', () => {});
    f.failNext();
    await expect(pool.recognize(image, 'en', () => {})).rejects.toThrow('engine fell over');
    expect(f.log.terminated).toBe(1);
    f.ok();
    await pool.recognize(image, 'en', () => {});
    expect(f.log.created).toEqual(['eng', 'eng']);
  });

  it('tries afresh when the engine could not be fetched', async () => {
    let tries = 0;
    const f = fake();
    const pool = createOcrPool(async () => {
      if (tries++ === 0) throw new Error('offline');
      return f.t;
    }, convert);
    await expect(pool.recognize(image, 'en', () => {})).rejects.toThrow('offline');
    await pool.recognize(image, 'en', () => {});
    expect(f.log.created).toEqual(['eng']);
  });
});
