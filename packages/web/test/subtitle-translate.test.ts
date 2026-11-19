import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSrt } from '../src/subtitles/srt.ts';
import { batches, buildSrt, translateCues } from '../src/subtitles/translate.ts';

afterEach(() => vi.unstubAllGlobals());

const file = parseSrt(`1
00:00:01,000 --> 00:00:02,000
Hello there.

2
00:00:03,000 --> 00:00:04,000
♪ ♪

3
00:00:05,000 --> 00:00:06,000
- Where?
- Home.
`);

/** A server that upper-cases each line and flags the one that says "Home". */
const fakeServer = (calls: string[][] = []) =>
  vi.fn(async (_url: string, init: { body: string }) => {
    const { lines } = JSON.parse(init.body) as { lines: string[] };
    calls.push(lines);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: lines.map((l) => ({ text: l.toUpperCase(), flagged: l === 'Home.', reasons: l === 'Home.' ? ['guessed aspect of Home'] : [] })),
      }),
    };
  });

describe('translateCues', () => {
  it('sends only the text that needs translating, never music or markup', async () => {
    const calls: string[][] = [];
    vi.stubGlobal('fetch', fakeServer(calls));
    await translateCues(file, { lang: 'en', script: 'standard' });
    expect(calls).toEqual([['Hello there.', 'Where?', 'Home.']]);
  });

  it('puts each translation back in its own cue, keeping dialogue dashes and music cues', async () => {
    vi.stubGlobal('fetch', fakeServer());
    const results = await translateCues(file, { lang: 'en', script: 'standard' });
    expect(results.map((r) => r.lines)).toEqual([['HELLO THERE.'], ['♪ ♪'], ['- WHERE?', '- HOME.']]);
  });

  it('carries the server\'s reasons to the cue they belong to', async () => {
    vi.stubGlobal('fetch', fakeServer());
    const results = await translateCues(file, { lang: 'en', script: 'standard' });
    expect(results.map((r) => r.flagged)).toEqual([false, false, true]);
    expect(results[2]!.reasons).toEqual(['guessed aspect of Home']);
  });

  it('reports progress', async () => {
    vi.stubGlobal('fetch', fakeServer());
    const seen: [number, number][] = [];
    await translateCues(file, { lang: 'en', script: 'standard', onProgress: (d, t) => seen.push([d, t]) });
    expect(seen[0]).toEqual([0, 3]);
    expect(seen.at(-1)).toEqual([3, 3]);
  });

  it('retries a busy server, then succeeds', async () => {
    let n = 0;
    const ok = fakeServer();
    vi.stubGlobal('fetch', vi.fn(async (u: string, init: { body: string }) => (n++ < 2 ? { ok: false, status: 429, json: async () => ({ error: 'busy' }) } : ok(u, init))));
    const results = await translateCues(file, { lang: 'en', script: 'standard', retryDelayMs: 1 });
    expect(n).toBe(3);
    expect(results[0]!.lines).toEqual(['HELLO THERE.']);
  });

  it('retries a gateway timeout whose body is not JSON, as when the service is still starting', async () => {
    let n = 0;
    const ok = fakeServer();
    vi.stubGlobal('fetch', vi.fn(async (u: string, init: { body: string }) =>
      n++ < 2 ? { ok: false, status: 504, json: async () => { throw new SyntaxError('Unexpected token <'); } } : ok(u, init)));
    const results = await translateCues(file, { lang: 'en', script: 'standard', retryDelayMs: 1 });
    expect(n).toBe(3);
    expect(results[0]!.lines).toEqual(['HELLO THERE.']);
  });

  it('gives up with a plain message when the service never answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 504, json: async () => { throw new SyntaxError('x'); } })));
    await expect(translateCues(file, { lang: 'en', script: 'standard', retryDelayMs: 1 })).rejects.toThrow('not answering');
  });

  it('does not show the server\'s operator instructions when the parser is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: 'could not reach the parser service. Start it with: npm run parser' }) })));
    await expect(translateCues(file, { lang: 'en', script: 'standard', retryDelayMs: 1 })).rejects.toThrow(/not answering/);
  });

  it('stops on a real failure instead of returning a half-translated file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'parser down' }) })));
    await expect(translateCues(file, { lang: 'en', script: 'standard' })).rejects.toThrow('parser down');
  });

  it('refuses an answer with the wrong number of lines', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) })));
    await expect(translateCues(file, { lang: 'en', script: 'standard' })).rejects.toThrow('incomplete');
  });

  it('leaves a line over the server\'s limit in its own language and flags it', async () => {
    vi.stubGlobal('fetch', fakeServer());
    const long = parseSrt(`1\n00:00:01,000 --> 00:00:02,000\n${'word '.repeat(120)}\n`);
    const [r] = await translateCues(long, { lang: 'en', script: 'standard' });
    expect(r!.flagged).toBe(true);
    expect(r!.lines[0]).toBe('word '.repeat(120).trim());
  });

  it('can be cancelled', async () => {
    const ctl = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async () => { ctl.abort(); throw new DOMException('aborted', 'AbortError'); }));
    await expect(translateCues(file, { lang: 'en', script: 'standard', signal: ctl.signal })).rejects.toThrow();
  });
});

describe('translateCues with repeated lines', () => {
  const repeated = parseSrt(`1
00:00:01,000 --> 00:00:02,000
Yes.

2
00:00:03,000 --> 00:00:04,000
Home.

3
00:00:05,000 --> 00:00:06,000
Yes.

4
00:00:07,000 --> 00:00:08,000
- Yes.
- Home.
`);

  it('sends a line that repeats only once, and fills in every place it appears', async () => {
    const calls: string[][] = [];
    vi.stubGlobal('fetch', fakeServer(calls));
    const out = await translateCues(repeated, { lang: 'en', script: 'standard' });
    expect(calls).toEqual([['Yes.', 'Home.']]); // two distinct lines for five
    expect(out.map((r) => r.lines)).toEqual([['YES.'], ['HOME.'], ['YES.'], ['- YES.', '- HOME.']]);
  });

  it('gives each cue the server\'s doubt about a repeated line, not just the first', async () => {
    vi.stubGlobal('fetch', fakeServer());
    const out = await translateCues(repeated, { lang: 'en', script: 'standard' });
    expect(out.map((r) => r.flagged)).toEqual([false, true, false, true]);
    expect(out[1]!.reasons).toEqual(['guessed aspect of Home']);
    expect(out[3]!.reasons).toEqual(['guessed aspect of Home']);
  });

  it('still counts progress in lines of the file, ending at the total', async () => {
    vi.stubGlobal('fetch', fakeServer());
    const seen: [number, number][] = [];
    await translateCues(repeated, { lang: 'en', script: 'standard', onProgress: (d, t) => seen.push([d, t]) });
    expect(seen[0]).toEqual([0, 5]); // five lines of text in the file, although only two distinct ones are sent
    expect(seen.at(-1)).toEqual([5, 5]);
  });
});

describe('batches', () => {
  const unit = (n: number, len = 10) => ({ cue: n, slot: 0, text: 'x'.repeat(len) });
  it('never exceeds the server\'s line or character limits', () => {
    const many = Array.from({ length: 130 }, (_, i) => unit(i));
    expect(batches(many).every((b) => b.length <= 50)).toBe(true);
    const wide = Array.from({ length: 20 }, (_, i) => unit(i, 400));
    for (const b of batches(wide)) expect(b.reduce((n, u) => n + u.text.length, 0)).toBeLessThanOrEqual(5000);
  });
  it('keeps every unit exactly once, in order', () => {
    const many = Array.from({ length: 130 }, (_, i) => unit(i));
    expect(batches(many).flat().map((u) => u.cue)).toEqual(many.map((u) => u.cue));
  });
});

describe('buildSrt', () => {
  const results = [
    { lines: ['ALO TAM.'], flagged: false, reasons: [] },
    { lines: ['♪ ♪'], flagged: false, reasons: [] },
    { lines: ['- KDE?', '- DOMOV.'], flagged: false, reasons: [] },
  ];
  it('writes Interslavic alone, with the original timing', () => {
    const out = buildSrt(file, results, 'isv');
    expect(out).toContain('00:00:01,000 --> 00:00:02,000\nALO TAM.');
    expect(parseSrt(out)).toHaveLength(3);
  });
  it('writes the original beneath the Interslavic in the bilingual file', () => {
    const out = buildSrt(file, results, 'bilingual');
    expect(out).toContain('ALO TAM.\nHello there.');
    expect(out).toContain('- KDE?\n- DOMOV.\n- Where?\n- Home.');
    expect(out.match(/♪ ♪/g)).toHaveLength(1); // a music cue is not doubled
  });
});
