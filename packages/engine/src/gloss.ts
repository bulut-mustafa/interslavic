import type { Decision, ParsedSentence, UdToken } from '../../types/index.ts';
import { normalizeGloss, normalizeRussian, type Entry, type Gloss } from '../../lexicon/src/reader.ts';
import type { FullFormIndex } from '../../lexicon/src/full-forms.ts';
import type { PrepPlan } from './resolvers/preposition.ts';
import type { GlossedFeature } from './result.ts';
import { toStandard } from '../../morph/src/orthography.ts';

const normalizeFor = (s: string, lang: string): string =>
  lang === 'ru' ? normalizeRussian(s) : normalizeGloss(s);

/**
 * Turning a decision into something a reader can check: which gloss matched,
 * which words are not real Interslavic forms, and why a preposition was
 * chosen. Pure, and shared by the realise stage and the pipeline.
 */

export /**
 * Which gloss in the entry actually matched the source lemma. Reported in the
 * gloss panel so a cross-language difference is traceable to its data.
 */
function matchedGloss(entry: Entry, sourceLemma: string, lang: string): string {
  const key = normalizeFor(sourceLemma, lang);
  const show = (g?: Gloss): string | undefined =>
    g ? (g.sense ? `${g.text} (${g.sense})` : g.text) : undefined;
  // Both columns are parsed the same way, so they are reported the same way -
  // a Russian sense label used to be lost inside the gloss string.
  const glosses = lang === 'ru' ? entry.ruGlosses : entry.glosses;
  const normalize = lang === 'ru' ? normalizeRussian : normalizeGloss;
  const hit = glosses.find((g) => normalize(g.text) === key);
  return show(hit) ?? show(glosses[0]) ?? '?';
}

export /**
 * Which words of a surface form are not in the full-form lexicon.
 *
 * A multiword entry is emitted as one surface string ("veliky gradu"), so each
 * word has to be checked separately - the phrase itself is never a key.
 */
function unknownWords(surface: string, validator: FullFormIndex): string[] {
  return surface
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !validator.has(w) && !validator.has(toStandard(w)));
}

export function glossFeature(name: string, d: Decision<string>): GlossedFeature {
  return {
    name,
    value: d.value,
    because: d.because,
    confidence: d.confidence,
    alternatives: (d.alternatives ?? []).map((a) => ({ value: String(a.value), because: a.because })),
  };
}

export /** Why this preposition was chosen, for the gloss panel. */
function prepositionReason(token: UdToken, plans: Map<number, PrepPlan>): string | undefined {
  const p = plans.get(token.id);
  if (p?.kind !== 'preposition') return undefined;
  const alts = p.alternatives.length ? `; over ${p.alternatives.join(', ')}` : '';
  return `${p.case.because}${alts}`;
}

/**
 * Content words of the sentence, so a gloss's sense label can be checked
 * against the context it claims: `prati` is glossed "wash (clothes)", which
 * "wash the clothes" supports and a bare "wash" does not.
 */
export function contextWordsOf(sentence: ParsedSentence): ReadonlySet<string> {
  return new Set(
    sentence.tokens.flatMap((t) =>
      [t.lemma, t.form]
        .filter((w): w is string => typeof w === 'string')
        .map((w) => w.toLowerCase())
        .filter((w) => w.length >= 3),
    ),
  );
}
