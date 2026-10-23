/**
 * English auxiliaries, and what Interslavic does with each.
 *
 * English stacks meaning onto auxiliaries that Interslavic expresses with
 * aspect, a single past form, or one periphrastic future. Translating them
 * literally produces nonsense:
 *
 *   "She is reading"     -> *Ona běše čitaje   (an imperfect of "to be")
 *   "I have finished"    -> *Ja imaju končal   ("I possess finished")
 *   "I will go"          -> *Ja voljeju ide    ("I will/want" as a lexical verb)
 *
 * UD labels all of them AUX with deprel `aux`, so they must be classified by
 * lemma rather than by part of speech.
 *
 * The modals proper (can, must, may...) are handled in `modals.ts`: they are
 * separate lexical verbs in Interslavic and dropping them would delete the
 * meaning. "would" is here rather than there, because Interslavic expresses it
 * with the conditional of `byti` and not with a verb of its own.
 */

export type AuxiliaryRole =
  /** Progressive "be": drop it; the ongoing sense is carried by imperfective aspect. */
  | 'progressive'
  /** Do-support: drop it; it carries only tense and person. */
  | 'doSupport'
  /** Perfect "have": drop it; Interslavic has one past, the l-participle. */
  | 'perfect'
  /** "will"/"shall": becomes the periphrastic future, budu + infinitive. */
  | 'future'
  /** "would": becomes the conditional, byh/bys/by + l-participle. */
  | 'conditional';

const BY_LEMMA: Record<string, AuxiliaryRole> = {
  be: 'progressive',
  do: 'doSupport',
  have: 'perfect',
  will: 'future',
  shall: 'future',
  would: 'conditional',
};

export function auxiliaryRole(lemma: string): AuxiliaryRole | null {
  return BY_LEMMA[lemma.trim().toLowerCase()] ?? null;
}

/**
 * The future auxiliary, quoted from interslavic.fun/learn/grammar/verbs/:
 *
 *   "The future tense is formed by combining the future tense of the verb byti
 *    with the infinitive. The forms are the same as if a verb with the stem
 *    bud- were conjugated in the present tense:
 *    ja budu, ty budeš, on/ona/ono bude, my budemo, vy budete, oni budut."
 *
 * Supplied here because the morphology library generates no future forms for
 * `byti` at all - its paradigm stops at present and past, even when given the
 * dictionary's own `bųdų` principal part. This is one closed irregular
 * auxiliary, not an open class, so it does not breach "author no paradigm
 * tables".
 *
 * Stored in the etymological spelling the dictionary uses, so the orthography
 * layer folds it exactly like every other word (bųdų -> budu).
 */
const FUTURE_OF_BYTI: Record<string, string> = {
  '1-Sing': 'bųdų',
  '2-Sing': 'bųdeš',
  '3-Sing': 'bųde',
  '1-Plur': 'bųdemo',
  '2-Plur': 'bųdete',
  '3-Plur': 'bųdut',
};

export function futureAuxiliary(person: string, number: string): string {
  return FUTURE_OF_BYTI[`${person}-${number}`] ?? FUTURE_OF_BYTI['3-Sing']!;
}

/**
 * The conditional, from the verbs page:
 *
 *   "The conditional is formed by using the L-participle with the conditional
 *    of byti 'to be': ja byh dělal(a) 'I would do'."
 *
 * with the table: ja byh · ty bys · on/ona/ono by · my byhmo · vy byste ·
 * oni/one by.
 *
 * Supplied here for the same reason as the future: the library computes a
 * conditional internally but emits no token for it, so "I would read" was
 * translated with "would" as an ordinary lexical verb.
 *
 * Source: http://steen.free.fr/interslavic/verbs.html
 */
const CONDITIONAL_OF_BYTI: Record<string, string> = {
  '1-Sing': 'byh',
  '2-Sing': 'bys',
  '3-Sing': 'by',
  '1-Plur': 'byhmo',
  '2-Plur': 'byste',
  '3-Plur': 'by',
};

export function conditionalAuxiliary(person: string, number: string): string {
  return CONDITIONAL_OF_BYTI[`${person}-${number}`] ?? CONDITIONAL_OF_BYTI['3-Sing']!;
}
