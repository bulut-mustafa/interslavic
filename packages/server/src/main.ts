import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Lexicon } from '../../lexicon/src/reader.ts';
import { buildFullFormIndex, type FullFormIndex } from '../../lexicon/src/full-forms.ts';
import { translate, type Translation } from '../../engine/src/pipeline.ts';
import {
  DEFAULT_PARSER_URL,
  parseText,
  parserHealthy,
} from '../../engine/src/source/parse-client.ts';
import type { Orthography } from '../../morph/src/orthography.ts';
import { ENABLED_LANGS, isSourceLang, type SourceLang } from '../../types/index.ts';

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
 * Exists mainly so the lexicon and the full-form index are built ONCE at boot
 * rather than per request: loading the dictionary takes ~140ms and indexing
 * 286k forms takes ~2.8s, which is fine at startup and unacceptable per
 * keystroke.
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

const ORTHOGRAPHIES = new Set<Orthography>(['standard', 'etymological', 'simplified', 'cyrillic']);

interface Ready {
  lex: Lexicon;
  validator: FullFormIndex;
}

let ready: Ready | null = null;

function boot(): Ready {
  if (ready) return ready;
  const t0 = Date.now();
  const lex = Lexicon.fromTsv(path.join(ROOT, 'packages/lexicon/data/raw/words.tsv'));
  const loaded = Date.now();
  const validator = buildFullFormIndex(lex);
  process.stdout.write(
    `lexicon: ${lex.entries.length} entries in ${loaded - t0}ms · ` +
      `full-form index: ${validator.size} forms in ${Date.now() - loaded}ms\n`,
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

        const { lex, validator } = boot();
        const parsed = await parseText(text, lang, { url: PARSER_URL });
        const sentences: Translation[] = parsed.map((s) =>
          translate(s, lex, { orthography, validator }),
        );
        json(res, 200, { sentences });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // A missing parser is the common case and deserves a clear instruction
        // rather than a generic 500.
        const isParser = message.includes('parser service');
        json(res, isParser ? 503 : 400, { error: message });
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
