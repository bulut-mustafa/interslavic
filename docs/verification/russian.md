# Russian as a source language

The Russian source side: what was checked, the rounds of fixes, and how Russian was verified without a Russian speaker.

Part of the [verification log](../verification-log.md). Entries are in the order they were written; the date of each is in its heading.

---

## The Russian source side, verified (2026-10-20)

`CORRECTED`. Russian input had **two fixtures** and no systematic check, while
everything else so far had been English-side. An audit of ordinary Russian
sentences found eleven defects. Most share one cause: **a rule stating an
INTERSLAVIC fact was gated to `lang === 'en'`**, so Russian never reached it.
There were 15 such gates; some are genuinely English-specific (articles,
do-support, phrasal particles, infinitival "to"), and these were not.

### The Russian gloss column was parsed worse than the English one

An earlier audit said so and it was still true: `ruGlosses` was a bare
`split(',')` while English had a parenthesis-aware splitter. 35 rows were cut
inside a parenthesis, producing keys nothing can match:

```
lěkaŕ   ru=врач, доктор, лекарь (разг., устар.)   ->  key "лекарь (разг."
```

**72 senses produced an unusable key and 9 entries were left with none at
all** - including `oni`, whose cell is "они (муж. род, смешанный род)" where
every comma is inside the parenthesis. So Russian **"они" ("they") could not be
looked up**, while every other personal pronoun could. Fixed by using
`parseGlosses`, which also gives the Russian column sense labels for the first
time.

### `ты` and `вы` are not the same word

The T-V rule returns the unmarked `vy` for any second person, which is right
from English - "you" marks neither number nor register, so `ty` would assert an
intimacy the source does not contain. Russian states it: `ты` is Person=2
Number=Sing, `вы` is Number=Plur. Forcing `vy` both discarded that and made the
verb plural, because `personalPronounNumber('vy')` is Plur: "Ты читаешь" came
out as "Ty čitajete".

Threading the flag by hand reached **one of six** call sites, so it lives on the
source adapter and one helper consults it.

### Russian and Interslavic govern numerals differently

The numeral phase **never ran for Russian at all**: it tested `deprel !==
'nummod'` and Russian uses the subtype `nummod:gov`. An exact deprel comparison
is wrong wherever a subtype carries the same relation, so `baseDeprel()` now
strips it - which also let the numeral agree in gender, since `AGREEING_DEPRELS`
missed `nummod:gov` too.

That exposed the real question. Russian writes "два брата" with a genitive
singular and "пять братьев" with a genitive plural; Interslavic uses the
nominative plural after 2-4 and the genitive plural after 5. **The source's case
is an artefact of the source's own numeral syntax and does not transfer**, so it
is discarded and inferred from the syntactic role - the same cascade English
uses.

Two things were measured rather than assumed here:

- UD's `nummod:gov` subtype, which means exactly "the numeral governs the case
  of its noun", looked like the right signal. **Stanza applies it
  inconsistently** - "два брата" is `nummod:gov` and "три книги" plain
  `nummod`, both in the paucal genitive - so the test is "counted by a numeral
  of 2 or more" instead. `jedin` is excluded because it agrees rather than
  governs.
- Discarding the case broke obliques: "с тремя книгами" became "s tri knigy".
  With a preposition the case the source marks is the PREPOSITION's, which does
  transfer - Russian prepositions are deliberately not planned, precisely
  because the source states the case. So the rule applies only where no
  preposition governs the noun.

### Russian omits the present copula; Interslavic writes it

"Он доктор" has no verb at all. Every example on the syntax page writes one -
"Petr jest ščestliv", "dom jest velik", "Tuto avto ne jest drago" - so it is
inserted, agreeing with the subject. The absence of a `cop` dependent IS the
present tense: a Russian past or future copula is present in the parse ("Еда
БЫЛА приготовлена"), so those are untouched.

Placement took two corrections. Keyed to the predicate's head it landed inside
the phrase ("On najlěpši jest student"); the subtree walk then swallowed the
SUBJECT, which hangs off the predicate, making the subject the leftmost word;
and the leftmost word can itself be deleted. It is now keyed to the first
SURVIVING node of the predicate phrase.

This also improved a sentence it was not aimed at. "Мы должны уйти" became "My
**jesmo** dolžni ujdti" - and the dictionary's own entry for this is `byti
dȯlžėn` ("have to, ought to"), whose first word is `byti`, so the copula
completes the lexical construction rather than merely satisfying grammar.

### Other gates that were not English-specific

| Was | Now | Cause |
|---|---|---|
| `Otvoriš okno` | `Otvori okno` / `Otvorite okno` | `Mood=Imp` is a UD feature both sources give; only the DEFAULT number was English, and Russian states it |
| `Ona skazala mně čego...` | `...že ona ustala` | the complementizer was matched on the literal lemma "that"; the source lemmas now live on the adapter (`что`) |
| `Hlapčik ktora...` | `Hlapčik ktory...` | `PronType=Rel` is a UD feature; Russian `который` carries it and was reaching the interrogative |
| `My dolžni ujdemo` | `My jesmo dolžni ujdti` | the infinitive rule required a `mark`, which is English's "to"; Russian writes a bare infinitive and states `VerbForm=Inf` |
| `Ja jesi čitaju knigu` | `Ja budu čitati knigu` | `буду` is AUX with lemma `быть`, which the English will/shall table never saw. The infinitive distinguishes it from the past copula |
| `Sama veliky dom` | `Največši dom` | Russian's analytic superlative `самый` is a separate word; Interslavic prefixes `naj-` to the comparative |

### Still open on the Russian side

| Item | Why |
|---|---|
| `письмо` → `pisanje` ("writing") rather than `piśmo`/`dopis` ("letter") | three entries carry "письмо" with no disambiguation and **9 frequency points** between them; same irreducible class as `party` |
| `маленький` → `malenjky` ("tiny") rather than `maly` ("small") | the Russian column is coarser than the English one: "маленький" is `malenjky`'s only gloss and `maly`'s second, so gloss position decides. Not wrong, just narrower |
| `по-русски` untranslated | no entry; the adverb is absent from the dictionary |
| verbless relative clauses | **a Stanza mis-parse**, not ours: "Мальчик, который живёт там, мой дядя" attaches `дядя` as a `conj` of `Мальчик`, reading it as coordination, so there is no predicate to insert a copula for |
| predicative `больше` | Stanza tags it ADV, so the adverbial comparative `veče` is produced where the adjective `vęčši` is wanted. Russian does not distinguish the two forms |

### A process note, because it cost real work

The mutation audit **snapshots every file it mutates and restores that
snapshot**. Editing a source file while it runs loses the edit: the Russian
gloss fix was silently reverted mid-run and only noticed because
`lookup('они')` started returning `[]` again after having worked. Nothing before
the audit launched was affected. Do not edit audit targets while it runs.

---

## The Russian source side, second round (2026-10-20)

`CORRECTED`. A sweep of 40 ordinary Russian sentences across aspect, voice,
mood, comparison, numerals and impersonals. The first round fixed the rules
that were gated to English; this round found defects in rules that ran but got
Russian wrong.

| Was | Now | Cause |
|---|---|---|
| `Jestli by ja jesm znal` | `Jestli byh ja znal` | `бы` is AUX with **`Mood=Cnd`**, a UD feature, and was reaching the lexical path - so the conditional `by` AND the compound-past `jesm` were both emitted |
| `On vzel nju knigu` | `On vzel jegovu knigu` | `его` is `Poss=Yes` but ranked below an oblique personal form; the dictionary has `jegov` and the pronouns page writes "jegovu knigu" |
| `U mene ne brata` | `U mene nema brata` | `нет` as a VERB is the negative existential; the interjection `ne` ("no") is far more frequent and was winning |
| `Mně zimna` | `Mně zimno` | a predicate adjective with NO subject is impersonal, and the gender fell out of a tie-break |
| `Kniga читается legko` | `Kniga čitaje se legko` | Stanza lemmatises it `читаться`, which is no dictionary headword |
| `Dom buduje rabotnikami` | `Dom buduje se rabotnikami` | a reflexive passive came out as a plain active |
| `na dva rokov` | `na dva roky` | the noun kept Russian's paucal genitive inside a prepositional phrase |
| `bystro` for "быстрее" | `bystrěje` | see below - not a Russian bug at all |
| `veče togo doma` | `veče od togo doma` | Russian marks the standard of comparison by case alone |
| `prijaje se` | `podobaje se` | `нравиться` is itself a headword, `podobati sę` |

### Two of these were not Russian bugs

**Adverbs lost their comparison entirely.** An adverb is `indeclinable`, so it
took an early return *before* the `Degree` block, and again before realisation.
A comparative is a different LEMMA (`bystro` -> `bystrěje`), not an inflected
form, which is exactly why an indeclinable can carry one. **Any English
comparative adverb - "faster", "sooner" - had the same bug**; it never surfaced
because the English fixtures only contain `more`, which works by lexical lookup
rather than derivation.

**And the inverse.** "больше" is its own lemma, so the entry it matches (`veče`,
glossed "more") is already a comparative and deriving again gave `večeje`. The
test is whether the source marks the degree on a DIFFERENT stem - "быстрее" has
the lemma `быстро` and "старше" has `старший`, so both derive. The same test
handles English "bigger" (lemma "big") against "more" (its own lemma).

### Three first attempts that measurement rejected

- **`Voice=Mid` is not a reliable signal for a reflexive.** Stanza marks
  `стала` Mid though it carries no `-ся` at all, so keying the clitic on it gave
  "Ona stala **se** lěkarem". The source FORM's own suffix is the signal.
- **Stripping `-ся` must be a FALLBACK, not a preference.** `нравиться`,
  `бояться` and `учиться` are all dictionary headwords (`podobati sę`, `bojati
  sę`, `učiti sę`); stripping first turned `нравиться` into `нравить`, which
  found the weaker `prijati`. Entries that already carry the clitic also made
  "Ja boju **se se** psa".
- **`od` fired where a preposition already governed the phrase**, giving "na dva
  **od** roky". It now applies only to a bare genitive.

### The numeral rule got simpler

The first round discarded the noun's source case and re-inferred it, with a
carve-out for prepositions. One rule replaces both: **a noun counted by a
numeral takes the NUMERAL's case.** The source marks the numeral correctly in
every position - any preposition governs the numeral, and the numeral then
governs the noun:

```
два брата        Nom + Gen.Sing   ->  dva brati        (Nom.Pl)
три книги        Acc + Gen.Sing   ->  tri knigy        (Acc.Pl)
на два года      Acc + Gen.Sing   ->  na dva roky      (Acc.Pl)
с тремя книгами  Ins + Ins        ->  s trěmi knigami  (Ins.Pl)
```

All four from one rule, where copying the noun's case gave "dvě brata", "trěh
knig" and "na dva rokov". The NUMBER still comes from the numerals page, and
for 5-and-up its case government overrides.

### A ranking change with a measured side effect

A trailing reflexive clitic no longer counts as a second word for the
single-word preference, which is what had pushed `podobati sę` below `prijati`.
That also moved "устала" from `ustala` to `umorila se` - **both** are glossed
"get tired" and the dictionary lists `устать` for both, so it is lexical
variation, not a change of meaning. Recorded because the test expectation had
to move with it.

### Housekeeping found along the way

- The killed audit had left `case.fallback` reporting `certain` instead of
  `guess`. Restored.
- The inserted copula was marked `validation: 'unvalidated'`, which made the
  validation rate report a problem that did not exist - the whole point of that
  number is that an unvalidated word is a form we cannot vouch for.
- A test of mine built the 743k-form index inside the test body and hit the 30s
  timeout. Module scope, as `validation.test.ts` already does.

### The audit now recovers from being killed

Three separate kills left a mutated file in the working tree. The script had an
`EXIT` trap, but an out-of-memory watchdog sends SIGKILL, which cannot be
trapped. The backups now live at a fixed `.mutation-backup/` (gitignored)
instead of `mktemp -d`, the trap covers `INT TERM HUP` as well, and **the next
run restores any leftover before doing anything else**, reporting what it
recovered. Verified by simulating a kill.

### Still open on the Russian side

| Item | Why |
|---|---|
| `Ona čitaje bystrěje mene` - no `od` | Stanza attaches the standard of comparison to the VERB as an `obj` here, which is indistinguishable from a real direct object. Only an `obl` in the genitive under a `Degree=Cmp` head is safe |
| `Jest čija tutoj kniga?` | word order and the demonstrative's gender; Russian marks gender on `это` but it is not copied to non-nouns |
| `Děti ktore ja jesm viděl` | the relative pronoun needs the antecedent's animacy, and animacy is only marked on masculine nouns in the dictionary |
| `aby` for `чтобы` | the purpose clause wants `da by` + conditional; the conditional now works, the conjunction does not |
| `Чем больше, тем лучше` | `тем` untranslated; an idiomatic correlative |

### Two findings from surviving mutations (2026-10-21)

The 15 mutations added for the second Russian round left **2 survivors**, and
both were worth having.

**An inserted word was silently dropped before an indeclinable.** The
`insertedPrepositions` and `insertedCopulas` emission sat AFTER the
`entry.pos.indeclinable` early return in the output loop. Inserted words
precede the word they attach to, so whenever that word was a preposition or an
adverb the insertion vanished. That is why the second `od` in "starějši od mene
na dva roky" never appeared - and it masked the mutation, making the guard that
suppresses it look inert. Both blocks now run before any branch that can
`continue`. Current output is unchanged, because the guard still suppresses
that particular case; the bug was latent.

**The strip-as-fallback guard looked like dead code and is not.** Disabling it
changed nothing across 40 Russian sentences, because `нравить` and `боять` do
not exist (so stripping dead-ends anyway) and `учиться`/`учить` happen to
surface identically. Measured over the dictionary, **217 Russian reflexive
glosses resolve to one Interslavic stem whole and a DIFFERENT one stripped**:

```
мучиться  -> agonizovati ("suffer")     мучить  -> mųčiti ("torture")
иметься   -> byti                       иметь   -> iměti
беречься  -> čuvati sę ("take care")    беречь  -> ščęditi
```

So strip-first would turn "He suffers" into "he tortures himself". A fixture
pair now pins it: `on-muchitsja` -> "On agonizuje se" against
`on-muchit-sobaku` -> "On muči psa".

---

## Verifying Russian without a Russian speaker (2026-10-21)

`VERIFIED`. The question was whether the Russian side is as good as the
English one, with nobody available to judge Interslavic by eye. The instrument
is **mutual corroboration**: translate the same 30 meanings from English and
from Russian and compare. The two source paths share no lemma lookup, case
handling or auxiliary logic, so agreement is independent evidence and every
disagreement is a lead.

```
en:  122 words   certain 75.6%  high 13.2%  default  8.1%  guess 3.1%
ru:  119 words   certain 87.9%  high  8.6%  default  3.2%  guess 0.2%
both: 0 unvalidated forms, 0 untranslated words
```

**Russian is measurably more certain than English, and for a principled
reason**: it states case and aspect explicitly, so the engine copies where
English must infer. Its `guess` rate is 0.2% against English's 3.1%.

12 of 30 pairs are byte-identical. The other 18 break down as:

| cause | n |
|---|---|
| the two source sentences genuinely differ (my pairs are not perfectly parallel - "her brother" vs "брату") | 4 |
| both sanctioned by the grammar as equally correct (genitive of negation, `do školy`/`v školu`, imperative number, `musěti`/`byti dolžen`) | 5 |
| documented gloss asymmetry, both valid (`hlapec`/`hlapčik`, `maly`/`malenjky`) | 2 |
| English past aspect is an honest `guess` and Russian states it (`běgl`/`poběgl`, `prihodil`/`prišel`) | 2 |
| lexical variation, same gloss (`kazati`/`skazati`) | 1 |
| Russian is better (`v boljnici` over `na boljnici`; instrumental after "become") | 2 |
| English is better (`tutoj` for "this" over `toj`) | 1 |
| **real defects** | **2** |

### The two real defects it found - one on each side

**English, and it was a regression I had introduced.** "The food was prepared by
my grandmother" came out as `Jeda byla sbirati se od mojej baby` - an infinitive
reflexive where a participle belongs. The transitivity signal added earlier was
penalising every `v.tr.` candidate because the clause has no direct object - but
**a passive has no object because the patient was promoted to subject**, not
because the verb is intransitive. So `gotoviti` (v.tr.) lost to `sbirati sę`
(v.refl.). Transitivity is now only consulted in an active clause.

**Russian: a verbless clause with a non-nominal root got no copula.** "Где
станция?" has an ADV root, which predicate agreement never looks at, so it came
out as `Kde stancija?` while English - whose source supplies "is" - gave `Kde
jest stancija?`. The copula insertion moved into its own pass covering any
verbless clause, which also supplied the copula in "Этот дом больше" and in the
impersonal "Мне холодно" (`Mně jest zimno`), matching the corpus's "trěba jest"
and "Nužno jest".

Placement took four measured attempts and is worth recording, because each
earlier one looked right:

```
keyed to the predicate head        ->  On najlěpši JEST student
keyed to the phrase's first word   ->  JEST kde stancija?
shifted by one word                ->  U SUT mene dva brati
excluding every nsubj from the      ->  Kniga ktoru JEST ja čitaju interesna
  opening constituent
after the opening constituent       ->  all five correct
```

### An aspect experiment, measured and rejected

Three of the English disagreements are past aspect: `aspect.pastTelic` only
fires on a direct OBJECT, so it misses "ran into the house" and "came with a
friend", and English falls to the imperfective default at `guess`. The Russian
sources mark all three perfective, which is real evidence for the telic
reading.

Widening the cue to "a past motion verb is bounded" fixed those and two
fixtures with no gold regression - and broke the durative and habitual
readings, which are common:

```
I ran for an hour.      ->  Ja jesm POBĚGL časinu.     (should be imperfective)
She ran every morning.  ->  Ona POBĚGLA každo utro.    (should be imperfective)
```

Reverted. Doing it properly means the full telicity diagnostic - a goal phrase
bounds the event, a durative or frequency adverbial unbounds it - and half of
that produces confident wrongness in the commoner case. English past aspect
stays an honest `guess`, which is what the label is for. **Russian does not
have this problem at all, because it states aspect.**

---

## The same checks from Russian

26 Russian sentences mirroring the English fixes. Most English rules are not
needed from Russian, because Russian states the thing itself: в/на ("Ona jest v
školě", "na stanciji"), за/для ("za pomoč", "dlja tebe"), aspect ("izgorěl", "ostal",
"Otvorite", "kupiti") all came out right. Three gaps were Russian too:

- **Phrase and formula lookups were English-only**, though the dictionary has 2,271
  Russian multi-word glosses. Now both languages: "Не за что" -> "Nema za čto", "С днём
  рождения!" -> "Ščestnogo dnja rodženja!", "Большое спасибо" -> "Velika hvala", "Как
  дела?" -> "Kako se imate?" (formulas.json keys the same sourced forms by Russian).
  A one-word sentence can be a formula ("Спасибо!" -> "Hvala!"), and a root that became
  a formula takes no inserted copula ("Jest Kako se imate?"). No existing Russian
  fixture changed - the lookup found no false matches.
- **An extra `se` on reflexive verbs.** Every Russian -ся verb got the clitic, even
  where the dictionary lists the reflexive verb itself with a non-reflexive gloss:
  "остался" -> "ostal se", "длилась" -> "trval se". The clitic is now owed only when the
  verb was found WITHOUT -ся ("читается" via "читать"). "мучиться" -> `agonizovati`
  (v.intr.) lost its `se` accordingly.

Not ours, left: "Льёт" is lemmatised by the parser as "листить" (dictionary has
лить -> liti); "состояться" is not in the dictionary's Russian column; "работа" ranks
`dělo` first among the dictionary's five.

---

## Clock times, and "работа" from Russian

**Clock times.** "at" + a time came out with the locative `na` ("Ja vstavaju na
sedmi", "na polnoči", "na 8 o'clock"). No grammar page covers it; the corpus writes
"v 9:15", "v 20:00", "v poldenj" (Wp/isv), and Russian, Czech, Croatian and Bulgarian
all use "in" + accusative (Polish "o" is the exception) - the majority principle of
grammar.html. Now "at" + a number, noon, midday or midnight is `v` + accusative, and
"o'clock" after a number is absorbed (Interslavic has no such word). "v sedm" now
matches the Russian "в семь".

**"работа" -> dělo.** Not a Russian ranking defect: on 60 common words Russian and
English pick the same lemma 50 times, and where they differ the Russian choice is
usually the more precise (время -> čas, рука -> rųka). The dictionary lists `dělo`
first for "работа"; English "at work" reached `råbota` through a curated, cited rule
("work one goes to, is at or comes from is the job"; van Steenbergen: "Iduči do
raboty"). The same rule now has a Russian entry: работа after на/в/с/из/до ->
`råbota` ("Он на работе" -> "On jest na rabotě").
