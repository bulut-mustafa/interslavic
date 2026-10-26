import { idiomWarnings } from '../../../rules/src/idioms.ts';
import { render, type Orthography } from '../../../morph/src/orthography.ts';
import type { ParsedSentence } from '../../../types/index.ts';
import type { GlossedWord, Translation } from '../result.ts';
import { citationFor } from '../../../rules/src/registry.ts';

/**
 * The last stage: turn the chosen surfaces into a sentence.
 *
 * Extracted first because nothing depends on it - every other stage feeds it -
 * so it is the safe end to start unpicking a 3,000-line function from.
 *
 * Word ORDER is still source order, which is SVO for everything handled so
 * far; the two places that diverge (a yes/no question, a genitive possessor)
 * reorder the plan before reaching here.
 */
export interface RenderInput {
  sentence: ParsedSentence;
  /** Emitted surfaces, in output order. Empty strings are skipped. */
  surfaces: readonly string[];
  words: readonly GlossedWord[];
  dropped: Translation['dropped'];
  unknown: Translation['unknown'];
  /** Sentence-final punctuation carried over from the source, or ''. */
  punctuation: string;
  orthography: Orthography;
  /** Whether a full-form validator was supplied; decides `validationRate`. */
  validated: boolean;
}

export function renderStage(input: RenderInput): Translation {
  const { sentence, surfaces, words, dropped, unknown, punctuation, orthography, validated } = input;

  const rawText = surfaces.filter(Boolean).join(' ');
  const rendered = render(rawText, orthography);
  // An input of only punctuation leaves nothing to capitalise or terminate.
  const text = rendered
    ? `${rendered.charAt(0).toUpperCase()}${rendered.slice(1)}${punctuation}`
    : punctuation;

  return {
    source: sentence.text,
    lang: sentence.lang,
    text,
    words: words.map((w) => ({ ...w, surface: render(w.surface, orthography) })),
    dropped,
    unknown,
    /**
     * Every rule these words used, with the source that justifies it. A rule
     * with no registry entry is a bug the registry test catches, so it is left
     * out here rather than papered over with a placeholder.
     */
    citations: Object.fromEntries(
      [...new Set(words.flatMap((w) => w.features.map((f) => f.ruleId)))]
        .sort()
        .map((id) => [id, citationFor(id)] as const)
        .filter((pair): pair is [string, NonNullable<ReturnType<typeof citationFor>>] =>
          pair[1] !== null,
        ),
    ),
    validationRate: validated
      ? words.length === 0
        ? 1
        : words.filter((w) => w.validation === 'validated').length / words.length
      : null,
    warnings: idiomWarnings(sentence),
  };
}
