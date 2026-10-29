import type { ParsedSentence, UdToken } from '../../types/index.ts';
import type { SourceRewrite } from './source-rewrites.ts';
import { insertFutureAuxiliary } from './source-rewrites.ts';

/**
 * Rewrites of a Ukrainian parse into the shape the Interslavic rules already
 * read, applied before anything reads the tree. Each is either a fact of
 * Ukrainian grammar the Russian parse never needed, or a known habit of the
 * Ukrainian parser (UD Ukrainian-IU); each says which.
 */

const children = (s: ParsedSentence, t: UdToken) => s.tokens.filter((c) => c.head === t.id);
const isVerbal = (t: UdToken) => t.upos === 'VERB' || t.upos === 'AUX';

/**
 * A clause with no verb. Ukrainian, like Russian, omits the present "бути" -
 * "Цей подарунок для тебе", "У мене два брати" - and the Ukrainian parser
 * treats that as an ELIDED predicate: it promotes the subject to root and hangs
 * the real predicate off it as `orphan`, UD's relation for "predicate ellipsis
 * where one of the core arguments has to be promoted to clausal head"
 * (universaldependencies.org/u/dep/orphan.html). The predicate it elided is
 * exactly the copula Interslavic writes, so the parse is turned back into the
 * ordinary nonverbal clause the Russian parser gives - predicate as root,
 * subject as `nsubj` - and the copula rule then supplies "jest"/"sut": "Toj
 * podarok jest dlja tebe", "U mene sut dva brati".
 *
 * Only a prepositional predicate ("для тебе", "з Томом", "у мене"), in a
 * sentence with no verb at all, whose root is nominal.
 */
export function rewriteVerblessOrphan(sentence: ParsedSentence): ParsedSentence {
  if (sentence.tokens.some(isVerbal)) return sentence;
  const root = sentence.tokens.find((t) => t.head === 0);
  if (!root || !['NOUN', 'PRON', 'PROPN'].includes(root.upos)) return sentence;
  const orphan = children(sentence, root).find(
    (c) => c.deprel === 'orphan' && children(sentence, c).some((g) => g.deprel === 'case'),
  );
  if (!orphan) return sentence;
  return {
    ...sentence,
    tokens: sentence.tokens.map((t) => {
      if (t.id === orphan.id) return { ...t, head: 0, deprel: 'root' };
      if (t.id === root.id) return { ...t, head: orphan.id, deprel: 'nsubj' };
      // The rest of the clause belongs to the new predicate, except what
      // modifies the subject itself (its determiners, numerals, conjuncts).
      if (t.head === root.id && ['punct', 'advmod', 'discourse', 'parataxis'].includes(t.deprel)) {
        return { ...t, head: orphan.id };
      }
      return t;
    }),
  };
}

/**
 * The imperative's person and number, from its ending. Ukrainian forms the
 * second person singular with -и/-й/-ь, the plural with -іть/-іте/-те, and the
 * first person plural with -імо/-ймо (Wiktionary's conjugation tables:
 * відчини, відчиніть, відчинімо; зійди, зійдіть, зійдімо). The indicative
 * first person plural ends -емо/-ємо/-имо/-їмо, never -імо/-ймо, so those two
 * endings are the imperative wherever they occur.
 *
 * The parser tags "Відчини вікно" and "Зачини двері" plural, which gave the
 * plural "Otvorite okno" for a command to one person, and it tags "збудуймо"
 * an indicative future. Interslavic has the same three persons: "dělaj
 * „do!”, dělajmo „let's do!”, dělajte „do!”" (verbs page).
 */
export function correctImperatives(sentence: ParsedSentence): ParsedSentence {
  return {
    ...sentence,
    tokens: sentence.tokens.map((t) => {
      if (!isVerbal(t)) return t;
      const form = t.form.toLowerCase();
      const firstPlural = /(імо|ймо)(ся)?$/.test(form);
      if (t.feats['Mood'] !== 'Imp' && !firstPlural) return t;
      const { Tense: _t, Aspect: aspect, ...feats } = t.feats;
      const [Person, Number] = firstPlural ? ['1', 'Plur'] : /(ть|те)(ся|сь)?$/.test(form) ? ['2', 'Plur'] : ['2', 'Sing'];
      return { ...t, feats: { ...feats, ...(aspect ? { Aspect: aspect } : {}), Mood: 'Imp', VerbForm: 'Fin', Person, Number } };
    }),
  };
}

/**
 * The synthetic future of an imperfective verb, "читатиму", is the same tense
 * as the analytic "буду читати": "Недоконані дієслова ... мають синтетичну
 * (просту) та аналітичну (складену) форму майбутнього часу" - писатиму /
 * буду писати (Олійник, Шинкарук, Гребницький, Граматика української мови,
 * 2007, via uk.wikipedia "Майбутній час"). Interslavic has only the analytic
 * one, "budu" + infinitive, so the verb is given that shape. "Я читатиму
 * книгу" was the present "Ja čitaju knigu".
 */
const SYNTHETIC_FUTURE = /(тиму|тимеш|тиме|тимемо|тимете|тимуть)(ся|сь)?$/;

export function rewriteSyntheticFuture(sentence: ParsedSentence): ParsedSentence {
  const verbs = sentence.tokens.filter(
    (t) => t.upos === 'VERB' && t.feats['VerbForm'] === 'Fin' && SYNTHETIC_FUTURE.test(t.form.toLowerCase()),
  );
  return insertFutureAuxiliary(sentence, verbs, 'бути');
}

/**
 * The standard of comparison. Ukrainian marks it with "за" + accusative or
 * "від" + genitive ("старший за мене", "старший від сестри"), or with "ніж";
 * the bare genitive Russian uses ("старше меня") is an error in Ukrainian
 * ("сильніший за мене (а не «сильніший мене»)", moodle.znu.edu.ua; urok.osvita.ua,
 * "Ступені порівняння прикметників"). Interslavic takes "od" with the genitive
 * (see the comparison rule in the auxiliaries stage), so the source preposition
 * is dropped and its noun made the genitive standard that rule reads.
 *
 * The standard hangs off the comparative itself ("старший за мене"), or off
 * the verb beside a comparative adverb ("читає швидше за мене"), where it is
 * moved onto the adverb.
 */
const COMPARISON_PREPOSITIONS = new Set(['за', 'від']);

export function rewriteComparisonStandard(sentence: ParsedSentence): SourceRewrite {
  const absorbed: SourceRewrite['absorbed'] = [];
  const removed = new Set<number>();
  const changed = new Map<number, Partial<UdToken>>();
  for (const t of sentence.tokens) {
    if (!t.deprel.startsWith('obl')) continue;
    const prep = children(sentence, t).find(
      (c) => c.deprel === 'case' && COMPARISON_PREPOSITIONS.has(c.lemma.toLowerCase()),
    );
    if (!prep) continue;
    const head = sentence.tokens.find((h) => h.id === t.head);
    if (!head) continue;
    const comparative = head.feats['Degree'] === 'Cmp'
      ? head
      : children(sentence, head).find((c) => c.upos === 'ADV' && c.feats['Degree'] === 'Cmp' && c.deprel === 'advmod');
    if (!comparative) continue;
    removed.add(prep.id);
    changed.set(t.id, { head: comparative.id, deprel: 'obl', feats: { ...t.feats, Case: 'Gen' } });
    absorbed.push({ form: prep.form, why: 'marks the standard of comparison, which Interslavic gives "od" with the genitive' });
  }
  if (removed.size === 0) return { sentence, absorbed };
  return {
    sentence: {
      ...sentence,
      tokens: sentence.tokens.filter((t) => !removed.has(t.id)).map((t) => ({ ...t, ...changed.get(t.id) })),
    },
    absorbed,
  };
}

/**
 * Clock time. Ukrainian gives the hour as "о" with a feminine ordinal in the
 * locative, the noun "година" understood or written: "о шостій годині ― at
 * six o'clock" (Wiktionary "о", after Bilodid's СУМ). Interslavic writes the
 * cardinal with "v" and the accusative, as the clock rule already does for
 * "at seven" and Russian "в семь" ("v 9:15", Wp/isv). So the ordinal becomes
 * its cardinal, "о" becomes "в", and "годині" is absorbed as "o'clock" is.
 */
const HOUR_ORDINALS: Record<string, string> = {
  перший: 'один', другий: 'два', третій: 'три', четвертий: 'чотири', "п'ятий": "п'ять",
  шостий: 'шість', сьомий: 'сім', восьмий: 'вісім', "дев'ятий": "дев'ять", десятий: 'десять',
  одинадцятий: 'одинадцять', дванадцятий: 'дванадцять',
};

export function rewriteClockTime(sentence: ParsedSentence): SourceRewrite {
  const absorbed: SourceRewrite['absorbed'] = [];
  const removed = new Set<number>();
  const changed = new Map<number, Partial<UdToken>>();
  const apostrophe = (s: string) => s.toLowerCase().replace(/[ʼ’‘`]/g, "'");
  for (const t of sentence.tokens) {
    const cardinal = HOUR_ORDINALS[apostrophe(t.lemma)];
    if (!cardinal || t.feats['Case'] !== 'Loc' || t.feats['Gender'] !== 'Fem') continue;
    // "о сьомій" (the ordinal is the noun) or "о дев'ятій годині".
    const hour = sentence.tokens.find(
      (h) => h.id === t.head && h.lemma.toLowerCase() === 'година' && h.feats['Case'] === 'Loc',
    );
    const phrase = hour ?? t;
    const prep = children(sentence, phrase).find((c) => c.deprel === 'case' && ['о', 'об'].includes(c.lemma.toLowerCase()));
    if (!prep) continue;
    changed.set(prep.id, { form: 'в', lemma: 'в', feats: { Case: 'Acc' }, head: t.id });
    changed.set(t.id, {
      upos: 'NUM', lemma: cardinal, form: cardinal, xpos: 'NUM',
      feats: { Case: 'Acc', NumType: 'Card' },
      ...(hour ? { head: hour.head, deprel: hour.deprel } : {}),
    });
    if (hour) {
      removed.add(hour.id);
      absorbed.push({ form: hour.form, why: 'the hour is the cardinal alone, as "o\'clock" is absorbed' });
      for (const c of sentence.tokens) if (c.head === hour.id && c.id !== t.id && c.id !== prep.id) changed.set(c.id, { head: t.id });
    }
  }
  if (changed.size === 0) return { sentence, absorbed };
  return {
    sentence: {
      ...sentence,
      tokens: sentence.tokens.filter((t) => !removed.has(t.id)).map((t) => ({ ...t, ...changed.get(t.id) })),
    },
    absorbed,
  };
}

export function rewriteUkrainian(sentence: ParsedSentence): SourceRewrite {
  if (sentence.lang !== 'uk') return { sentence, absorbed: [] };
  const comparison = rewriteComparisonStandard(
    rewriteSyntheticFuture(correctImperatives(rewriteVerblessOrphan(sentence))),
  );
  const clock = rewriteClockTime(comparison.sentence);
  return { sentence: clock.sentence, absorbed: [...comparison.absorbed, ...clock.absorbed] };
}
