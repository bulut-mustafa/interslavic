/**
 * English modals, mapped to the Interslavic verbs the dictionary itself marks
 * `v.aux.` ("auxiliary verb").
 *
 * Why this is a curated table and not ranking, exactly as with
 * `function-words.json`: modals are a tiny closed class used constantly, and
 * ranking gets them wrong in ways a learner cannot see through. Before this
 * table:
 *
 *   "I can swim."       ->  Ja možeše plavaju   (an IMPERFECT 3sg, and the
 *                                                complement conjugated)
 *   "I could swim."     ->  Ja could plavaju    (raw English in the output)
 *   "He must go."       ->  On imaju ide        ("imati" = to HAVE)
 *   "She should read."  ->  Ona dolžnogo čitaje (a genitive adjective)
 *
 * Interslavic puts the modal in the finite form and its complement in the
 * infinitive - "mogu plavati" - which is also the English word order, so no
 * reordering is needed.
 */

export interface ModalPlan {
  /** English gloss to look the Interslavic verb up by. */
  gloss: string;
  /** The entry we want, curated rather than ranked. */
  isv: string;
  /** Tense the modal itself carries; English marks it on the modal. */
  tense: 'Pres' | 'Past';
  why: string;
  evidence: string;
}

const MODALS: Record<string, ModalPlan> = {
  can: {
    gloss: 'can',
    isv: 'mogti',
    tense: 'Pres',
    why: 'the dictionary glosses mogti "can, may, be able" and marks it v.aux.',
    evidence: 'type 1 (universally intelligible); intelligibility be+ bg+ hr+ pl+ ru+ sk+ sr+ uk+',
  },
  could: {
    gloss: 'can',
    isv: 'mogti',
    tense: 'Past',
    why: 'past of "can"; English marks the tense on the modal, so mogti takes the past',
    evidence: 'matches the grammar\'s own "Otec nikde ne mogl najdti svoje ključi"',
  },
  may: {
    gloss: 'can',
    isv: 'mogti',
    tense: 'Pres',
    why: 'the same entry covers permission and possibility - its gloss is "can, may, be able"',
    evidence: 'type 1; one entry glossed for both senses',
  },
  might: {
    gloss: 'can',
    isv: 'mogti',
    tense: 'Past',
    why: 'past/tentative of "may", carried by the modal as in English',
    evidence:
      'the same mogti entry as "may" and "can"; Interslavic has no separate tentative modal, so the past tense carries the hedge',
  },
  must: {
    gloss: 'must',
    isv: 'musěti',
    tense: 'Pres',
    why: 'chosen over morati on the dictionary\'s own intelligibility row, not on frequency',
    evidence:
      'musěti is positive in 6 languages (be+ cs+ hr+ pl+ sk+ uk+) against morati\'s 2 (hr+ sr+); "iměti, imati" is type 1 but its primary sense is "have, possess"',
  },
};

/**
 * Deliberately absent: "should", "ought to" and "would". The natural
 * Interslavic for them uses the conditional (`by` + l-participle) or the
 * predicate adjective `dȯlžny`, neither of which is built yet. Guessing a
 * finite verb for them would produce confident nonsense, so they keep falling
 * through to ordinary lookup and stay visible as a defect.
 */
export const UNHANDLED_MODALS = ['should', 'ought', 'would', 'shall'] as const;

export function modalFor(lemma: string): ModalPlan | null {
  return MODALS[lemma.toLowerCase()] ?? null;
}
