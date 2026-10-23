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
        const lang = body.lang === 'ru' ? 'ru' : 'en';
        const orthography: Orthography = ORTHOGRAPHIES.has(body.orthography as Orthography)
          ? (body.orthography as Orthography)
          : 'standard';

        if (!text) {
          json(res, 200, { sentences: [] });
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

  json(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
});

boot();
server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`engine listening on http://127.0.0.1:${PORT}\n`);
  process.stdout.write(`parser expected at ${PARSER_URL}\n`);
});
