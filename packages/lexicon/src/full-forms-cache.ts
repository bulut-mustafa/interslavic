import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { computeFullFormData, fullFormIndexFrom, internReadings, type FullFormData, type FullFormIndex } from './full-forms.ts';
import type { Lexicon } from './reader.ts';

/**
 * The full-form index, saved ahead of time. Working out every form of every
 * entry takes 12 seconds on a laptop (about 33 on the hosted server) and holds
 * 350 MB while it does, and the answer is the same on every start. So the build
 * that makes the container image works it out once and saves it; the server
 * loads the file instead, and works it out itself only if the file is missing,
 * damaged or stale.
 *
 * Stale is the dangerous case, because a wrong index would quietly certify
 * wrong words. The file therefore carries a stamp of everything the index is
 * made from - the dictionary, the code that inflects it, the library's version,
 * and the engine's own serialisation format - and is used only if the stamp
 * matches exactly.
 */

const FORMAT = 1;
const STAMP_LENGTH = 64; // a SHA-256, in hex

const sha = (...parts: (string | Buffer)[]): string => {
  const h = crypto.createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex');
};

const sourceFiles = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
        .map((e) => path.join(e.parentPath, e.name))
        .sort()
    : [];

/** A stamp of everything the index depends on. */
export function stampFor(root: string, wordsPath: string): string {
  const files = [
    wordsPath,
    path.join(root, 'packages/lexicon/src/full-forms.ts'),
    path.join(root, 'packages/lexicon/src/reader.ts'),
    path.join(root, 'node_modules/@interslavic/morphology/package.json'),
    ...sourceFiles(path.join(root, 'packages/morph/src')),
  ];
  return sha(`format ${FORMAT}\nnode-v8 ${process.versions.v8}\n`, ...files.map((f) => (fs.existsSync(f) ? sha(f.slice(root.length), fs.readFileSync(f)) : 'missing')));
}

export function writeIndexCache(file: string, data: FullFormData, stamp: string): number {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = v8.serialize(data);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(stamp, 'ascii'), body]));
  return body.length;
}

/** The saved index, or null if there is none, it is for different sources, or it cannot be read. Never throws. */
export function readIndexCache(file: string, stamp: string): FullFormData | null {
  try {
    const buf = fs.readFileSync(file);
    if (buf.subarray(0, STAMP_LENGTH).toString('ascii') !== stamp) return null;
    const data = v8.deserialize(buf.subarray(STAMP_LENGTH)) as FullFormData;
    return data.index instanceof Map && typeof data.generated === 'number' ? data : null;
  } catch {
    return null;
  }
}

export interface Loaded {
  index: FullFormIndex;
  /** Where it came from, so the start-up log can say. */
  from: 'saved' | 'built';
}

/** The index: loaded from the saved file when it is current, otherwise built, as before. */
export function loadFullFormIndex(lex: Lexicon, o: { root: string; wordsPath: string; cacheFile: string }): Loaded {
  const data = readIndexCache(o.cacheFile, stampFor(o.root, o.wordsPath));
  if (data) return { index: fullFormIndexFrom(internReadings(data)), from: 'saved' };
  return { index: fullFormIndexFrom(internReadings(computeFullFormData(lex))), from: 'built' };
}
