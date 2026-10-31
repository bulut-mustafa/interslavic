# Lexicon and word sense

Choosing the right dictionary word: word-sense ranking, the zonal WordNet, the experiments that were measured and rejected, and what the dictionary's own columns (`type`, `intelligibility`) turned out to mean.

Part of the [verification log](../verification-log.md). Entries are in the order they were written; the date of each is in its heading.

---

## Word sense: rejected on a flawed measurement, then shipped (2026-10-18)

This one is recorded in two parts, because **the first measurement was wrong and the
conclusion drawn from it was wrong.**

### The defect

The dictionary marks narrower senses with a parenthesised label - `prati` is
*"wash (clothes), launder"* while `myti` is plain *"wash"* - but `normalizeGloss`
**deletes every parenthetical** before indexing. Both became the key `wash`, and frequency
(5365 vs 5221) handed every "wash" to the laundry verb. 412 bare gloss keys have a
labelled and an unlabelled sense competing this way.

### First measurement, and why it was wrong

Two candidate rules were simulated over the dictionary:

| Rule | Winners changed | First verdict |
|---|---|---|
| flat +8 penalty on a labelled sense | 119 | rejected |
| 25% frequency discount | 34 | rejected |

Both looked like 60/40 improvements - `wash`→`myti` and `cup`→`čaša` good, but
`note`→`zapisati` (a verb), `youth`→`mlådežny` (an adjective), `record`→`naigrati` (a verb)
bad - so the idea was written off.

**The simulation was POS-blind.** `compareEntries` penalises a part-of-speech mismatch by
**+1000**, which dominates every other term, so a noun source word never competes against a
verb candidate in the first place. Half the "regressions" could not occur.

### Second measurement, with part of speech held constant

30 flips, and the quality is not 60/40 at all:

- **better:** `wash`→`myti`, `flood`→`potop` (was "flood of tears"), `leave`→`ostaviti`
  (was "leave by transport"), `reservation`→`rezervacija` (was a nature reserve),
  `sketch`→`skica` (was a comedy sketch), `relief`→`oblėgčeńje` (was the artwork),
  `medicine`→`lěk`, `cup`→`čaša` (was a sport trophy), `knight`→`rycaŕ` (was the chess
  piece), `disorder`→`neporędȯk`, `draft`→`skica`
- **neutral:** `pawn`, `record`, `term`, `subject`, `shaft`, `whistle`, `swear`, `cast`
- **worse: exactly one** - `doctor`→`lěkaŕka`, a *female* doctor

### The one regression had its own cause, and its own documented fix

`lěkaŕka` ("doctor", f.) competes with `lěkaŕ` ("physician, doctor", m.anim.) on equal
terms. The word-formation page is explicit about what these forms are:

> "The female equivalent of the endings -nik and -ec is -nica and -ica respectively [...]
> In other cases, we rather use the ending **-ka for female equivalents of male persons**:
> *prijatelj* 'friend' > *prijateljka* 'girl friend'"

So the masculine is the base and the feminine is the marked member. English "doctor" and
"teacher" mark no gender, so they should select the base.

**The test has to be narrow.** A blanket "prefer masculine over feminine" was measured and
is badly wrong - it would give `gad` for "snake" instead of `zmija`, `načeľnik` for "head"
instead of `glåva`, `krasavėc` for "beauty" instead of `krasa`. What ships demotes a
feminine candidate **only when it is derivable from a masculine candidate that is actually
present**, by the page's own suffix rules including the documented consonant change
(`k/c > č`, `g > ž`, `h > š` before `-ka`). That is 104 gloss keys, and it changes 5
winners, all of them correctly: `blonde`→`blondin`, `bore`→`dȯlgočasnik`,
`cosmetician`/`beautician`→`kosmetik`, `successful person`→`uspěšnik`.

With both rules in place, `doctor` resolves to `doktor` again - the regression is gone.

### What shipped

- A **frequency discount, not a point penalty.** It must be a discount because frequency is
  only consulted when scores tie, so one penalty point would override a 10,000-point
  frequency gap. That is precisely why the flat penalty flipped 119 keys.
- A label is discounted **only when the source does not support it**. The sentence's content
  words are now passed into the ranker, so the label is treated as evidence rather than as
  a liability:

| Source | Result |
|---|---|
| "I wash **myself**." | **`Ja myju se.`** - no support for "(clothes)", so the general verb |
| "I wash the **clothes**." | **`Ja peru odědžu.`** - "clothes" supports the label, so the laundry verb |
| "I see the flood." | **`potop`**, not `potok` ("flood of tears") |
| "Give me a cup." | **`čašu`**, not `kubȯk` (a sport trophy) |
| "He is a doctor." | **`doktor`** - unchanged, the discount does not override a clear frequency gap |

Gold went 11/29 → **12/29**: g23 "I'm washing myself" now reproduces `Ja myju se` exactly,
and the stale-classification guard in the gold suite is what reported it.

**The lesson worth keeping:** a measurement that omits the dominant term in the scoring
function will mis-rank every alternative. The first conclusion here was not conservative,
it was simply wrong, and shipping nothing would have left a defect in place on the strength
of a bad simulation.

---

## The zonal WordNet: measured and rejected (2026-10-20)

`CORRECTED`. The original design named `medzuslovjansky/database` as the fix for word
sense — 19,337 synsets keyed to the same Steenbergen ids we already load. It
exists exactly as described (schema `schemas/zonal-wordnet.xsd`:
`multilingual-synset` → `synset lang= verified= debated=` → `lemma annotation=`),
and it does **not** fix our word-sense failures. Checked against the actual
failing cases:

| case | what the synsets give | verdict |
|---|---|---|
| `party` | all four synsets carry the bare English lemma `party` — `partija`, `zabava`, `stråna`, `partijny` | **no disambiguation**, same as the TSV |
| `floor` (storey) | `etaž` is glossed `storey`; `floor` is not among its English lemmas in either source | **the gap is a missing English gloss**, which the WordNet replicates |
| `drive`, `leave`, `cook` | companion lemmas do carry sense — `gnati` is "drive, chase", `odhoditi` is "go away, walk away, leave" | real, but needs sentence context we do not have; **transitivity from the TSV separates the cases we can act on**, using data already loaded |

So ingesting 89 MB of unlicensed external data would buy `verified`/`debated`
flags and sense hints that still need context. Not worth it. The clone was
deleted.

**The `coat`/`overcoat` and `floor`/`storey` pattern is the real residual
problem**: a common English word whose Interslavic equivalent exists but is
glossed under a different English word. Fixing it means a source-side English
synonym layer, which is a feature with real false-positive risk, not a lookup
change.

---

## Transitivity was parsed and never used (2026-10-20)

`CORRECTED`. `parse-xpos.ts` had read `transitive` since the beginning and
nothing ranked on it — the same dead-data pattern as the `(+N)` government codes
and `derive()`. English "leave" is two different Interslavic verbs and the
dictionary says which is which:

```
ostavjati   v.tr.    leave, leave behind, abandon
odhoditi    v.intr.  go away, walk away, leave, backtrack
```

"We must leave before midnight" has no direct object, so it was producing
`musimo ostavjati` — "we must abandon".

### The boolean was not enough

`transitive: has('tr.') && !has('intr.')` is also false for `v.refl.` and for
the 78 entries marked only `v.ipf.`/`v.pf.`. Only a **stated** mismatch is
evidence, so `intransitive` was added as its own field. Counts: `v.tr.` 3,411 ·
`v.intr.` 942 · `v.refl.` 606 · unmarked 78. Safe as a plain test — no entry
combines the markers, because the `/` in the notation separates aspects
(`v.tr. ipf./pf.`), never transitivity.

### `v.intr.` does not mean "takes no object"

First measurement caught this. `izběgati (+2)` "avoid" is marked **v.intr.** and
governs a genitive complement, so penalising it for having one handed the
sentence to the reflexive `stråniti sę od`:

```
Ja izběgaju pytanja.            ->  Ja straniti se ERROR2u pytanje.
```

A government code therefore exempts the verb. Measured over 126 fixtures, the
rule then changed exactly two outputs, both improvements:

```
On zabolěl se.        ->  On poranil se.          (poraniti v.tr. "hurt, wound")
musimo ostavjati …    ->  musimo izježdžati …     (a departure, not "abandon")
```

`izježdžati` is "leave (by transport)", so it is narrower than ideal; the
general `odhoditi` loses on gloss position. See the next section for the
experiment that tried to fix that.

---

## An experiment that was measured and reverted (2026-10-20)

`VERIFIED` as a negative result, so it is not retried. `izježdžati` is glossed
"leave **(by transport)**" — a parenthesised sense label that `normalizeGloss`
strips, so it matched bare "leave" at gloss position 0 and beat `odhoditi` at
position 2. The narrow fix tried: treat an **unsupported labelled** gloss as a
non-exact match rather than as a better positional one.

It fixed `leave` and broke "He is a doctor" into the **feminine** `lěkarka`:

```
leave-before-midnight   izježdžati  ->  odhoditi     (better)
he-is-a-doctor          doktor      ->  lěkarka      (worse)
```

Net zero, and a wrong gender is more visibly wrong than an over-specific verb.
Reverted. This is the second time a flat penalty on the sense label has been
measured and rejected — the first flipped 119 gloss keys. The label stays a
discount on frequency, as `effectiveFrequency` documents.

---

## CORRECTED: "`kino` should be indeclinable"

Filed as a dictionary-data defect: `kino` is a borrowing, the dictionary marks
it plain `n.`, so it declined to `kinu` where van Steenbergen writes `v kino`.

That diagnosis was wrong, and the nouns page says so:

> "Borrowed international vocabulary ending in **-e, -i or -u** (f.ex. alibi,
> hobi, intervju, kafe, kakao, kliše, menju, tabu, taksi) and abbreviations are
> indeclinable."
> http://steen.free.fr/interslavic/nouns.html

`kino` ends in **-o**, so it is NOT in that class - it is a regular neuter, and
a regular neuter's accusative equals its nominative. `kino` is already the
correct accusative without any indeclinability.

The real cause was on the SOURCE side. Russian кино is indeclinable *in
Russian*: one form for all seven cases, so the parser has nothing to read and
guesses. Stanza tags "идти в кино" as `Case=Loc` when the sense is motion into,
i.e. the accusative, and `case.copy` trusted that guess with `certain`
confidence.

VERIFIED fix: `fromSource` in `resolvers/case.ts` refuses to copy a case from a
token marked `InflClass=Ind`. Nothing is lost - the form carried no case - and
the cascade then reaches the preposition's own government, where a motion verb
with a two-case preposition already selects the accusative on a cited rule.

Lesson worth keeping: `copyCase` is only sound where the source form actually
encodes a case. A language that marks case still has words that do not.

---

## VERIFIED: an empty `type` cell behaves like tier 2, not tier 3

`type` is the dictionary's intelligibility tier (official schema
`steenbergen.xsd`): 1 universally intelligible, 2 regionally, 3 single
languages only, 4 Church-Slavonic-derived, 5 a coined neologism, 9 unclear.
Lower is better and `score()` adds it directly, so the default for an empty
cell is a real ranking decision - it covers 799 entries and decides 307
contested gloss keys.

It defaulted to 3. That asserts something the dictionary never said, and lands
those rows in a bucket holding only 469 rows (2.4%), two points behind the 74%
that are tier 1.

The dictionary answers the question itself. Its separate `intelligibility`
column - populated on 19,096 of 19,100 rows, and previously unread - gives a
per-language `+`/`-` verdict. Counting the languages each row marks `+`:

| `type`  | rows   | mean languages marked `+` |
|---------|--------|---------------------------|
| 1       | 14,168 | 7.04                      |
| (empty) | 799    | **5.07**                  |
| 2       | 3,493  | **4.97**                  |
| 3       | 469    | 3.94                      |
| 4       | 30     | 2.77                      |
| 5       | 138    | 4.07                      |

An untyped row is indistinguishable from a tier-2 row on the dictionary's own
measure of exactly the property `type` encodes, and clearly above tier 3. So
the default is 2, read off the data rather than chosen.

Effect: 0 of the 220 fixtures change and the gold score is unmoved, so this is
not an accuracy claim. It is not inert either - re-ranking all 6,355 contested
gloss keys with tier 2 treated as tier 3 moves the top choice on 163 of them
(an upper bound, since it bumps every tier-2 row and not only the untyped
ones), and the movement is toward more widely intelligible words:
`akomodacija` -> `pravka` for "adjustment", `avarija` -> `nesgoda` for
"accident", `aluzija` -> `podkazka` for "hint".

---

## CORRECTED: "`type` is too coarse to rank with"

This log previously dismissed `type`. The official schema documents it as the
language's own intelligibility tier, and the table above shows it tracks a
second, independent column. It is a real signal; what was wrong was the
default applied when it is absent.

---

## VERIFIED: the per-language `intelligibility` marks are a ranking signal (2026-10-24)

The `intelligibility` column marks each word per Slavic language: `+` understood,
`~` partly, `-` not. A word marked `-` in 4 or more languages now loses one score
step to an equal rival (`compareEntries`). Gold 26 -> 28: "car" is `avto` (`-` in no
language) rather than `voz` (`-` in be, ru, sk, uk). The other outputs it moved
were checked one by one; `každy` -> `vsaky` agrees with van Steenbergen's pronoun
page, which gives *"vsaky 'each, every'"* and never uses `každy`.

### Three other signals, measured and rejected

Each was measured on the 49 gold pairs and all fixture outputs, starting from 28/49:

| Signal | Result | Why rejected |
|---|---|---|
| intelligibility as the first tie-break, ahead of frequency | 23/49 | ties are common, so it overrode frequency almost everywhere: `idti` -> `hoditi`, `myju` -> `peru` |
| `frequency` as a weighted score term (one step per 1,000-5,000) | 27/49 at every scale | `dveri` -> `vrata` (loses g29), `dělati` -> `rabiti` against the page's own *Pica dělaje se* |
| `genesis` = `I` (international) as a penalty | 26/49 | gets "party" -> `zabava` but loses `avto`, and "doctor" -> `lěkarka` |

So `frequency` stays the tie-break and `genesis` stays unread. The remaining
word-choice defects (party, floor, drive, fled, visit) are not separable by any
column: for floor, drive and fled the right word is not glossed with that English
word at all.

---

## "-ing" nouns the dictionary lacks

The site's own tagline came out "...pokazyvaje svoje **reasoning** dlja vsakogo slova":
"reasoning" is not a dictionary noun, and an unknown noun was passed through in
English. The class: any English "-ing" noun the dictionary does not list (of 7 tried,
reasoning, cooking and reading failed; swimming, thinking and understanding are listed).

The grammar states the rule: "The act itself is represented by the verbal noun
(gerund), ending on -nje: dělati > dělanje" (word_formation.html; verbs.html on
-nje). Now such a noun is the verbal noun of its verb, imperfective preferred:

```
shows its reasoning     reasoning   ->  razumovanje   (råzumovati "reason")
Her cooking is excellent  Jej cooking jest odličny  ->  Jej kuhanje jest odlično
The reading of this book  Reading ... vzel          ->  Čitanje ... vzelo
```

Only when the noun finds nothing; no existing fixture changed. Noticed, not
fixed: "Thank you for your understanding" gives "Blagodarju vas dlja ..." where
thanks take "za"; "took a week" gives "vzelo" (take) where duration is "trajati".
