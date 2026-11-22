import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { type FullFormIndex } from '../../lexicon/src/full-forms.ts';
import { loadFullFormIndex } from '../../lexicon/src/full-forms-cache.ts';
import { analyzeText } from '../../lexicon/src/analyze.ts';
import { checkBatch, translateLines } from './batch.ts';
import { buildCognateIndex, type CognateIndex } from '../../lexicon/src/cognates.ts';
import { translate, type Translation } from '../../engine/src/pipeline.ts';
import {
  DEFAULT_PARSER_URL,
  ParserError,
  ParserUnavailable,
  parseText,
  parseTexts,
  parserHealthy,
} from '../../engine/src/source/parse-client.ts';
import type { Orthography } from '../../morph/src/orthography.ts';
import { ENABLED_LANGS, isSourceLang, type ParsedSentence, type SourceLang } from '../../types/index.ts';

/**
 * The languages this server translates from: the public list, plus any named
 * in EXTRA_LANGS (e.g. "uk") to test a language locally before it is enabled.
 */
const OFFERED: readonly SourceLang[] = [
  ...ENABLED_LANGS,
  ...(process.env['EXTRA_LANGS'] ?? '').split(',').map((l) => l.trim()).filter(isSourceLang),
];

/**
 * HTTP front end for the engine.
 *
 * Exists mainly so the lexicon and the full-form index are made ONCE at boot
 * rather than per request: loading the dictionary takes ~0.4s, and the index
 * (744k forms) takes ~12s to build on a laptop, or a few seconds to load when
 * the container build has saved it (see lexicon/src/full-forms-cache.ts). That
 * is fine at startup and unacceptable per keystroke.
 */

const ROOT = path.resolve(import.meta.dirname, '../../..');
const PORT = Number(process.env['PORT'] ?? 8766);
const PARSER_URL = process.env['PARSER_URL'] ?? DEFAULT_PARSER_URL;
/** 127.0.0.1 locally; a hosted container sets HOST=0.0.0.0. */
const HOST = process.env['HOST'] ?? '127.0.0.1';
/**
 * The built web app, served from the same address in production so testers
 * need one link. Unset in development, where Vite serves it.
 */
const STATIC_DIR = process.env['STATIC_DIR'];
/** Where tester reports are appended, one JSON object per line. */
const FEEDBACK_FILE = process.env['FEEDBACK_FILE'] ?? path.join(ROOT, 'data/feedback.jsonl');
/** Reading the reports back needs this token; unset, reading is disabled. */
const FEEDBACK_TOKEN = process.env['FEEDBACK_TOKEN'];
/**
 * A public page should not let one request tie up the parser: a paragraph is
 * plenty for testing a translator.
 */
const MAX_TEXT = 2000;
const MAX_FIELD = 2000;
/** Reading needs no parser, so it can take a page, not just a paragraph. */
const MAX_ANALYZE_TEXT = 10_000;

const ORTHOGRAPHIES = new Set<Orthography>(['standard', 'etymological', 'simplified', 'cyrillic']);

interface Ready {
  lex: Lexicon;
  validator: FullFormIndex;
}

let ready: Ready | null = null;
/** True while a subtitle batch is being translated. */
let batchBusy = false;
let cognates: CognateIndex | null = null;

function boot(): Ready {
  if (ready) return ready;
  const t0 = Date.now();
  const wordsPath = path.join(ROOT, 'packages/lexicon/data/raw/words.tsv');
  const lex = Lexicon.fromTsv(wordsPath);
  const loaded = Date.now();
  // Saved by the container build when there is one (a few seconds), worked out here otherwise (12 s on a laptop).
  const { index: validator, from } = loadFullFormIndex(lex, { root: ROOT, wordsPath, cacheFile: path.join(ROOT, 'packages/lexicon/data/built/fullforms.bin') });
  process.stdout.write(
    `lexicon: ${lex.entries.length} entries in ${loaded - t0}ms · ` +
      `full-form index: ${validator.size} forms ${from === 'saved' ? 'loaded' : 'built'} in ${Date.now() - loaded}ms\n`,
  );
  ready = { lex, validator };
  return ready;
}

const json = (res: http.ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    // The dev UI runs on a different port.
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
  });
  res.end(payload);
};

const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 1_000_000) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

interface TranslateBody {
  text?: unknown;
  lang?: unknown;
  orthography?: unknown;
  /** A second script to render from the same parse. */
  alternate?: unknown;
}

/**
 * A failed translation, in words a visitor can act on. Bad JSON is the
 * caller's fault (400); a dead or failing parser is ours and temporary (503);
 * anything else is an engine bug (500), logged with its stack.
 */
function fail(res: http.ServerResponse, err: unknown): void {
  if (err instanceof SyntaxError) {
    json(res, 400, { error: 'the request is not valid JSON' });
  } else if (err instanceof ParserUnavailable || err instanceof ParserError) {
    process.stderr.write(`${err.message}\n`);
    json(res, 503, { error: 'the parser is not answering; please try again in a moment' });
  } else {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    json(res, 500, { error: 'the translator failed on this text; please report it' });
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    void (async () => {
      const { lex, validator } = boot();
      json(res, 200, {
        ok: true,
        parser: await parserHealthy(PARSER_URL),
        parserUrl: PARSER_URL,
        entries: lex.entries.length,
        forms: validator.size,
      });
    })();
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/translate') {
    void (async () => {
      try {
        const body = JSON.parse(await readBody(req)) as TranslateBody;
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        const lang: SourceLang | null =
          body.lang === undefined ? 'en' : isSourceLang(body.lang) && OFFERED.includes(body.lang) ? body.lang : null;
        if (!lang) {
          json(res, 400, { error: `translation from "${String(body.lang)}" is not available yet` });
          return;
        }
        const orthography: Orthography = ORTHOGRAPHIES.has(body.orthography as Orthography)
          ? (body.orthography as Orthography)
          : 'standard';

        if (!text) {
          json(res, 200, { sentences: [] });
          return;
        }
        if (text.length > MAX_TEXT) {
          json(res, 413, { error: `please keep it under ${MAX_TEXT} characters` });
          return;
        }

        const alternate: Orthography | null = ORTHOGRAPHIES.has(body.alternate as Orthography)
          ? (body.alternate as Orthography)
          : null;

        const { lex, validator } = boot();
        // Each input line is parsed on its own (the parser reads a single
        // newline as a space and would join two lines into one sentence), all
        // in one batch.
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        const parsed: ParsedSentence[] = [];
        const breaks = new Set<number>();
        for (const sentences of await parseTexts(lines, lang, { url: PARSER_URL })) {
          parsed.push(...sentences);
          breaks.add(parsed.length - 1);
        }
        // Orthography is applied after the analysis, so one parse serves both scripts.
        const render = (o: Orthography) =>
          parsed.map((s, i): Translation & { breakAfter?: true } => {
            const t = translate(s, lex, { orthography: o, validator });
            return breaks.has(i) ? { ...t, breakAfter: true } : t;
          });
        json(res, 200, { sentences: render(orthography), ...(alternate ? { alternate: render(alternate) } : {}) });
      } catch (err) {
        fail(res, err);
      }
    })();
    return;
  }

  /**
   * A word in the other Slavic languages, from the dictionary's own columns.
   * For text in a language the translator cannot write: look a word up and use it.
   */
  if (req.method === 'GET' && url.pathname === '/api/lookup') {
    const q = (url.searchParams.get('q') ?? '').slice(0, 60);
    cognates ??= buildCognateIndex(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
    json(res, 200, { entries: cognates.lookup(q, 8) });
    return;
  }

  /**
   * Subtitles: a list of short lines, each translated on its own. Capped per
   * request, and only one batch runs at a time - the parser is a single process
   * and a whole film would otherwise tie it up for everyone else.
   */
  if (req.method === 'POST' && url.pathname === '/api/translate-batch') {
    void (async () => {
      if (batchBusy) {
        json(res, 429, { error: 'the translator is busy with another file; please retry in a moment' });
        return;
      }
      batchBusy = true;
      try {
        const body = JSON.parse(await readBody(req)) as TranslateBody & { lines?: unknown };
        const lang: SourceLang | null =
          body.lang === undefined ? 'en' : isSourceLang(body.lang) && OFFERED.includes(body.lang) ? body.lang : null;
        if (!lang) {
          json(res, 400, { error: `translation from "${String(body.lang)}" is not available yet` });
          return;
        }
        const problem = checkBatch(body.lines);
        if (problem) {
          json(res, 413, { error: problem });
          return;
        }
        const orthography: Orthography = ORTHOGRAPHIES.has(body.orthography as Orthography)
          ? (body.orthography as Orthography)
          : 'standard';
        const { lex, validator } = boot();
        const results = await translateLines(body.lines as string[], {
          parse: (text) => parseText(text, lang, { url: PARSER_URL }),
          parseMany: (texts) => parseTexts(texts, lang, { url: PARSER_URL }),
          translate: (s) => translate(s, lex, { orthography, validator }),
        });
        json(res, 200, { results });
      } catch (err) {
        fail(res, err);
      } finally {
        batchBusy = false;
      }
    })();
    return;
  }

  /**
   * Interslavic in, analysis out: for each word, whether it is a form of a
   * dictionary word and which. Pure lookup in the index built at boot - no
   * parser, no state.
   */
  if (req.method === 'POST' && url.pathname === '/api/analyze') {
    void (async () => {
      try {
        const body = JSON.parse(await readBody(req)) as { text?: unknown };
        const text = typeof body.text === 'string' ? body.text : '';
        if (text.length > MAX_ANALYZE_TEXT) {
          json(res, 413, { error: `please keep it under ${MAX_ANALYZE_TEXT} characters` });
          return;
        }
        const { lex, validator } = boot();
        json(res, 200, analyzeText(text, lex, validator));
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return;
  }

  /**
   * A tester's report: what they typed, what came out, and what is wrong.
   * Appended to a file rather than a database - one line per report is all
   * this needs, and the file is plain to read and to download.
   */
  if (req.method === 'POST' && url.pathname === '/api/feedback') {
    void (async () => {
      try {
        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
        const field = (k: string): string =>
          typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, MAX_FIELD) : '';
        const report = {
          at: new Date().toISOString(),
          lang: field('lang'),
          orthography: field('orthography'),
          source: field('source'),
          output: field('output'),
          comment: field('comment'),
          suggestion: field('suggestion'),
        };
        if (!report.source || (!report.comment && !report.suggestion)) {
          json(res, 400, { error: 'say what is wrong, or give a better translation' });
          return;
        }
        fs.mkdirSync(path.dirname(FEEDBACK_FILE), { recursive: true });
        fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(report) + '\n');
        json(res, 200, { ok: true });
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/feedback') {
    if (!FEEDBACK_TOKEN || url.searchParams.get('token') !== FEEDBACK_TOKEN) {
      json(res, 404, { error: 'not found' });
      return;
    }
    const text = fs.existsSync(FEEDBACK_FILE) ? fs.readFileSync(FEEDBACK_FILE, 'utf8') : '';
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' });
    res.end(text);
    return;
  }

  if (STATIC_DIR && req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    serveStatic(STATIC_DIR, url.pathname, res);
    return;
  }

  json(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
});

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * The built site: every page is prerendered to `<path>/index.html`
 * (packages/web/scripts/prerender.ts), so a path is served as that file, and
 * a path with no file is a real 404 - not the home page under a 200, which
 * search engines read as a duplicate of it.
 */
function serveStatic(dir: string, pathname: string, res: http.ServerResponse): void {
  const root = path.resolve(dir);
  const wanted = path.resolve(root, '.' + decodeURIComponent(pathname));
  const inside = wanted === root || wanted.startsWith(root + path.sep);
  const isFile = (f: string) => fs.existsSync(f) && fs.statSync(f).isFile();
  const found = !inside ? undefined : isFile(wanted) ? wanted : isFile(path.join(wanted, 'index.html')) ? path.join(wanted, 'index.html') : undefined;
  const notFound = path.join(root, '404.html');
  const file = found ?? (isFile(notFound) ? notFound : path.join(root, 'index.html'));
  res.writeHead(found ? 200 : 404, {
    'content-type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
    'cache-control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(file).pipe(res);
}

boot();
server.listen(PORT, HOST, () => {
  process.stdout.write(`engine listening on http://${HOST}:${PORT}\n`);
  process.stdout.write(`parser expected at ${PARSER_URL}\n`);
});
