import fs from 'node:fs';
import path from 'node:path';

/**
 * Whole-sentence formulas the dictionary lacks ("How are you?"), each with a
 * cited source - see data/formulas.json. Keyed by the English sentence in
 * lower case, without its final punctuation.
 */
export interface Formula {
  isv: string;
  source: string;
  quote: string;
}

let cache: Record<string, Formula> | null = null;

export function formulaFor(english: string): Formula | undefined {
  cache ??= (JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../data/formulas.json'), 'utf8')) as {
    formulas: Record<string, Formula>;
  }).formulas;
  return cache[english.toLowerCase().replace(/[’]/g, "'").trim()];
}
