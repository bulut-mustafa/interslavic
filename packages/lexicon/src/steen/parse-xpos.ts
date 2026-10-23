import type { Aspect, Gender } from '../../../types/index.ts';

/** Structured reading of the dictionary's `partOfSpeech` notation, e.g. "v.tr. ipf.". */
export interface PosInfo {
  raw: string;
  upos: string;
  /** The xpos string the morphology library expects back. */
  xpos: string;
  gender?: Gender;
  animate?: boolean;
  aspect?: Aspect;
  transitive?: boolean;
  /** Explicitly marked `v.intr.`; absent is not the same as intransitive. */
  intransitive?: boolean;
  /**
   * Pronoun subtype, lower-cased to match UD's `PronType`: int, dem, prs,
   * poss, rel, indef, refl, rec. The dictionary marks these and nothing read
   * them.
   */
  pronType?: string;
  reflexive?: boolean;
  numberOnly?: 'Sing' | 'Plur';
  indeclinable?: boolean;
}

export function parseXpos(raw: string): PosInfo | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const has = (t: string) => s.includes(t);

  // Verbs ------------------------------------------------------------------
  if (s.startsWith('v.')) {
    // Biaspectual verbs carry both markers; they get NO Aspect feature, which
    // matches how the morphology library models them.
    const ipf = /\bipf\./.test(s);
    const pf = /\bpf\./.test(s);
    const aspect: Aspect | undefined = ipf && pf ? undefined : ipf ? 'Imp' : pf ? 'Perf' : undefined;
    return {
      raw: s,
      upos: 'VERB',
      xpos: s,
      ...(aspect ? { aspect } : {}),
      transitive: has('tr.') && !has('intr.'),
      /**
       * Explicitly marked `v.intr.`, which is NOT the same as `transitive:
       * false`: that is also true for `v.refl.` and for the 78 verbs marked
       * only `v.ipf.`/`v.pf.` with no transitivity at all. Sense selection
       * needs the three-way distinction, because only a stated mismatch is
       * evidence - silence is not.
       *
       * Safe as a plain test: no entry combines the two markers. The `/` in
       * the notation separates ASPECTS ("v.tr. ipf./pf."), never transitivity.
       */
      intransitive: has('intr.'),
      reflexive: has('refl.'),
    };
  }

  // Nouns ------------------------------------------------------------------
  const gender: Gender | undefined = /^m\./.test(s)
    ? 'Masc'
    : /^f\./.test(s)
      ? 'Fem'
      : /^n\./.test(s)
        ? 'Neut'
        : undefined;
  if (gender) {
    return {
      raw: s,
      upos: 'NOUN',
      xpos: s,
      gender,
      animate: has('anim.'),
      ...(has('.pl.')
        ? { numberOnly: 'Plur' as const }
        : has('.sg.')
          ? { numberOnly: 'Sing' as const }
          : {}),
      indeclinable: has('indecl.'),
    };
  }

  if (s.startsWith('adj.')) return { raw: s, upos: 'ADJ', xpos: s };
  if (s.startsWith('adv')) return { raw: s, upos: 'ADV', xpos: s, indeclinable: true };
  if (s.startsWith('num.')) return { raw: s, upos: 'NUM', xpos: s };
  if (s.startsWith('pron')) {
    /**
     * `pron.int.` -> "int", matching UD's `PronType=Int`. The dictionary has
     * indef 31, pers 30, poss 18, dem 11, int 5, refl 4, rel 3, rec 1, and
     * nothing read any of them.
     */
    const sub = s.match(/^pron\.([a-z]+)\./)?.[1];
    return { raw: s, upos: 'PRON', xpos: s, ...(sub ? { pronType: sub } : {}) };
  }
  if (s.startsWith('prep.')) return { raw: s, upos: 'ADP', xpos: s, indeclinable: true };
  if (s.startsWith('conj.')) return { raw: s, upos: 'CCONJ', xpos: s, indeclinable: true };
  if (s.startsWith('intj.')) return { raw: s, upos: 'INTJ', xpos: s, indeclinable: true };
  return { raw: s, upos: 'X', xpos: s, indeclinable: true };
}
