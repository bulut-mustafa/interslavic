import type { Case, ParsedSentence, UdToken } from '../../../types/index.ts';
import { resolveAspect, type AspectOutcome } from '../resolvers/aspect.ts';
import { codeBelongsToPreposition } from '../../../rules/src/prepositions.ts';
import type { Entry, Lexicon } from '../../../lexicon/src/reader.ts';
import { conjunctsOf } from '../tree.ts';
import type { VerbGovernment } from '../plans.ts';

/**
 * Apply the case each verb governs lexically, from the dictionary's own `(+N)`
 * codes - `izbegati (+2)` takes a genitive, not an accusative.
 *
 * Keyed by the DEPENDENT's id, because that is the word whose case changes.
 */
export function planVerbGovernment(
  sentence: ParsedSentence,
  rankedFor: (t: UdToken, aspect: AspectOutcome | null) => Entry[],
  needsVerbFeatures: (t: UdToken) => boolean,
  lex: Lexicon,
): Map<number, VerbGovernment> {
  // 45 dictionary entries state the case their complement takes, in the same
  // numeric code the prepositions use:
  //   pomagati (+3) "help"   -> dative        (NOT the accusative "help him"
  //                                            would suggest from English)
  //   vladati  (+5) "rule"   -> instrumental
  //   izběgati (+2) "avoid"  -> genitive
  // Until now `resolveCase` accepted a verbGoverns argument that nothing ever
  // supplied, so every direct object fell through to the default accusative.
  //
  // Must run before Phase A assigns case, for the same reason the preposition
  // pre-pass does: lexical government outranks the deprel default.
  const verbGovernedCase = new Map<number, VerbGovernment>(); // keyed by DEPENDENT id

  for (const token of sentence.tokens) {
    if (!needsVerbFeatures(token)) continue;
    const entry = rankedFor(token, resolveAspect({ token, sentence, lex }))[0];
    const governs = entry?.addition.governs;
    if (!entry || !governs) continue;

    // A preposition inside the lemma owns the code, not the verb.
    if (codeBelongsToPreposition(entry.lemma)) continue;

    const code = entry.addition.raw.match(/\(\+\d\)/)?.[0] ?? '(+?)';
    const government = { case: governs, lemma: entry.lemma, code };
    for (const dep of sentence.tokens) {
      if (dep.head !== token.id || dep.deprel !== 'obj') continue;
      verbGovernedCase.set(dep.id, government);
      // "I help my brother and my sister": both conjuncts are governed.
      for (const id of conjunctsOf(dep.id, sentence)) verbGovernedCase.set(id, government);
    }
  }

  return verbGovernedCase;
}
