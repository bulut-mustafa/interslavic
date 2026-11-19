/**
 * Works out the full-form index once and saves it, so the server can load it at
 * start instead of building it (see full-forms-cache.ts). Run by the container
 * build; locally: npm run lexicon:index
 */
import path from 'node:path';
import { computeFullFormData } from '../src/full-forms.ts';
import { stampFor, writeIndexCache } from '../src/full-forms-cache.ts';
import { Lexicon } from '../src/reader.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
export const WORDS = path.join(ROOT, 'packages/lexicon/data/raw/words.tsv');
export const CACHE = path.join(ROOT, 'packages/lexicon/data/built/fullforms.bin');

const t = Date.now();
const lex = Lexicon.fromTsv(WORDS);
const data = computeFullFormData(lex);
const bytes = writeIndexCache(CACHE, data, stampFor(ROOT, WORDS));
process.stdout.write(`full-form index: ${data.index.size} forms saved to ${path.relative(ROOT, CACHE)} (${Math.round(bytes / 1048576)} MB) in ${Math.round((Date.now() - t) / 1000)}s\n`);
