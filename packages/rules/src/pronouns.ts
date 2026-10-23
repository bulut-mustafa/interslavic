/**
 * Personal pronouns: which lemma to inflect, and the `n-` form after a
 * preposition.
 *
 * Two separate defects made every pronoun object wrong.
 *
 * **1. The dictionary stores oblique forms as their own entries.** `jų` is
 * glossed "her", `go` and `jego` "him, it", `jih` "them" - these are accusative
 * and genitive FORMS, not lemmas. Looking "her" up by gloss therefore handed
 * `jų` to the morphology library, which has no paradigm for an oblique form and
 * returns the merged 53-token paradigm of every third-person pronoun at once.
 * Asking it for the dative then produced `njemu` - the MASCULINE form - for
 * "her". A personal pronoun has to be realised from its nominative lemma, which
 * the parser's own Person/Number/Gender features identify exactly.
 *
 * **2. The `n-` forms are only for after a preposition.** From the pronouns
 * page:
 *
 *   "After a preposition, all pronouns of the third person are preceded by n-:
 *    jego > do njego; jim > pri njim, etc. (for that reason, the locative forms
 *    jim, jej and jih never occur, as the locative is always preceded by a
 *    preposition)"
 *
 * The library marks these `PrepCase=Pre` (after a preposition) and `Npr` (not),
 * but nothing requested either, so the longest-form tie-break picked the `n-`
 * form every time: "I see him" gave `njego` where `jego` is required.
 *
 * Source: http://steen.free.fr/interslavic/pronouns.html
 */

/**
 * The nominative lemma to inflect for an English personal pronoun, from the
 * parser's features rather than its lemma - Stanza lemmatises "her" to `her`,
 * not to `she`, so the lemma is not a reliable key.
 *
 * Returns null for anything that is not a plain personal pronoun: possessives
 * (`Poss=Yes`) and reflexives (`Reflex=Yes`) have their own rules.
 */
export function personalPronounLemma(
  feats: Record<string, string>,
  /**
   * Whether the SOURCE language distinguishes number in the second person.
   * English does not - "you" is both - so the T-V rule below picks the
   * unmarked `vy`. Russian does: `ты` is Person=2 Number=Sing and `вы` is
   * Person=2 Number=Plur, and forcing `vy` would throw away a distinction the
   * source actually makes.
   */
  marksSecondPersonNumber = false,
): string | null {
  if (feats['PronType'] !== 'Prs') return null;
  if (feats['Poss'] === 'Yes' || feats['Reflex'] === 'Yes') return null;

  const plural = feats['Number'] === 'Plur';
  switch (feats['Person']) {
    case '1':
      return plural ? 'my' : 'ja';
    case '2':
      /**
       * `vy` unless the source itself marks the singular. The page:
       *   "Interslavic has got T-V distinction, i.e. vy is a universal second
       *    person pronoun for both numbers, whereas the second person singular
       *    ty is used only for addressing friends, relatives and children."
       * From English, `ty` would assert an intimacy the source does not
       * contain. From Russian, `ты` states it outright, and rendering it `vy`
       * would silently make an informal sentence formal.
       */
      return marksSecondPersonNumber && !plural ? 'ty' : 'vy';
    case '3':
      if (plural) return 'oni';
      if (feats['Gender'] === 'Fem') return 'ona';
      if (feats['Gender'] === 'Neut') return 'ono';
      return 'on';
    default:
      return null;
  }
}

/**
 * The grammatical number of the chosen pronoun, which is a property of the
 * LEMMA and not of the English source.
 *
 * `vy` is the case that forces this: it is morphologically plural (`vy, vas,
 * vam, vami` - there is no singular), but it translates an English "you" that
 * Stanza leaves unmarked for number. Requesting the singular matched nothing,
 * realisation fell back to the citation form, and "I see you" came out as the
 * NOMINATIVE `vy` instead of the accusative `vas`.
 */
export function personalPronounNumber(lemma: string): 'Sing' | 'Plur' {
  return lemma === 'my' || lemma === 'vy' || lemma === 'oni' || lemma === 'one'
    ? 'Plur'
    : 'Sing';
}

/**
 * The gender of the chosen pronoun, where Interslavic fixes one.
 *
 * Needed because anything agreeing with a pronoun subject had nothing to agree
 * with: gender is read off the dictionary entry, and only nouns carry one, so
 * "He is the best" left the predicate adjective genderless and the tie-break
 * picked the feminine `najlěpša`.
 *
 * `ja`, `ty`, `my` and `vy` have no inherent gender - the speaker's gender is
 * simply not in the English - so they return null and the caller defaults.
 */
export function personalPronounGender(lemma: string): 'Masc' | 'Fem' | 'Neut' | null {
  switch (lemma) {
    case 'on':
      return 'Masc';
    case 'ona':
      return 'Fem';
    case 'ono':
      return 'Neut';
    // "oni" is the masculine-or-mixed plural, per the dictionary's own gloss
    // "they (masculine or mixed)"; "one" is the feminine plural.
    case 'oni':
      return 'Masc';
    case 'one':
      return 'Fem';
    default:
      return null;
  }
}

/**
 * The `PrepCase` value to request: `Pre` gives the `n-` form, `Npr` the plain
 * one. Only third-person paradigms carry the feature at all; for `ja`/`ty`/
 * `my`/`vy` the request is simply not satisfiable and is dropped, because no
 * token in those paradigms defines it.
 */
export function prepCaseFor(afterPreposition: boolean): 'Pre' | 'Npr' {
  return afterPreposition ? 'Pre' : 'Npr';
}

/**
 * The relative pronoun. "The relative pronoun that is used most frequently is
 * `ktory`. It is inflected like an ordinary adjective. Alternatively, South
 * Slavic `koj` [...] can be used as well. Their meanings are identical and they
 * can be used interchangably."
 * http://steen.free.fr/interslavic/pronouns.html
 *
 * English "who"/"which"/"that" introducing a relative clause was translated by
 * gloss, which gave the interrogative `kto` - "The man WHO lives there" came
 * out as "Muž kto žive tam".
 */
export const RELATIVE_PRONOUN = 'ktory';

/**
 * The complementizer. The conjunctions list gives `že` for "that" directly.
 * Translated by gloss it reached the demonstrative instead: "She told me that
 * she was tired" produced "kazala mně tamtogo ona byla...".
 * https://interslavic.fun/learn/grammar/conjunctions/
 */
export const COMPLEMENTIZER = 'že';
