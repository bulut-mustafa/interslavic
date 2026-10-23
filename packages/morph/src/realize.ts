import { inflect } from '@interslavic/morphology';
import { splitMultiword } from '../../lexicon/src/steen/split-lemmas.ts';

/**
 * `inflect()` returns an ENTIRE paradigm, not one form - inflect('zena') gives
 * 14 tokens. So the wrapper's real job is selecting the right form by feature
 * matching, which is where syncretism and variant forms have to be resolved.
 */

export interface MorphToken {
  form: string;
  lemma: string;
  upos: string;
  xpos: string;
  feats?: Record<string, string>;
}

export interface RealizeRequest {
  lemma: string;
  xpos: string;
  feats: Record<string, string>;
  /** Extra forms from the dictionary's `addition` column, e.g. present stems. */
  principalParts?: string[][];
}

export type RealizeResult =
  | { ok: true; form: string; matched: Record<string, string>; ambiguous: string[] }
  | { ok: false; reason: string; available: number };

/**
 * Several forms can occupy the same feature slot, and a generator must commit
 * to one. Surveying the lexicon, exactly three competitions occur:
 *
 *   Long + Short    (1320 slots)  davaje / dava   -> prefer Long
 *   - + Athematic   ( 826 slots)                  -> prefer the unmarked form
 *   - + Short       ( 382 slots)  jest / je       -> prefer the unmarked form
 *
 * So the order is: unmarked, then Long, then Athematic, then Short. The
 * unmarked form must come FIRST - preferring Short over it returns "je" where
 * the dictionary's own principal parts for byti say "jest".
 *
 * `undefined` means "this token carries no Variant feature at all".
 */
const VARIANT_PREFERENCE: (string | undefined)[] = [undefined, 'Long', 'Athematic', 'Short'];

export function paradigm(lemma: string, xpos: string, principalParts?: string[][]): MorphToken[] {
  const { head } = splitMultiword(lemma, xpos.startsWith('v.') ? 'VERB' : undefined);
  // The library accepts an array of forms to pin down irregular stems.
  const flat = (principalParts ?? []).flat();
  const arg =
    flat.length > 0
      ? [{ form: head, xpos }, ...flat.map((f) => ({ form: f }))]
      : { form: head, xpos };
  try {
    const res = inflect(arg as never);
    return Array.isArray(res) ? (res as MorphToken[]) : [];
  } catch {
    return [];
  }
}

/**
 * Choose one token from a paradigm, given the requested features.
 *
 * Exported and kept pure so the tie-breaking path is directly testable. With
 * the current lexicon, variant preference already resolves every one of the
 * 66,697 feature slots to a single form, so the final tie-break never fires in
 * production - it is insurance against the library introducing a new Variant
 * value, and it is verified here with synthetic input rather than left as
 * untested dead code.
 */
export function selectForm(
  tokens: MorphToken[],
  want: Record<string, string>,
  /**
   * Forms the DICTIONARY names for this word, from its `addition` column.
   * Word-specific facts are the dictionary's to state, so a form it publishes
   * outranks the variant preference below: it gives "mati (matere)", and the
   * no-Variant `materi` was winning the genitive singular. Both are correct -
   * the nouns page offers the regular declension as an alternative to the
   * athematic one - but the published form is the one the author chose.
   */
  preferred?: readonly string[],
): { chosen: MorphToken; alternatives: string[] } | null {
  const matching = (features: Record<string, string>) => {
    const wanted = Object.entries(features);
    return tokens.filter((t) => wanted.every(([k, v]) => t.feats?.[k] === v));
  };

  let hits = matching(want);

  /**
   * Plurale tantum nouns - dveri "door", usta "mouth", nožnicy "scissors" -
   * are tagged `Number=Ptan`, which matches neither Sing nor Plur. Such a
   * lexeme has no number to choose between, so a requested Number is not a
   * constraint it can fail; asking for one used to return nothing at all and
   * drop 155 entries back to their citation form in every case.
   */
  if (hits.length === 0 && 'Number' in want && tokens.some((t) => t.feats?.['Number'] === 'Ptan')) {
    const { Number: _pluraleTantumHasNoNumber, ...rest } = want;
    hits = matching(rest);
  }

  /**
   * A feature the lexeme does not distinguish cannot select among its forms.
   * The reflexive `sebe` has no Number at all - one form serves singular and
   * plural - so requesting Number matched nothing and realisation fell back to
   * the citation form, which looked plausible and was not a decision.
   *
   * Only keys absent from EVERY token are dropped, so a genuine mismatch on a
   * feature the paradigm does use still fails loudly.
   */
  if (hits.length === 0) {
    const distinguished = Object.fromEntries(
      Object.entries(want).filter(([k]) => tokens.some((t) => t.feats?.[k] !== undefined)),
    );
    if (Object.keys(distinguished).length < Object.keys(want).length) {
      hits = matching(distinguished);
    }
  }

  if (hits.length === 0) return null;

  if (hits.length > 1 && preferred && preferred.length > 0) {
    const published = hits.filter((t) => preferred.includes(t.form));
    if (published.length > 0) hits = published;
  }

  // Collapse variants deterministically rather than picking arbitrarily.
  if (hits.length > 1) {
    for (const pref of VARIANT_PREFERENCE) {
      const narrowed = hits.filter((t) => t.feats?.['Variant'] === pref);
      if (narrowed.length > 0) {
        hits = narrowed;
        break;
      }
    }
  }

  // Any remaining tie gets a stable, explicit rule: prefer the longer (fuller)
  // form, then alphabetical order, so output never depends on library ordering.
  if (hits.length > 1) {
    hits = [...hits].sort((a, b) =>
      a.form.length !== b.form.length ? b.form.length - a.form.length : a.form.localeCompare(b.form),
    );
  }

  const chosen = hits[0]!;
  return {
    chosen,
    alternatives: [...new Set(hits.map((t) => t.form))].filter((f) => f !== chosen.form),
  };
}

export function realize(req: RealizeRequest): RealizeResult {
  const toks = paradigm(req.lemma, req.xpos, req.principalParts);
  if (toks.length === 0) {
    return { ok: false, reason: 'no paradigm returned', available: 0 };
  }

  const picked = selectForm(toks, req.feats, (req.principalParts ?? []).flat());
  if (!picked) {
    return {
      ok: false,
      reason: `no form matches ${JSON.stringify(req.feats)}`,
      available: toks.length,
    };
  }

  const { before, after, isMultiword } = splitMultiword(
    req.lemma,
    req.xpos.startsWith('v.') ? 'VERB' : undefined,
  );
  const form = isMultiword
    ? [before, picked.chosen.form, after].filter(Boolean).join(' ')
    : picked.chosen.form;

  /**
   * The morphology library signals that it could not build a form by returning
   * one containing "ERROR" - "ERROR2ų", "ERROR2ti" - rather than by throwing.
   * Accepting that as a successful realisation put it straight into the
   * translation. A stem it cannot handle is a failure, so it is reported as
   * one and the caller falls back to the citation form.
   */
  if (/ERROR/.test(form)) {
    return { ok: false, reason: `the morphology library could not build this form (${form})`, available: toks.length };
  }

  return {
    ok: true,
    form,
    matched: picked.chosen.feats ?? {},
    ambiguous: picked.alternatives,
  };
}
