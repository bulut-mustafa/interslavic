import type { ParsedSentence, UdToken } from '../../types/index.ts';
import { personalPronounLemma, personalPronounNumber } from '../../rules/src/pronouns.ts';
import { adapterFor } from './source/adapters.ts';

/**
 * Pure helpers over the dependency parse. Their own module because several
 * stages need them and none of them needs the pipeline.
 */

/**
 * The subject of the clause a verb sits in, walking up until one is found.
 * Declared here because both `subjectPerson` and `subjectNumber` are
 * module-level and need it.
 */
export function subjectOfClause(from: UdToken, sentence: ParsedSentence): UdToken | undefined {
  let current: UdToken | undefined = from;
  for (let hops = 0; current !== undefined && hops < 8; hops++) {
    const here: UdToken = current;
    const subject = sentence.tokens.find(
      (t) => t.head === here.id && t.deprel.startsWith('nsubj'),
    );
    if (subject) return subject;
    current = sentence.tokens.find((t) => t.id === here.head);
  }
  return undefined;
}

/**
 * Every token in a phrase headed by `rootId`, excluding the subject (which
 * hangs off a predicate but belongs to no predicate phrase) and punctuation.
 */
export function phraseOf(rootId: number, sentence: ParsedSentence): Set<number> {
  const out = new Set<number>([rootId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const t of sentence.tokens) {
      if (t.upos === 'PUNCT') continue;
      /**
       * The clause's OWN subject is excluded, because it hangs off the
       * predicate while belonging to no predicate phrase. Only at this level
       * though: a relative clause inside the phrase has a subject of its own,
       * and excluding that split "Kniga ktoru ja čitaju" into two pieces -
       * "Kniga ktoru jest ja čitaju interesna".
       */
      if (t.head === rootId && t.deprel.startsWith('nsubj')) continue;
      if (!out.has(t.id) && out.has(t.head)) {
        out.add(t.id);
        grew = true;
      }
    }
  }
  return out;
}

export function baseDeprel(deprel: string): string {
  return deprel.split(':')[0] ?? deprel;
}

export /**
 * The pronoun rule, with the source language's own second-person behaviour
 * taken from its adapter. Threading the flag through each call site by hand
 * missed five of six, which left Russian "Ты čitaješ" conjugated as a plural
 * because `personalPronounNumber('vy')` is Plur.
 */
function pronounLemmaFor(
  feats: Record<string, string>,
  sentence: ParsedSentence,
): string | null {
  return personalPronounLemma(feats, adapterFor(sentence).marksSecondPersonNumber);
}

/**
 * Subjects joined by "and" are plural together: "Sěverny Větr i Solnce
 * sporili se" (van Steenbergen's North Wind and the Sun), where reading the
 * first conjunct alone gave the singular "osparjal".
 */
const isCoordinatedByAnd = (subject: UdToken, sentence: ParsedSentence): boolean => {
  const and = adapterFor(sentence).andWords;
  return sentence.tokens.some(
    (c) =>
      c.head === subject.id &&
      c.deprel === 'conj' &&
      sentence.tokens.some((cc) => cc.head === c.id && cc.deprel === 'cc' && and.includes(cc.lemma.toLowerCase())),
  );
};

/**
 * A Russian verb states its own person and number, so a verb with no subject
 * of its own keeps them rather than borrowing the outer clause's subject: in
 * "И сказали они: построим себе город" the hortative "построим" is FIRST
 * person, and walking up to "они" gave "sbudujut". English verbs mostly mark
 * neither, which is why walking up exists at all.
 */
const ownRussianAgreement = (verb: UdToken, sentence: ParsedSentence, feature: 'Person' | 'Number') =>
  // Every Slavic source marks person and number on the verb, as Russian does.
  sentence.lang !== 'en' &&
  !sentence.tokens.some((t) => t.head === verb.id && t.deprel.startsWith('nsubj'))
    ? verb.feats[feature]
    : undefined;

/**
 * A Slavic past in the neuter singular whose clause has no subject is
 * impersonal: "Хотя было уже поздно, мы решили" is "bylo pozdno", and walking
 * up to the main clause's "мы" made it "jesm byl". A copula's clause is its
 * predicate, so that is where the subject would hang.
 */
export function isImpersonalSlavicPast(verb: UdToken, sentence: ParsedSentence): boolean {
  if (sentence.lang === 'en') return false;
  if (verb.feats['Tense'] !== 'Past' || verb.feats['Gender'] !== 'Neut' || verb.feats['Number'] !== 'Sing') return false;
  const clause = verb.deprel === 'cop' || verb.deprel.startsWith('aux') ? verb.head : verb.id;
  return !sentence.tokens.some((t) => (t.head === clause || t.head === verb.id) && t.deprel.startsWith('nsubj'));
}

export function subjectNumber(verb: UdToken, sentence: ParsedSentence, fallback?: string): string {
  const own = ownRussianAgreement(verb, sentence, 'Number');
  if (own) return own;
  const subject =
    sentence.tokens.find((t) => t.head === verb.id && t.deprel.startsWith('nsubj')) ??
    // A copula has no subject of its own: "you are right" hangs `you` off
    // `right`. Without walking up, "vy jesi prave" came out 2nd SINGULAR.
    subjectOfClause(verb, sentence);
  if (subject) {
    if (isCoordinatedByAnd(subject, sentence)) return 'Plur';
    const pronoun = pronounLemmaFor(subject.feats, sentence);
    if (pronoun) return personalPronounNumber(pronoun);
    if (subject.feats['Number']) return subject.feats['Number'];
  }
  return fallback ?? verb.feats['Number'] ?? 'Sing';
}

export function subjectPerson(verb: UdToken, sentence: ParsedSentence): string {
  const own = ownRussianAgreement(verb, sentence, 'Person');
  if (own) return own;
  if (isImpersonalSlavicPast(verb, sentence)) return '3';
  const subject =
    sentence.tokens.find((t) => t.head === verb.id && t.deprel.startsWith('nsubj')) ??
    subjectOfClause(verb, sentence);
  if (subject) {
    if (subject.upos === 'PRON') return subject.feats['Person'] ?? '3';
    // Any noun, proper noun or nominal subject is third person.
    return '3';
  }
  // No subject in the tree: fall back to the verb, then its auxiliary.
  const aux = sentence.tokens.find(
    (t) => t.head === verb.id && t.deprel === 'aux' && t.feats['Person'],
  );
  return verb.feats['Person'] ?? aux?.feats['Person'] ?? '3';
}

/**
 * The sentence's own final punctuation. Carried over rather than assumed:
 * appending "." turned "Do you know the answer?" into a statement.
 */
export function sentencePunctuation(sentence: ParsedSentence): string {
  const last = [...sentence.tokens].reverse().find((t) => t.upos === 'PUNCT');
  return last && /[.!?…]+$/.test(last.form) ? last.form : '';
}

/**
 * Conjuncts of a token, transitively. UD hangs every later conjunct off the
 * FIRST one, so "in the house and the garden" attaches "garden" to "house" -
 * and a preposition governs the whole coordination, not just its first
 * member. Without this, "v domu i sad" came out with a nominative conjunct.
 */
export function conjunctsOf(id: number, sentence: ParsedSentence): number[] {
  const out: number[] = [];
  const queue = [id];
  while (queue.length > 0 && out.length < 32) {
    const current = queue.shift()!;
    for (const t of sentence.tokens) {
      if (t.head === current && t.deprel === 'conj' && !out.includes(t.id)) {
        out.push(t.id);
        queue.push(t.id);
      }
    }
  }
  return out;
}
