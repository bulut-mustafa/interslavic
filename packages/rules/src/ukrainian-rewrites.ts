import type { ParsedSentence, UdToken } from '../../types/index.ts';
import type { SourceRewrite } from './source-rewrites.ts';
import { insertFutureAuxiliary } from './source-rewrites.ts';
import { numeralValue } from './numerals.ts';

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

/**
 * "повинен" with an infinitive is the modal "must": "пови́нен (feminine
 * пови́нна, neuter пови́нне, plural пови́нні) must (+ infinitive), should,
 * ought to" (Wiktionary). The parser lemmatises "повинні" as the adjective
 * "повинний", which the dictionary has only as "guilty" (`vinnik`), so "Ми
 * повинні піти" became "My jesmo vinniki ujdti". The dictionary glosses
 * "повинен" as `dȯlžėn`, which is what Russian "должны" reaches.
 */
export function correctModalPovynen(sentence: ParsedSentence): ParsedSentence {
  return {
    ...sentence,
    tokens: sentence.tokens.map((t) =>
      t.lemma.toLowerCase() === 'повинний' &&
      sentence.tokens.some((c) => c.head === t.id && c.deprel === 'xcomp' && c.feats['VerbForm'] === 'Inf')
        ? { ...t, lemma: 'повинен' }
        : t,
    ),
  };
}

/**
 * "їм" is two words: the first person of "їсти" ("я їм", Wiktionary's
 * conjugation table) and the dative of "вони" ("to them"). The parser takes
 * the pronoun, so "Я їм яблуко" had no verb ("Ja jim jabloko") where Tatoeba
 * has "Ja jem jabloko" (#1084429 / #13408259). In a sentence with no verb at
 * all whose subject is "я", the dative pronoun cannot be what is missing, so
 * there "їм" is the verb: it becomes the root, "я" its subject, and a noun
 * left over its accusative object.
 */
export function rewriteJimAsVerb(sentence: ParsedSentence): ParsedSentence {
  if (sentence.tokens.some(isVerbal)) return sentence;
  const jim = sentence.tokens.find((t) => t.form.toLowerCase() === 'їм' && t.upos === 'PRON');
  const ja = sentence.tokens.find((t) => t.lemma.toLowerCase() === 'я' && t.feats['Case'] === 'Nom');
  if (!jim || !ja) return sentence;
  const root = sentence.tokens.find((t) => t.head === 0);
  return {
    ...sentence,
    tokens: sentence.tokens.map((t) => {
      if (t.id === jim.id) {
        return {
          ...t, upos: 'VERB', lemma: 'їсти', xpos: 'VERB', head: 0, deprel: 'root',
          feats: { Aspect: 'Imp', Mood: 'Ind', Number: 'Sing', Person: '1', Tense: 'Pres', VerbForm: 'Fin' },
        };
      }
      if (t.id === ja.id) return { ...t, head: jim.id, deprel: 'nsubj' };
      if (t.upos === 'NOUN' && (t.id === root?.id || t.head === root?.id)) {
        return { ...t, head: jim.id, deprel: 'obj', feats: { ...t.feats, Case: 'Acc' } };
      }
      return t.head === root?.id || t.id === root?.id ? { ...t, head: jim.id, deprel: t.deprel === 'orphan' ? 'dep' : t.deprel } : t;
    }),
  };
}

/**
 * "Ukrainian uses the `xcomp:pred` relation to distinguish the cases where
 * `xcomp` is used for secondary predication" (universaldependencies.org/uk/
 * dep/xcomp-pred.html). It IS an `xcomp`, and the engine reads `xcomp`: the
 * predicate adjective of "Всі люди народжуються вільними і рівними" stayed
 * instrumental ("svobodnymi i ravnymi"), where the Russian parse, labelled
 * plain `xcomp`, reaches van Steenbergen's "rodęt sę svobodni i råvni".
 */
export function plainXcomp(sentence: ParsedSentence): ParsedSentence {
  return {
    ...sentence,
    tokens: sentence.tokens.map((t) => (t.deprel === 'xcomp:pred' ? { ...t, deprel: 'xcomp' } : t)),
  };
}

/**
 * The passive participle as the Russian parser gives it: a VERB with
 * VerbForm=Part, from which the Interslavic past passive participle is built
 * ("The passive voice is created by combining a form of the verb byti „to be”
 * with a passive participle", verbs page). The Ukrainian parser makes it an
 * adjective; the parser service has already given it its verb as lemma
 * ("наділені" -> "наділити"), and here it becomes the verb form:
 * "Вони наділені розумом" -> "Oni sut obdarjeni razumom".
 *
 * The impersonal "-но/-то" form - "Будинок збудовано", "Міст було збудовано
 * римлянами" - is the same passive with the noun as its object; the parser
 * marks it Person=0. Interslavic has the personal passive only, so the noun
 * becomes the subject and the participle agrees with it: "Dom jest
 * sbudovany", "Most byl sbudovany".
 */
export function passiveParticiples(sentence: ParsedSentence): ParsedSentence {
  const objectOf = new Map<number, UdToken>();
  for (const t of sentence.tokens) {
    if (t.upos === 'VERB' && t.feats['Person'] === '0' && /(но|то)$/.test(t.form.toLowerCase())) {
      const obj = children(sentence, t).find((c) => c.deprel === 'obj');
      if (obj) objectOf.set(t.id, obj);
    }
  }
  const objects = new Set([...objectOf.values()].map((o) => o.id));
  return {
    ...sentence,
    tokens: sentence.tokens.map((t) => {
      if (t.upos === 'ADJ' && t.feats['VerbForm'] === 'Part' && t.feats['Voice'] === 'Pass' && /ти(ся)?$/.test(t.lemma)) {
        return { ...t, upos: 'VERB', feats: { ...t.feats, Tense: 'Past', Variant: 'Short' } };
      }
      const obj = objectOf.get(t.id);
      if (obj) {
        const { Person: _p, Mood: _m, ...feats } = t.feats;
        return {
          ...t,
          feats: {
            ...feats, VerbForm: 'Part', Voice: 'Pass', Tense: 'Past', Variant: 'Short',
            Number: obj.feats['Number'] ?? 'Sing', ...(obj.feats['Gender'] ? { Gender: obj.feats['Gender'] } : {}),
          },
        };
      }
      if (objects.has(t.id)) return { ...t, deprel: 'nsubj:pass', feats: { ...t.feats, Case: 'Nom' } };
      // "було" with an impersonal passive is now a passive auxiliary (UD's
      // `aux:pass`, as the Russian parser labels "была приготовлена"), and
      // agrees with the new subject.
      const subject = t.deprel === 'aux' ? objectOf.get(t.head) : undefined;
      if (subject && t.lemma.toLowerCase() === 'бути') {
        return {
          ...t,
          deprel: 'aux:pass',
          feats: { ...t.feats, Number: subject.feats['Number'] ?? 'Sing', ...(subject.feats['Gender'] ? { Gender: subject.feats['Gender'] } : {}) },
        };
      }
      return t;
    }),
  };
}

/** `token` inserted right after the token `afterId`, every later id moved up by one. */
function insertAfter(sentence: ParsedSentence, afterId: number, token: Omit<UdToken, 'id'>): ParsedSentence {
  const shift = (id: number) => (id > afterId ? id + 1 : id);
  const tokens: UdToken[] = [];
  for (const t of sentence.tokens) {
    tokens.push({ ...t, id: shift(t.id), head: shift(t.head) });
    if (t.id === afterId) tokens.push({ ...token, id: afterId + 1, head: shift(token.head) });
  }
  return { ...sentence, tokens };
}

/**
 * "якби" is one word for "if" + the conditional: "Univerbation of як (jak,
 * “if”) + би (by, subjunctive particle)" (Wiktionary). Russian writes the two
 * apart, "Если бы я знал", which the conditional rule reads as "ako" + "byh";
 * fused, the clause lost its conditional - "Ako by ja jesm znal" for "Якби я
 * знав". So it is given back the shape the Russian parse has: "якщо" ("if")
 * as the mark and "би" as a conditional auxiliary of the same verb.
 */
export function splitJakby(sentence: ParsedSentence): ParsedSentence {
  const jakby = sentence.tokens.find((t) => t.lemma.toLowerCase() === 'якби' && t.deprel === 'mark');
  if (!jakby) return sentence;
  const marked = {
    ...sentence,
    tokens: sentence.tokens.map((t) => (t.id === jakby.id ? { ...t, lemma: 'якщо' } : t)),
  };
  return splitJakby(insertAfter(marked, jakby.id, {
    form: 'би', lemma: 'би', upos: 'AUX', xpos: 'AUX', feats: { Mood: 'Cnd' }, head: jakby.head, deprel: 'aux',
  }));
}

/**
 * A cardinal the parser tags as a verb. "У мене п'ять братів" came out with
 * "п'ять" a VERB and "братів" its object, so nothing counted the brothers and
 * the clause lost its copula ("U mene pet bratov"). A word in the Ukrainian
 * numeral table (numerals.ts) is a numeral: it counts its "object", and with
 * "у мене" the clause takes the shape the Russian parse gives "У меня пять
 * братьев" - "у меня" the predicate, the counted noun its subject - for the
 * copula rule: "U mene sut pet bratov".
 */
export function numeralsTaggedAsVerbs(sentence: ParsedSentence): ParsedSentence {
  const num = sentence.tokens.find(
    (t) => t.upos === 'VERB' && numeralValue(t.lemma, t.form, 'uk') !== null,
  );
  if (!num) return sentence;
  const counted = children(sentence, num).find((c) => c.deprel === 'obj' && c.upos === 'NOUN');
  if (!counted) return sentence;
  const place = children(sentence, num).find(
    (c) => c.deprel.startsWith('obl') && children(sentence, c).some((g) => g.deprel === 'case'),
  );
  const head = place ?? counted;
  return {
    ...sentence,
    tokens: sentence.tokens.map((t) => {
      if (t.id === num.id) {
        return { ...t, upos: 'NUM', xpos: 'NUM', head: counted.id, deprel: 'nummod', feats: { Case: counted.feats['Case'] ?? 'Nom', NumType: 'Card' } };
      }
      if (t.id === head.id) return { ...t, head: num.head, deprel: num.deprel };
      if (place && t.id === counted.id) return { ...t, head: place.id, deprel: 'nsubj' };
      return t.head === num.id ? { ...t, head: head.id } : t;
    }),
  };
}

/**
 * A Cyrillic word the parser calls foreign. It tags "ґей" (Tatoeba "Ти ґей",
 * "Я ґей") `X` with Foreign=Yes - the letter ґ is rare in its training text -
 * and an `X` gets no case at all, so the form was picked blind: "Ty jesi
 * gejem" for Tatoeba's "Ty jesi gej" (#5144734 / #12985202). Written in the
 * Ukrainian alphabet it is not foreign; as the subject or the predicate of a
 * verbless clause it is a nominative noun.
 */
export function cyrillicIsNotForeign(sentence: ParsedSentence): ParsedSentence {
  return {
    ...sentence,
    tokens: sentence.tokens.map((t) =>
      t.upos === 'X' && t.feats['Foreign'] === 'Yes' && /^[\u0400-\u04FF'’ʼ-]+$/.test(t.form) &&
      (t.deprel === 'root' || t.deprel.startsWith('nsubj'))
        ? { ...t, upos: 'NOUN', xpos: 'NOUN', feats: { Case: 'Nom', Number: 'Sing' } }
        : t,
    ),
  };
}

/**
 * "У мене багато книжок": the parser makes the quantifier "багато" the root,
 * with the counted noun its subject and "у мене" hanging off it, so the copula
 * went inside the quantity - "U mene mnogo sut knig". The clause has the
 * shape of "У мене п'ять братів" (above): "у мене" is the predicate and the
 * quantity of books its subject - "U mene sut mnogo knig".
 */
export function quantifierAsRoot(sentence: ParsedSentence): ParsedSentence {
  if (sentence.tokens.some(isVerbal)) return sentence;
  const root = sentence.tokens.find((t) => t.head === 0);
  if (!root || !['DET', 'NUM'].includes(root.upos) || root.feats['NumType'] !== 'Card') return sentence;
  const counted = children(sentence, root).find((c) => c.deprel.startsWith('nsubj') && c.upos === 'NOUN');
  const place = children(sentence, root).find(
    (c) => c.deprel.startsWith('obl') && children(sentence, c).some((g) => g.deprel === 'case'),
  );
  if (!counted || !place) return sentence;
  return {
    ...sentence,
    tokens: sentence.tokens.map((t) => {
      if (t.id === place.id) return { ...t, head: 0, deprel: 'root' };
      if (t.id === counted.id) return { ...t, head: place.id, deprel: 'nsubj' };
      if (t.id === root.id) return { ...t, head: counted.id, deprel: 'det' };
      return t.head === root.id ? { ...t, head: place.id } : t;
    }),
  };
}

export function rewriteUkrainian(sentence: ParsedSentence): SourceRewrite {
  if (sentence.lang !== 'uk') return { sentence, absorbed: [] };
  const comparison = rewriteComparisonStandard(
    rewriteSyntheticFuture(correctImperatives(correctModalPovynen(rewriteVerblessOrphan(rewriteJimAsVerb(passiveParticiples(plainXcomp(splitJakby(quantifierAsRoot(numeralsTaggedAsVerbs(cyrillicIsNotForeign(sentence))))))))))),
  );
  const clock = rewriteClockTime(comparison.sentence);
  return { sentence: clock.sentence, absorbed: [...comparison.absorbed, ...clock.absorbed] };
}
