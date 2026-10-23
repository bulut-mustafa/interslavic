/**
 * Written as a visible escape, never as the literal character: a mutation
 * audit once found an invisible combining character sitting inside a regex
 * here, which worked only by accident (docs/verification-log.md).
 */
const SENTINEL = '\u0001';

/**
 * Split an `isv` cell into its individual lemma variants.
 *
 * Only 245 of 19,100 entries contain a comma and 4 contain brackets, so this is
 * NOT the main source of complexity - but it must be handled, because an
 * unsplit "altana, altanka" inflects to nothing.
 *
 * Parenthesised groups are stashed first so that "(a, b)" is not split on.
 */
export function splitLemmas(isv: string): string[] {
  const stash: string[] = [];
  const stashed = (isv ?? '').replace(
    /\([^)]*\)/g,
    (m) => `${SENTINEL}${stash.push(m) - 1}${SENTINEL}`,
  );

  const out: string[] = [];
  for (const part of stashed.split(/[,;]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // "do/k" lists two independent prepositions; expand each.
    for (const slashPart of trimmed.split('/')) {
      const restored = slashPart
        .replace(new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, 'g'), (_, i: string) => stash[Number(i)] ?? '')
        .trim();
      if (restored) out.push(restored);
    }
  }

  // "[ne]kto" style optional parts -> both the full and the reduced form.
  const expanded = out.flatMap((l) =>
    l.includes('[')
      ? [l.replace(/[[\]]/g, ''), l.replace(/\[[^\]]*\]/g, '')].map((s) => s.trim()).filter(Boolean)
      : [l],
  );
  return [...new Set(expanded)];
}

/** Reflexive/clitic particles that trail a multiword verb lemma. */
const TRAILING_CLITICS = new Set(['sę', 'se']);

/**
 * 1,917 entries (10%) are multiword and `inflect()` is single-word-only, so the
 * caller must know which word carries the inflection and what to re-attach.
 *
 * Reflexive verbs ("bojati sę", 586 entries) inflect the verb and keep the
 * clitic. Adjective+noun phrases ("adaptivny rezim") would ideally agree on
 * both words; that is deliberately out of scope for now, so we inflect the
 * head and pass the remainder through unchanged.
 */
export interface MultiwordSplit {
  head: string;
  /** Words before the head, joined; empty for the common case. */
  before: string;
  /** Words after the head, joined; e.g. "sę". */
  after: string;
  isMultiword: boolean;
  /** True when the tail is a reflexive clitic rather than lexical material. */
  reflexive: boolean;
}

/**
 * `upos` decides which word is the head, and getting it wrong produced garbage
 * rather than a bad guess. 169 entries (0.87% of the dictionary) are multiword
 * VERB phrases - "bazovati na", "byti dȯlžėn", "dati råbotų", "doběgati do" -
 * whose head is the FIRST word. Treating them like a noun phrase handed `na`,
 * `dȯlžėn` and `råbotų` to the conjugator, which answered with its own error
 * marker: "stråniti sę od" realised as "stråniti sę ERROR2ų".
 *
 * Nothing caught it, because the full-form index is generated the same way and
 * so contained the ERROR strings as if they were real forms.
 */
export function splitMultiword(lemma: string, upos?: string): MultiwordSplit {
  const words = lemma.trim().split(/\s+/);
  if (words.length === 1) {
    return { head: words[0] ?? '', before: '', after: '', isMultiword: false, reflexive: false };
  }
  const last = words[words.length - 1] ?? '';
  const reflexive = TRAILING_CLITICS.has(last);

  /**
   * A leading `ne` is the negation particle, not the head: "ne ljubiti", "ne
   * slušati". The verb after it inflects and `ne` stays in front, which is
   * where the syntax page puts it - "the particle ne 'not' preceding the word
   * being negated". Taking the first word as the head conjugated `ne` itself.
   */
  if (words.length > 1 && words[0] === 'ne') {
    const rest = splitMultiword(words.slice(1).join(' '), upos);
    return {
      head: rest.head,
      before: ['ne', rest.before].filter(Boolean).join(' '),
      after: rest.after,
      isMultiword: true,
      reflexive: rest.reflexive,
    };
  }

  if (reflexive || upos === 'VERB') {
    // "bojati sę": the verb inflects and the clitic rides along. A verb phrase
    // works the same way, whatever the tail is - "bazovati na" keeps "na".
    return {
      head: words[0] ?? '',
      before: '',
      after: words.slice(1).join(' '),
      isMultiword: true,
      // The COMPUTED value, not `true`: this branch used to be reached only by
      // a reflexive, and hardcoding it told callers that "bazovati na" ended in
      // a clitic. The phrasal-verb rule reads this flag to decide whether a
      // multiword target can take a complement directly.
      reflexive,
    };
  }

  // Otherwise this is a noun phrase such as "veliky gråd" ("city"), where the
  // HEAD IS THE LAST WORD. Inflecting the first word produced nonsense like
  // "velikyu grad" instead of a properly inflected "gråd". Modifiers inside the
  // phrase are passed through unchanged, which is still imperfect - they ought
  // to agree - and is recorded as a known limitation.
  return {
    head: last,
    before: words.slice(0, -1).join(' '),
    after: '',
    isMultiword: true,
    reflexive: false,
  };
}
