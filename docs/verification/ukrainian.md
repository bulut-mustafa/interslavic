# Ukrainian as a source language

The Ukrainian source side, and its re-check against Russian on the same meanings.

Part of the [verification log](../verification-log.md). Entries are in the order they were written; the date of each is in its heading.

---

## The Ukrainian source side (2026-10-30)

`VERIFIED`. Ukrainian held to the checks Russian was held to: the same kinds
of fixtures and tests, the gold mirror, and the cross-check against English.

**The corpus.** 191 Ukrainian sentences, attested first: 87 from Tatoeba (55 of
them linked to an Interslavic translation, which is then the expected output),
Article 1 of the Ukrainian UDHR, and Ohienko's Bible (Gen 11, Mt 6). The rest
mirror a Russian fixture with no attested Ukrainian counterpart; every word of
those was checked against simplemma's Ukrainian form tables. Sources per
sentence: `packages/engine/test/fixtures/parse/uk/SOURCES.md`.

**The parser was the first problem.** Stanza's Ukrainian lemmatizer (UD
Ukrainian-IU) invents lemmas for words it has not seen: "мию" → "мияти", "вірю"
→ "вірти", "Відчини" → "відчити", "правах" → "правох". Its character-LM variant
and the ParlaMint models were measured on the corpus and were no better ("тобою"
→ "тиба"). The parser service now replaces a lemma that is not a real Ukrainian
lemma, using simplemma's tables (MIT; data ODbL / CC BY 4.0); a real one is
kept. Russian never needed this. Self-test: `npm run parser:test`.

**Rules, each from a source:**

| change | source |
|---|---|
| A Slavic preposition takes the Interslavic candidate that governs its noun's case (у школі `v`, у мене `u`, з тобою `s`); a one-case preposition imposes it (про + acc → `o` + loc) | the dictionary's (+N) codes; prepositions page |
| A verbless clause the parser marks `orphan` (and Russian "Она с ним", `nmod`) gets its copula | UD `orphan` definition; Tatoeba "Ona jest s njim" |
| Imperative person and number from the ending; the first person plural ("наробімо" → *nadělajmo*; Russian "построим" → *sbudujmo*) | Wiktionary conjugation tables; verbs page "dělajmo"; his Babel |
| The synthetic future ("читатиму") and the perfective present are *budu* + infinitive | Граматика української мови (2007); verbs page |
| "якби" is "if" + the conditional: *Ako byh ja znal* | Wiktionary (univerbation of як + би) |
| "щоб"/"чтобы" clauses: *že/da by* + the conditional, no *jesm* | syntax page; Tatoeba #13357375, #13910036; his Babel "da by" |
| The standard "за"/"від" → *od* + genitive | Ukrainian school grammars (bare genitive is an error); existing *od* rule |
| "о сьомій (годині)" → *v sedm* | Wiktionary "о" after Bilodid's СУМ; existing clock rule |
| Passive participles get their verb; the impersonal "-но/-то" passive becomes the personal one (*Dom jest sbudovany*) | verbs page, passive voice |
| A comparative is looked up by its positive; an `adj.comp.` entry is not graded again | Ukrainian -ш-/-іш- formation; adjectives page |
| Curated words mirroring the Russian ones (*jedin drugomu*, *jegov*, *nema*, *råbota*) | pronouns and verbs pages; Wiktionary |
| Formulas: як справи, дуже дякую, як тебе звати | as the Russian ones; Tatoeba #12987096 "kak on se imenuje" |
| 22 words the Ukrainian column lacks (вокзал, книжка, кузен, залишитися…), each attached to an existing entry | Wiktionary + the entry's own row; `lexicon/data/source-supplement.json` |

The Ukrainian column misses 4.6% of Tatoeba's Ukrainian word tokens (its 5,000
most frequent lemmas). Looking a missing word up in the Russian column was
measured and rejected: where both columns have a word they agree 97.7% of the
time, but the fallback would reach only 33 of the 1,029 missing lemmas.

**Measured.** 46 Tatoeba-linked English/Ukrainian pairs - attested translations
of each other, so more parallel than the 30 written for Russian:

```
en:  153 words   certain 71.0%  high 15.8%  default 11.4%  guess 1.8%
uk:  150 words   certain 85.9%  high  9.6%  default  4.6%  guess 0.0%
both: 0 unvalidated forms, 0 untranslated words; 21 byte-identical
all uk fixtures: certain 85.4%, guess 0.1%   (all ru: 82.8%, 0.5%)
```

**A held-out sample**, chosen before any fix: 60 random Tatoeba sentences
with a Ukrainian and an English version, none in the corpus, parsed live:

```
uk:  315 words   certain 86.6%  guess 0.2%  untranslated 17  unvalidated 0
en:  327 words   certain 69.9%  guess 5.5%  untranslated 21  unvalidated 1
```

It found four more defects, fixed with a fixture each: a reflexive synthetic
future the lemma check did not undo ("запізнюватимусь"), forms of "той" left as
their own lemma ("з тим"), a comparative on another stem ("кращий" took
`krasnějši` "more beautiful"; "вищий" gave "vyšnějši") - now looked up by its
positive, from Wiktionary's pairs - and the gender of a past whose subject is
"ти"/"ты" ("ти купила" gave "kupil"; Russian had it too). Most of the rest is
the Tatoeba name "Том" read as the noun "volume", and idioms the dictionary
lacks ("до вподоби", "за кордон").

Of the 27 that differ: 7 keep the *ty* Ukrainian states, 5 keep its pronoun
order (both free in Interslavic), 4 have genuinely different sources, 4 are
better from Ukrainian (*na zabavu* as he writes it, the perfective it states),
3 are equally valid word choices, and **6 were defects, all fixed**: a gendered
past tagged present, a copula in "До завтра!", three missing formulas, and a
predicate "which" in the source's gender.

**Gold.** 16 Ukrainian pairs mirror the Russian ones (his Interslavic is the
target): 12/16, against Russian 11/16. Overall 43/74. The four differences are
classified in `eval/test/gold.test.ts`, all equally valid word choices.

**Russian outputs these changes moved**, each a fix: Babel 4 *sbudujmo …
sdělajmo* (was *sbudujemo*), Babel 7 *Sojdimo … da by* (was *Sojdete … tak
aby*), and two new Tatoeba fixtures, "Она с ним" → *Ona jest s njim* (was
*Ona s jim*) and "Ты купила новую машину?" → *Ty jesi kupila* (was *kupil*).
No English output changed.

**Mutation audit.** 22 of its patterns had gone stale through refactoring
(they no longer matched, so they counted as survivors without testing
anything); all were repointed, and 19 mutations added for the new rules. All
41 run were killed, after one fix: "graded entry graded again" survived because
the positive lookup had made that rule unreachable - removing it changed no
output, so it was removed. `CHECK=1` reports 0 stale of 449.

**Left as they are, with the reason:**
- Words with no Interslavic entry to attach to: Господь and римлянин (Russian
  "Господь" is untranslated too), and Ohienko's archaisms "довги",
  "випробовування".
- Homographs the dictionary itself cannot separate: потяг (train / attraction),
  лист (letter / leaf), північ (north / midnight), дуже (the tie that picks
  *mnogo*).
- Parser errors on attested sentences: "Томе" as a pronoun, "Том" as the noun
  "volume", "собаки" read as a plural.

---

## Re-check: Ukrainian against Russian on the same meanings (2026-10-30)

`VERIFIED`. The cross-check above compared Ukrainian with English. This one
puts Ukrainian and Russian side by side: Tatoeba English sentences that have
BOTH a Ukrainian and a Russian translation, none used before (no sentence ID
in the corpus or any earlier sample), at most eight words, parsed live. Two
independent samples of 60 were drawn with different seeds; the first was used
to find defects, the second only after every fix, to measure.

**Second sample, never tuned on:**

```
uk:  288 words   certain 86.0%  guess 0.0%  untranslated 17  unvalidated 0
ru:  285 words   certain 85.2%  guess 0.1%  untranslated 33  unvalidated 0
en:  300 words   certain 67.9%  guess 4.6%  untranslated 26  unvalidated 0
```

Read output by output, Ukrainian is as good as Russian or better on most of the
60. Where Russian is worse it is mostly words its column lacks ("лжёт",
"заглянул", "беспокою", "по-польски") and a past with the wrong gender ("Том
что-нибудь сделал" → *sdělalo*). The defects both share are dictionary gaps
and idioms ("что ты за человек").

**Defects the first sample showed, each fixed and given an attested fixture:**

| defect | fix and source |
|---|---|
| "Ти там будеш?" → *Ty tam jesi?* | the future copula path took only `cop`; "to be" as the predicate itself takes it too |
| "Чому …?" → *Čego …?* | the adverb "чому" is "why", not the dative of "що" (Wiktionary "чому"); dictionary *začto*/*čemu* |
| "Том та Мері" → *Tom a Meri* | "та" is first "and", syn. і/й (Wiktionary); *i* "and" vs *a* "and, but" (conjunctions page) |
| "може бути раком" → *može jest* (Russian too) | a Slavic infinitive copula stays an infinitive (*može byti*) |
| "Ти допоміг Тому?" → *tomu* | a mid-sentence capital marks a name; the output keeps it (Ukrainian school orthography) |
| "У нас все ще багато часу" → *vse jest ješče mnogo čas* | "все ще" = "still", as the dictionary itself lists it; the quantifier's genitive kept |
| "одне одного" → *jedno drugogo* | the neuter is the mixed-gender reciprocal (Wiktionary usage notes): *jedin drugogo*; supplement row |
| "Будь здоров", "Be careful" → *Jesi zdravo*, *Jest ostražno* (all three languages) | the imperative of *byti* (*bųď, bųďte*), its predicate agreeing with the addressee |
| "Том бреше" → *Tom bere* ("takes") | a verb form simplemma's tables list takes their infinitive (брехати); changes no other fixture |
| "не знає як зав'язувати" → finite *zavezyvaje* | a Slavic infinitive in `advcl` stays an infinitive |
| "на себе" → *na se* | the long reflexive after a preposition (pronouns page), for Slavic sources too |

A first version of the future fix turned "будь ласка" into *bude*, because
`correctRussianFuture` tagged the imperative "будь" future; the imperative is
now excluded. It was caught by the before/after diff over all fixtures.

**Outputs changed elsewhere:** none in English or Russian fixtures. Four
Ukrainian fixtures improved: UDHR Art. 1 *i pravah* (his text has *i*), Babel
4 *i věžu* (Ohienko "та башту"), *To bylo Tom?*, *v Boga*.

**After:** 791 tests pass; all uk fixtures equal their live parse; gold uk
12/16, ru 11/16; all uk fixtures certain 85.3%, guess 0.1% (all ru 82.5%,
0.7%); en↔uk pairs certain 86.0%, 0 untranslated.

**Left:** "тепло" as an adverb (the parser makes "рік" its subject and the
dictionary has no adverb *teplo*); "зараз"/"тепер" take *momentalno*/*dnešnje*
by the dictionary's own ranking (Czech "momentálně" is "currently"); the
possessive "Томову"; words neither column has (впустив/впустил, шнурки).
