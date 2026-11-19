import fs from 'node:fs';
import { toStandard } from '../../morph/src/orthography.ts';
import { stripMetachars } from './steen/metacharacters.ts';
import { splitLemmas } from './steen/split-lemmas.ts';

/**
 * A word in the other Slavic languages, straight from the dictionary's own
 * columns - not translated, not guessed. Used to look up a word to put into a
 * text in a language this site cannot translate into.
 */

export const SLAVIC_COLUMNS = ['ru', 'be', 'uk', 'pl', 'cs', 'sk', 'sl', 'hr', 'sr', 'mk', 'bg'] as const;
export type SlavicColumn = (typeof SLAVIC_COLUMNS)[number];

export const LANGUAGE_NAMES: Record<SlavicColumn, string> = {
  ru: 'Russian', be: 'Belarusian', uk: 'Ukrainian', pl: 'Polish', cs: 'Czech', sk: 'Slovak',
  sl: 'Slovenian', hr: 'Croatian', sr: 'Serbian', mk: 'Macedonian', bg: 'Bulgarian',
};

export interface Cognate {
  /** The dictionary's words for it, in the language's own spelling, most usual first. */
  words: string[];
  /** The dictionary marks this cell with "!", which its documentation does not explain. */
  unconfirmed: boolean;
}

export interface CognateEntry {
  isv: string;
  pos: string;
  en: string;
  languages: Partial<Record<SlavicColumn, Cognate>>;
}

export interface CognateIndex {
  size: number;
  lookup(query: string, limit?: number): CognateEntry[];
}

interface Row extends CognateEntry {
  lemmas: string[];
  glosses: string[];
  frequency: number;
}

const norm = (s: string): string => toStandard(s.trim().toLowerCase());

/** A cell's words: split at commas and semicolons outside brackets; notes in brackets are kept with their word. */
const words = (cell: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of cell) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

const glossesOf = (en: string): string[] => words(en).map((g) => norm(g.replace(/\s*\([^)]*\)/g, '')));

export function buildCognateIndex(tsvPath: string): CognateIndex {
  const lines = fs.readFileSync(tsvPath, 'utf8').split('\n');
  const header = (lines[0] ?? '').split('\t');
  const col = (n: string) => header.indexOf(n);
  const [cIsv, cPos, cEn, cFreq] = [col('isv'), col('partOfSpeech'), col('en'), col('frequency')];
  const rows: Row[] = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const f = line.split('\t');
    const head = stripMetachars(f[cIsv] ?? '');
    const lemmas = splitLemmas(head.text);
    if (lemmas.length === 0) continue;
    const languages: CognateEntry['languages'] = {};
    for (const l of SLAVIC_COLUMNS) {
      const raw = (f[col(l)] ?? '').trim();
      if (!raw) continue;
      const unconfirmed = raw.startsWith('!');
      const w = words(unconfirmed ? raw.replace(/^!+/, '') : raw);
      if (w.length > 0) languages[l] = { words: w, unconfirmed };
    }
    if (Object.keys(languages).length === 0) continue;
    rows.push({
      isv: lemmas.join(', '),
      pos: (f[cPos] ?? '').trim(),
      en: (f[cEn] ?? '').trim(),
      languages,
      lemmas: lemmas.map(norm),
      glosses: glossesOf(f[cEn] ?? ''),
      frequency: Number(f[cFreq]) || 0,
    });
  }

  return {
    size: rows.length,
    lookup(query, limit = 8) {
      const q = norm(query);
      if (q.length < 2) return [];
      const scored: { r: Row; score: number }[] = [];
      for (const r of rows) {
        const score = r.lemmas.includes(q) ? 3 : r.glosses.includes(q) ? 2 : r.lemmas.some((l) => l.startsWith(q)) ? 1 : 0;
        if (score > 0) scored.push({ r, score });
      }
      scored.sort((a, b) => b.score - a.score || b.r.frequency - a.r.frequency || a.r.isv.localeCompare(b.r.isv));
      return scored.slice(0, limit).map(({ r: { isv, pos, en, languages } }) => ({ isv, pos, en, languages }));
    },
  };
}
