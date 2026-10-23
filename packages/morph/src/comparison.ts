import { derive } from '@interslavic/morphology';

/**
 * Comparatives and superlatives.
 *
 * The engine never read UD's `Degree` at all, so "bigger" and "biggest" both
 * came out as the plain positive - the comparison was simply dropped from the
 * translation. The library has always provided the forms; `derive()` was never
 * called from anywhere in this repo.
 *
 * The adjectives page gives the rules:
 *
 *   "The basic comparative ending for adjectives -ějši (-ejši after a soft
 *    consonant), replacing the ending -y/-i: bogaty > bogatějši [...]
 *    Seven adjectives have an irregular comparative: dobry > lěpši or lučši,
 *    zly > gorši, veliky > večši or bolši, maly > menši, blagy > unši,
 *    legky > legši, mekky > mekši [...]
 *    The superlative is formed by adding the prefix naj- to the comparative:
 *    najnovějši (adj.), najnověje (adv.)."
 *
 * Source: http://steen.free.fr/interslavic/adjectives.html
 *
 * `derive()` reproduces all of this, including the irregulars and the
 * adverbial forms (`dobro` > `lěpje`/`lučše`), so no table is authored here.
 */

export type Degree = 'Cmp' | 'Sup';

/**
 * The comparative or superlative lemma for a positive adjective or adverb, or
 * null when the library offers none. The result is itself a lemma and still
 * has to be inflected to agree with its noun.
 */
export function compared(lemma: string, xpos: string, degree: Degree): string | null {
  let tokens;
  try {
    tokens = derive({ form: lemma, xpos } as never) as { form: string; feats?: Record<string, string> }[];
  } catch {
    return null;
  }
  if (!Array.isArray(tokens)) return null;

  const formsOf = (d: Degree) =>
    tokens.filter((t) => t.feats?.['Degree'] === d).map((t) => t.form).filter(Boolean);

  const comparatives = formsOf('Cmp');
  if (degree === 'Cmp') return comparatives[0] ?? null;

  const superlatives = formsOf('Sup');
  if (superlatives.length === 0) return null;

  /**
   * Prefer naj- + COMPARATIVE, which is the page's rule. `derive()` also offers
   * naj- + positive (`najdobry`, `najnovy`), which the page allows only "as a
   * means of simplification [...] which is how superlatives are made in
   * Bulgarian and Macedonian" - a fallback, not the default.
   */
  const fromComparative = comparatives
    .map((c) => `naj${c}`)
    .find((candidate) => superlatives.includes(candidate));

  return fromComparative ?? superlatives[0] ?? null;
}
