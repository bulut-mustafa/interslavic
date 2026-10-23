import type { Case } from '../../../types/index.ts';

/**
 * The `addition` column, verified against the live sheet: 205 entries carry a
 * NUMERIC case-government code - there are ZERO `(+gen)`-style named codes.
 *
 * Breakdown found: (+2) x90, (+3) x46, (+5) x31, (+4) x29, (+6) x9.
 */
const CASE_BY_NUMBER: Record<string, Case> = {
  '1': 'Nom',
  '2': 'Gen',
  '3': 'Dat',
  '4': 'Acc',
  '5': 'Ins',
  '6': 'Loc',
};

export interface AdditionInfo {
  /** Case this word governs on its complement, e.g. `bez (+2)` -> Gen. */
  governs?: Case;
  /**
   * Irregular principal parts, by semicolon group. The morphology library
   * accepts these directly via its array form, which is the single
   * highest-leverage integration point with the dictionary:
   *   byti (jesm, jesi, jest, jesmo, jeste, sut; byl; budu)
   */
  principalParts: string[][];
  raw: string;
}

export function parseAddition(raw: string): AdditionInfo {
  const s = (raw ?? '').trim();
  const info: AdditionInfo = { principalParts: [], raw: s };
  if (!s) return info;

  // Government code, e.g. "(+2)". May co-occur with principal parts:
  //   "podujti (podujde; podsel) (+3)"
  const gov = s.match(/\(\+(\d)\)/);
  if (gov?.[1]) {
    const c = CASE_BY_NUMBER[gov[1]];
    if (c) info.governs = c;
  }

  // Every other parenthesised group holds forms, grouped by ";".
  for (const group of s.matchAll(/\(([^)]*)\)/g)) {
    const body = (group[1] ?? '').trim();
    if (!body || /^\+\d$/.test(body)) continue;
    const parts = body
      .split(';')
      .map((seg) => seg.split(',').map((f) => f.trim()).filter(Boolean))
      .filter((seg) => seg.length > 0);
    info.principalParts.push(...parts);
  }
  return info;
}
