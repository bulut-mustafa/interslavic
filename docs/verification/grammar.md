# Grammar and constructions

Grammar rules and constructions, as they were built and checked: reflexives, modals, coordination, verb government, tenses, aspect, prepositions, expressions translated whole and the audit of the clause rules.

Part of the [verification log](../verification-log.md). Entries are in the order they were written; the date of each is in its heading.

---

## Reflexives: `se` and `svoj` (2026-10-18)

Both rules are stated outright on the pronouns page and neither was built:

> "Se is used in reflexive verbs: *Ja myju se* 'I'm washing myself'. If it needs to be
> stressed, the longer form is used: *Ja myju jedino sebe*. After a preposition, it is
> better to use the longer forms: *k mně*, *za tebe*."

> "Whenever the possessor is also the subject of the sentence, the reflexive *svoj* is
> used, no matter whether this subject is in the third person or not: *Ja myju svoje avto*."

| Source | Was | Now |
|---|---|---|
| "He hurt himself." | `On zabolěl **sebe**.` (the stressed form) | **`On zabolěl se.`** |
| "I wash myself." | `Ja peru **myself**.` (raw English) | **`Ja peru se.`** |
| "I am washing my car." | `Ja peru **moj** voz.` | **`Ja peru svoj voz.`** |
| "He gave her his book." | — | **`On dal ... svoju knigu.`** |

`myself` is the one reflexive the dictionary's gloss list for `sebe` omits ("oneself,
yourself, himself, herself, itself, ourselves, yourselves, themselves"), which is why it
alone came through as raw English; the others resolved to `sebe` but to the **stressed**
form where the clitic belongs.

English does not distinguish "his [own]" from "his [someone else's]", so the third-person
`svoj` decision names the alternative in the gloss (`jegov`/`jejin`/`jihny`) rather than
pretending the choice was free of doubt.

### A silent realisation failure behind it

Asking for the clitic did nothing at first, and the reason generalises: **`sebe` has no
`Number` feature at all** - one form serves singular and plural - so requesting
`Number=Sing` matched nothing and realisation fell back to the citation form. That
fallback *looked* like a correct answer and was not a decision at all.

`selectForm` now drops a requested feature that **no token in the paradigm defines**,
because a feature the lexeme does not distinguish cannot select among its forms. Keys that
the paradigm does use still fail loudly, so this does not mask a real mismatch. It is the
same class of bug as the plurale tantum one, found by the same reasoning.

### A vacuous assertion, caught by the audit

The negative test ("don't use `svoj` when the possessor is not the subject") **survived**
its mutation. Under the mutation the output is `Svoj brat imaje dvoh synov.` - capitalised,
because the possessive is sentence-initial - and `toContain('svoj')` is case-sensitive, so
the assertion passed while the rule was entirely disabled. Now compared in lower case, with
a positive assertion (`moj brat`) alongside the negative one.

This is the second vacuous assertion mutation testing has caught in this project, and the
reason the log exists.

### One mutation that could never have applied

The mutation written for that rule used `\n` in a `sed` replacement, which **BSD sed does
not expand** - it would have produced a syntax error rather than a behaviour change, and
been counted as a kill for the wrong reason. Rewritten as a single-line substitution and
verified to apply and be killed. A grep now confirms no remaining mutation depends on `\n`.

---

## A conflict inside the normative source (2026-10-18)

Gold g13 expects `svoje **ključi**`; we emit `svoje **ključe**`, and so does the reference
engine. Checked rather than assumed, and the grammar's own noun page settles it against the
gold sentence:

> "Animate nouns have the nominative plural ending **-i** instead of the ending **-y/-e**
> of inanimate nouns."

with the table giving inanimate soft `kraj` → nom./acc. pl. `kraje`. `ključ` is `m.`
(inanimate) in the dictionary, so `ključe` is table-conformant. `ključi` appears **once**
on the whole site, in that one syntax-page example, and in no paradigm table.

So this is a disagreement between the author's paradigm table and the author's example
sentence - not a defect of ours. Recorded on the gold pair itself so nobody "fixes" the
engine to match it.

---

## Modals: the worst output the engine produced (2026-10-18)

A modal is tagged `AUX` by the parser, and `needsVerbFeatures` tested only for `VERB` and
a copula. So a modal received **no verb features at all** - no person, tense, mood or
VerbForm - and was realised by the longest-form tie-break, while its complement, a bare
infinitive with no `to` to recognise it by, was conjugated as a finite verb.

| Source | Was | Now |
|---|---|---|
| "I can swim." | `Ja **možeše plavaju**.` (an imperfect 3sg) | **`Ja mogu plavati.`** |
| "I could swim." | `Ja **could** plavaju.` (raw English) | **`Ja mogl plavati.`** |
| "He must go." | `On **imaju** ide.` (*imati* = to have) | **`On musi idti.`** |
| "She should read." | `Ona **dolžnogo** čitaje.` (a genitive adjective) | unchanged - see below |
| "We can read." | — | **`My možemo čitati.`** |
| "Father could not find his keys." | — | **`Otec ne mogl nahoditi...`** |

Modals are among the most common things a learner writes, so this was the single largest
accuracy hole in the engine, and raw English in the output is the most damaging form of
wrongness there is: it cannot be mistaken for Interslavic, but it also cannot be trusted.

Four separate causes, each fixed:

1. **No verb features.** A modal is now included in `needsVerbFeatures`.
2. **Complement conjugated.** The infinitive-complement test required a `mark` child
   ("want TO go"), which a modal complement never has. The complement of a modal is now
   an infinitive by rule.
3. **Tense lost.** English marks tense on the modal itself, and Stanza gives `could` no
   `Tense` feature at all, so the plan supplies it: can/may → present, could/might → past.
4. **Person read off the wrong token.** UD hangs the subject off the *main verb*, not the
   modal, so `subjectPerson` found none and defaulted to 3rd singular - "we can" came out
   singular. Person and number now come from the subject of the verb the modal governs.

Negation also had to retarget: `ne` goes before the finite verb, which with a modal **is**
the modal - `Otec ne mogl najdti`, not `Otec mogl ne najdti`.

### Why these are curated, and how "must" was decided

The dictionary marks the right verbs **`v.aux.`** - its own category for auxiliaries - so
the data was always there; ranking simply got it wrong, because `iměti, imati` ("have,
possess", frequency 6214) also carries the gloss "must, have to" and outranked the real
modal. Modals are a tiny closed class used constantly, which is exactly the argument
already made for `function-words.json`, so they are curated with cited evidence rather
than ranked.

`musěti` over `morati` was decided on **the dictionary's own `intelligibility` column** -
a field this project had never read:

| | positive in | negative in |
|---|---|---|
| `musěti` | be, cs, hr, pl, sk, uk (**6**) | bg, ru, sr |
| `morati` | hr, sr (**2**) | be, bg, cs, pl, ru, sk, uk |

This is the first use of that column, and it decided a real choice that frequency would
have got wrong. It is direct evidence for reading the other ignored per-language fields.

### Deliberately left broken

`should`, `ought to`, `would` and `shall` are **not** in the table. Their natural
Interslavic needs the conditional (`by` + l-participle) or the predicate adjective
`dȯlžny`, neither of which is built. Guessing a finite verb for them would produce
confident nonsense, so they keep falling through to ordinary lookup and stay visible as a
defect. `UNHANDLED_MODALS` names them, and a test asserts they are absent, so adding one
by accident fails the suite.

---

## Coordination: a wrong case in an entirely ordinary sentence (2026-10-18)

`conj` was not in the case cascade, so **every coordinated noun fell through to the
nominative fallback**. This is not an exotic construction:

| Source | Was | Now |
|---|---|---|
| "I see a dog and a cat." | `Ja vidžu psa i **kot**.` | **`Ja vidžu psa i kota.`** |
| "He works in the house and the garden." | `…v domu i **sad**.` | **`On rabotaje v domu i sadu.`** |
| "I help my brother and my sister." | — | **`Ja pomagaju mojemu bratu i mojej sestrě.`** |

The first conjunct was right and the second wrong, in the same phrase - exactly the kind of
difference a Slavic reader notices at once and the full-form validator cannot see, because
`kot` is a real word (the nominative of the word we wanted).

**This required no new Interslavic rule.** A conjunct shares its head's grammatical role,
so `case.coordination` re-uses the head's decision *and its confidence* - a conjunct must
not claim more certainty than the `obj`→Acc default it is copying. That is a fact about the
UD annotation, not a claim about Interslavic, so it needs no grammar citation.

Two propagation paths were needed, because UD hangs every conjunct off the **first** one:

- a preposition governs the whole coordination, not just its first member, so the governed
  case propagates transitively (the preposition itself is still emitted once);
- verb government propagates the same way, which is why both conjuncts of "help" are dative
  and both possessives agree into the dative with them.

`obl`, `nmod`, `advmod` and the rest still reach the fallback. That is deliberate: a bare
oblique's case depends on meaning the grammar does not state case by case, so it stays a
visible `guess` rather than an invented rule.

---

## Verb government, wired in at last (2026-10-18)

`resolveCase` has accepted a `verbGoverns` argument since Russian support was added and **nothing ever supplied
it**, so `byVerbGovernance` was unreachable and every direct object fell through to the
`default`-confidence accusative. The data to populate it was already parsed and sitting
unused in `AdditionInfo.governs`.

Counted directly in the dictionary: **78 verb entries carry a `(+N)` code**, of which
**33 have a preposition inside the lemma** (`obhoditi sę bez (+2)`, `obraćati sę k (+3)`)
where the code states what the *preposition* governs, not the verb. That leaves **45 true
verb-government entries**: Dat 20, Ins 16, Gen 9.

They are exactly the verbs an English speaker gets wrong by analogy:

| Source | Was | Now |
|---|---|---|
| "I help my brother." | `Ja pomagaju mojego brata` (acc) | **`Ja pomagaju mojemu bratu.`** (dat) |
| "I avoid the question." | `…pytanje` (acc) | **`Ja izběgaju pytanja.`** (gen) |

Note the second-order effect: `mojemu` follows the object into the dative through
agreement, which a governed case that agreement ignored would have left as `mojego bratu`.

Three confirmations that this is attested and not inferred:

- The codes are the dictionary's own, in the same numeric scheme already verified for
  prepositions (`(+2)`=Gen … `(+6)`=Loc), so the gloss cites them:
  *"pomagati" governs this case lexically - the dictionary marks it (+3)*.
- `pomagati` +Dat and `vladati` +Ins were both on the earlier **UNVERIFIED** research list ([foundations.md](foundations.md))
  (`bojati sę`+Gen, `pomagati`+Dat, `upravjati`+Ins). Two of the three are now attested in
  the data. `bojati sę` carries no code, so it stays unimplemented.
- A verb with no code keeps the honest `default` accusative: "They thank the teacher"
  selects `blagodariti`, which has no code, and stays `Acc (default)`.

Confidence is `high`, not `certain`: the code is read off the entry the ranker chose, and
a different lexeme would carry a different code. The government pre-pass and the main
lexical pass therefore share one `rankedFor()` helper, so they cannot drift about *which*
verb was chosen.

### Mutation coverage for the new rules

Eighteen mutations were added and all eighteen are killed: six for modal verbs, three for
verb government (pre-pass disabled, government read off the subject instead of the object,
citation dropped), four for coordination (rule dropped from the cascade, conjunct claiming
`certain`, conjunct inheriting from the wrong token, government not propagated), four for
the Cyrillic two-sound rule, one for the plurale tantum relaxation.
One **pre-existing mutation had to be repaired** - `"cyrillic skips the standard fold"`
no longer matched after `toCyrillic` changed, and a mutation whose pattern does not match
is counted as a survivor, so leaving it would have silently weakened the gate.

A literal `U+0001` character was also removed from two files (`orthography.ts`, and the
pre-existing one in `split-lemmas.ts`) in favour of visible `` escapes - the same
defect class this log already records fixing once, where an invisible character inside a
regex "worked by accident".

### Result: 135 mutations, 135 killed, 0 survivors

Run in five slices (1-45, 46-68, 69-92, 93-114, 115-135) plus a re-run of the three
mutations that were repaired after their slice had already passed. Every one is killed.

| Slice | Killed | Stale patterns found |
|---|---|---|
| 1-45 | 43 | 2 (frequency tie-break, repaired and re-run) |
| 46-68 | 23 | - |
| 69-92 | 23 | 1 (aux plural number, repaired and re-run) |
| 93-114 | 22 | - |
| 115-135 | 21 | - |

---

## The constructions that were missing are now built (2026-10-19)

Everything previously listed as "not built at all" is built, each from the page that states
it. The gold set went **12/29 → 15/29**, and the `unsupported` count is **zero**.

| Construction | Was | Now | Source |
|---|---|---|---|
| Personal pronouns | `njemu` for "her" | **`jej`** | pronouns |
| `n-` after a preposition | `njego` everywhere | **`jego`** / `s njim` | pronouns |
| T-V distinction | `ty` for "you" | **`vy`**, and plural agreement | pronouns |
| Verb number | `Žena čitala` for "the women" | **`Ženy pročitali`** | — |
| Comparatives | `veliky` for "bigger" | **`večši`** | adjectives |
| Superlatives | `veliky` for "biggest" | **`največši`** | adjectives |
| Predicate gender | `On jest najlěpša` (feminine!) | **`najlěpši`** | — |
| Negative concord | `ne vidžu čto-nebud` | **`ne vidžu ničto`** | syntax, correlatives |
| "going to" future | `Ja idu čitati` | **`Ja budu čitati`** | verbs |
| Conditional | `by` as a lexical word | **`Ja byh čital`** | verbs |
| Final clauses | `tak tamtogo děti budut jest` | **`da by děti byli zdrave`** | syntax |
| Optative | `Može on žiti dolgo` | **`Nehaj žive dolgo!`** | verbs |
| Passive | `běše ljubila od strany` | **`jest ljubjena od togo muža`** | syntax |
| Motion vs location | `pod stolom` for a fleeing cat | **`pod stol`** | prepositions |
| Plurale tantum numeral | `Jedna dveri` | **`jedne dveri`** | numerals |
| Singulare tantum | plural request failed to the citation form | number forced to singular | dictionary `.sg.` |

Four of these reproduce a page's own example sentence exactly: `Nehaj žive dolgo!`,
`Ona prinosi jabloka, da by děti byli zdrave.`, `Koja žena jest ljubjena od togo muža?`
and `Pica jest dělana.`

### Two defects found while building them

**The pronoun bug had two independent causes.** The dictionary glosses oblique *forms* as
entries - `jų` "her", `jego` "him", `jih` "them" - which have no paradigm of their own, so
inflecting one returned the merged 53-token paradigm of every third-person pronoun and gave
the **masculine** dative for "her". Separately, nothing requested `PrepCase`, so the
longest-form tie-break emitted the `n-` form everywhere, when the page restricts it to
after a preposition. Every bare pronoun object in the app was wrong.

**A negated future lost its `ne`.** Routing "going to" through the future machinery made it
take an early return in the realisation loop, and `ne` was emitted after that point:
"I am never going to read" came out as `Ja nikogda budu čitati` - the opposite of what was
asked. `ne` is now emitted at the top of the loop, which also closes a defect this log
recorded earlier: negation was silently dropped when the negated verb was not in the
dictionary (`Ja ne blargify knigu` now keeps it).

### The validator was flagging correct output

`derive()` output - comparatives, superlatives, participles - was absent from the full-form
index, so every `večši`, `najlěpši` and `ljubjena` the engine now emits was reported as
**unvalidated**. That is worse than a gap: the validation rate is this project's primary
quality metric, and flagging the right answer teaches the reader to distrust it. The index
now includes derived headwords and their paradigms.

---

## Still open, as of 2026-10-19

*Snapshot of 2026-10-19. The word-sense work since then is in [lexicon-and-word-sense.md](lexicon-and-word-sense.md); the defects that remain today are listed in the README under "What is still wrong".*

What remains on the gold set is **word sense**, not grammar:

| Gap | Evidence |
|---|---|
| Word sense with no label to go on | `party`→`partija` (all four synsets carry the bare gloss "party"), `floor`→`podloga`, `drive`→`gnati`, `flee`→`izběgati`, `visit`→`navědžati` |
| Aspect choice on a specific verb | `nahoditi` where the gold has perfective `najdti` |
| Idiomatic multiword | "take photos" → `brali fotografije` rather than the single verb `fotografovati`; "anymore" has no single-word equivalent |
| Personal names | the dictionary carries no first names and no source gives a transcription rule, so an unknown proper noun is kept as written and flagged |

Two gold differences are **not** defects of ours, and are recorded on the pairs themselves:
g13's `ključi` contradicts the author's own paradigm table, and g11 rests on a Stanza parse
error that five comparable questions do not reproduce.

---

## The library's own error marker reached the output (2026-10-20)

`CORRECTED`, and the worst defect found that day. `@interslavic/morphology`
reports a stem it cannot handle by **returning a form containing "ERROR"**, not
by throwing — and `realize` returned `ok: true` with it:

```
stråniti sę od   ->   "stråniti sę ERROR2ų"     reported as a successful form
```

**169 entries (0.87% of the dictionary) were affected**, all multiword verb
phrases. Two causes:

1. `splitMultiword` took the **last** word as the head. That is right for a noun
   phrase (`veliky gråd`) and wrong for a verb phrase, so `na`, `do`, `dȯlžėn`
   and `råbotų` were handed to the conjugator. Fixed by passing the part of
   speech: a verb phrase inflects its first word.
2. A leading `ne` is the negation particle, not the head — `ne ljubiti`,
   `ne slušati`. Fixed by recursing past it and keeping `ne` in front.

### Why nothing caught it

The full-form index is generated from the same `paradigm()` call, so it
**contained the ERROR strings as if they were real forms** and the validator
certified them. This is the concrete reason "99.4% of output words are valid
forms" means *is a real form of something*, not *is the right form*.

Three guards now, because one was not enough: the split knows the part of
speech, `realize` refuses a form containing "ERROR", and the index never holds
one.

```
entries producing ERROR forms:  169  ->  8
```

The remaining 8 are **mis-tagged dictionary rows** — `k`, `za`, `na`, `vdesno`,
`v dveri` marked as verbs when they are prepositions or adverbs, plus `bųde`, a
form of `byti` listed as its own entry. They now fail honestly and fall back to
the citation form.

---

## Predicate agreement applied to a predicate noun (2026-10-20)

`CORRECTED`. Found while auditing citation-form fallbacks — 16 distinct, 15 of
them harmless (an infinitive asked for a `Number` it does not have, a nominative
pronoun for a `PrepCase`), and one real:

```
kniga <- book    wanted {"Gender":"Neut"}      kniga is FEMININE
```

"It is a good book" was copying the neuter gender of `ono` onto `kniga`. Only a
predicate **adjective** agrees with the subject; a noun's gender, number and
animacy are lexical facts about that noun. It still takes the nominative, which
is a property of the position.

The output was right **by accident**: a noun's form is not selected by gender,
and the adjective had already agreed with `kniga` in the earlier pass — an
ordering accident, not a safeguard. `Number` was equally wrong in principle:
"My favourite thing is books" would have been forced into the singular.

---

## Phrasal verbs, and where the line was drawn (2026-10-20)

`VERIFIED`. The dictionary glosses 1,081 verb+particle phrases — `wake up` is
`buditi sę`, `give up` is `odrěkati sę`, `burn down` is `dogarjati`, `ought to`
is `byti dȯlžėn` — and every one was translated a word at a time. This only
became implementable after the ERROR fix above, because those targets are
exactly the multiword lemmas that produced garbage.

**Only `compound:prt` is used.** A true particle is an adverb, and UD has
already decided it is not heading a prepositional phrase. That is also where the
mass of the data is: up 205 · out 203 · away 119 · off 106 · down 69.

### A verb plus a genuine preposition is deliberately excluded

Measured, not assumed. The gloss index looked like a safe gate — 11 of 12 common
non-phrasal pairs (`wait for`, `live in`, `go to`, `talk about`, `believe in`…)
have no two-word gloss at all. But one does:

```
podhoditi   v.intr.   suit, be suitable, befit, go with
```

That is the "that tie goes with the shirt" sense, and matching bare "go with"
turned "I go with him" into `Ja podhodžu njego` — "I suit him". `after` is no
safer: "look after my brother" and "go after lunch" are the same shape. English
gives the compositional reading the same syntax and the dictionary cannot
distinguish them, so the prepositional class stays word-by-word.

### Two guards removed rather than tested

The first draft filtered hits by exact gloss and excluded multiword targets.
Both were measured to earn nothing: `lookup()` is keyed by normalised gloss and
returns **0** loose matches, and only 8 multiword targets are reachable through
`compound:prt` — all of them the right answer (`look out` → `byti ostråžny`,
"be careful"; `back up` → `idti vzad`). Removing both left the output identical
across all 126 fixtures and the code shorter.

One bug was introduced and caught here: the verb branch of `splitMultiword` is
shared with the reflexive one and returned a hardcoded `reflexive: true`, so it
claimed `bazovati na` ended in a clitic. It now returns the computed value.

---

## Where the remaining uncertainty is (2026-10-20)

`VERIFIED` by audit over all 126 English fixtures — 508 words, 1,908 feature
decisions:

```
certain   74.5%      high   13.6%      default   9.4%      guess   2.5%
```

**Every one of the 47 `guess` decisions is the same thing**: aspect where
English gives no cue. That is undecidable from the source, not an oversight.

Two cautions about these numbers, both measured rather than assumed:

1. The fixtures are **sentences chosen by whoever wrote the rules**, so this is
   not a random sample of real usage.
2. `validation: 'validated'` means *is a real Interslavic form*, **not** *is the
   right form*. The ERROR-marker defect above is the proof: those strings passed
   validation because the index was built the same way.

### Still open, with the reason

| Item | Why it is not fixed |
|---|---|
| `party` → `partija` vs `zabava` | all four dictionary senses and all four synsets carry the bare gloss "party"; no signal in any available source |
| `floor` → storey, `coat` | the Interslavic word exists but is glossed under a different English word (`etaž` "storey", `paljto` "overcoat"); needs a source-side English synonym layer |
| verb + preposition phrasal verbs | not decidable from the parse and the gloss — see the `go with` evidence above |
| 143 phrasal targets carrying their own preposition | `bazovati na` needs the complement's case taken from the lemma's preposition |
| imperative aspect | the verbs page gives the forms and is silent on which aspect an English imperative implies |

---

## FOUND: while writing the Learn pages (2026-10-25)

Every lesson example was run through the translator; where the output matched the
attested sentence the example got a "Try it" link (10 do, each held to it by a test).
These did not match, and are translator defects to fix:

- "Interslavic is my new obsession." -> "Medžuslovjanska jest ..." - feminine; Tatoeba
  12994632 writes "Medžuslovjansky", the language name being masculine.
- "You'll go home and stay home." -> "Vy budete idti domov i ostavajete domov" - the
  verb coordinated with an infinitive after "budete" became finite; it stays an
  infinitive ("ostati"), Tatoeba 13525474.
- "He stayed in the house." -> "On ostaval v domu" - imperfective where Tatoeba
  13467063 has perfective "ostal".
- "She's at school." -> "Ona jest na školě" - Tatoeba 12999978 has "v školě".
- "Where is the train station?" -> "Kde jest trenovala stancija?" - noun-noun
  compound read as a participle (found earlier the same day).

Not defects (the grammar allows both): "prihodi iz" for "comes from" beside "jest iz";
"dětetu" beside "děteti".

### Then: what was fixed, and what was left on purpose

Fixed (each with a test, and a mutation the test kills):

- **train station** -> "Kde jest želěznična stancija?", and it inflects: "do
  želězničnoj stancije". A noun + noun compound the dictionary glosses as one
  adjective + noun phrase is used as its two entries, so agreement inflects both
  (the one-lemma entry inflected only "stancija"). Separately, a noun modifier with
  no adjective now ranks as the noun it is: "train ticket" took the verb
  `trenovati` and now takes `pojezd`. "bus stop" became "avtobusna postojka" (it
  was "avtobusny zajezd"). No other fixture or gold sentence changed.
- **Interslavic** -> "Medžuslovjansky jest moja nova obsesija" (Tatoeba 12994632).
  A source noun that becomes an adjective - a language's name - takes the gender
  its headword names, like every other standalone adjective.
- **one auxiliary for two verbs** -> "Ja budu čitati i pisati", "Ja byh čital i
  pisal" (Tatoeba 13525474 "budete idti domu i ostati domu"); "I will read and she
  writes" stays two clauses.

Left, with the reason:

- **"stayed" -> ostaval (Tatoeba: ostal).** An English simple past with no object
  and no goal falls to the last-resort imperfective, shown as a guess. A wider
  "simple past is perfective" rule was tried before and broke other sentences;
  changing it needs a measured study, not one verb.
- **"at school" -> na školě (Tatoeba: v školě).** The prepositions page gives "na
  (+ loc.) - on, at"; which nouns take "v" for "at" is idiom, noun by noun.
- **"I speak Interslavic" -> rěku.** The dictionary lists `rěkti` "speak, say"
  before `govoriti` "say, speak, talk" and as more frequent; the dictionary outranks
  a hunch.

---

## Aspect, measured as a class rather than sentence by sentence

A scan of every English fixture found 102 verbs that fall to the last-resort
imperfective (`aspect.default`). About 75 are right (no perfective partner,
durative, habitual, modal); about 25 are wrong, in four groups, all from one
cause - the perfective rules fired only on a PAST verb with a noun object or
a goal:

1. a particle that states the result ("burned down", "ran away");
2. a verb whose meaning is a result, with no noun object ("stayed", "died",
   "succeeded", "agreed that...");
3. infinitives and commands, which never reached a perfective rule
   ("could not find", "open the window");
4. passive participles ("was prepared", "is broken").

### Group 1 fixed: particles

`aspect.pastParticle`: away, down, off, up - and "out" only on a verb of
motion, because "the Sun shined out" is a beginning (northwind.html,
"načelo blěskati"). "away" and "back" are often tagged `advmod`, so the
phrasal-verb lookup now reads them too ("run away" -> `uběgti`).

```
The house burned down.   Dom dogarjal.        ->  Dom dogorěl.
They ran away.           Oni běgli proč.      ->  Oni uběgli.
He gave up.                                   ->  On odrěkl se.
She sat down.                                 ->  Ona usědla.
The children went out.                        ->  Děti izšli.
He was running away. / He always gave up. / She sits down.   (stay imperfective)
```

No other fixture changed.

### Group 2 fixed: verbs that name a result

`aspect.pastResult`. English shows nothing, but the dictionary's aspect pairs
do. The verbs page: unprefixed verbs are imperfective, a prefix makes the
perfective (pisati > napisati), and only a perfective that is itself the
starting point gets a secondary imperfective (priznati > priznavati). So a
verb whose perfectives are NOT built on its imperfectives names a result
(ostati > ostavati, uspěti > uspěvati, umrěti > umirati); one whose
perfective is a prefix on the imperfective names an activity. Perfectives in
-nųti (kriknųti) are one instance of an activity and are set aside.

Checked on 50 verbs, 20 of each kind, before use: all 50 as expected.

```
He stayed in the house.   On ostaval v domu.  ->  On ostal v domu.   (Tatoeba 13467063)
He died last year.        On umiral ...       ->  On umrl ...
She succeeded.            Ona uspěvala.       ->  Ona uspěla.
They agreed that...       soglašali se        ->  soglasili se
We arrived yesterday.     dohodili            ->  došli
UDHR "endowed"            obdarjani           ->  obdarjeni          (his text)
thought / knew / lived / ran for an hour / waited for an hour   (unchanged, imperfective)
```

Left, and why: "say", "lose" and "understand" read as activities, because
`skazati`, `izgubiti` and `sråzuměti` are built on `kazati`, `gubiti` and
`råzuměti` - so "He said that..." stays `govoril`. North Wind "a traveler
came along" became `prišel` where his text has `prohodil` ("was passing");
it was wrong before too (`prihodil`), and the gold score is unchanged (31/58).

### Group 3 fixed: one bounded act wanted, possible or asked for

`aspect.singleAct`. An infinitive under a verb or modal, or a positive
command, bounded by an object or a completive particle, is perfective: his
"ne mogl najdti" (g13), Tatoeba "Ja hočem kupiti jabloka", "On probuje najdti
svoju olovku", "Otvori vse magaziny".

```
Father could not find his keys.  nahoditi      ->  najdti          (his g13)
I want to buy a car.             kupovati      ->  kupiti
Can you help me?                 pomagati      ->  pomogti
Open the window, please.         Otvarjajte    ->  Otvorite
Help me! / Read the book.        Pomagajte / Čitajte -> Pomožite / Pročitajte
Please close the door.           zaključajte ("lock") -> zatvorite
```

Left out, each with its evidence: "will" (the page shows only "budu dělati";
Tatoeba "on bude pomagati"); phase and liking verbs (Babel "prěstali
budovati"); purpose clauses (his "že by fotografovali"); negative commands
("Ne otvarjajte"). A bare plural object leaves the act open - "He could read
books" stays `mogl čitati`, the ability reading gold.test.ts warned about;
"eat apples" `jesti`, "eat the apples" `sjesti`. The result-verb test is NOT
used here: on "should act towards one another", a general norm, it gave
"postupiti" against his UDHR "imajut postupati", so it was taken out.

### Group 4 fixed: the past passive

No new rule: the subject of a passive is the object of the active, so the
object rule now reads a past "be" + participle with its subject. The present
passive stays imperfective, as the page gives it ("ja jesm nesomy").

```
The food was prepared by my grandmother.  gotovjena -> prigotovjena
The letter was written by him.            pisano    -> napisano
The book is read by the woman.            čitana    (unchanged)
```

### Where the four groups leave it

21 of the ~25 wrong verbs in the first scan are fixed; no gold or fixture
sentence got worse (gold 31/58 unchanged). Still open, on purpose or as a
different problem:

- "I will come", "We must leave" (no object): the future and an unbounded
  infinitive are left to the default for the reasons above.
- "He said that..." / "She told me that...": `skazati` is built on `kazati`,
  so the morphology reads "say" and "tell" as activities.
- "The pizza is made", "One of them is broken": present, so imperfective by
  the page's rule; a resultative state would want the perfective participle.
- Found while checking, not aspect: "She began to write" takes the reflexive
  `počęti sę` ("počela se pisati"); "letters" -> `pisemnosti`; the agent of
  "written by him" is "od strany njego" where the page gives plain "od".

---

## "at": v inside a building, na elsewhere

The cause: "at" has one locative candidate in the government table, `na`
("on, at"), so EVERY "at + place" came out na - "na školě", "na boljnici",
"na hotelu", "na restoranu". Frequency cannot separate "na stanciji" (right)
from "na školě" (wrong).

Corpus evidence per noun does not exist in quantity: the Tatoeba isv export
is 1,605 sentences (1-4 examples per noun), van Steenbergen's texts fewer,
and the Wikipedia search returned 0-3 hits per phrase before rate-limiting.
What decides it is the grammar page's own principle: Interslavic "is entirely
based on forms common to the Slavic languages, and when no common forms
exist, on majority solutions". So:

- `na` stays the default for "at", as the prepositions page lists it - right
  for work, stations, streets, markets, events, "the end of";
- a noun listed in `rules/data/at-inside.json` takes `v`: buildings and
  institutions where ru, pl, cs, hr and bg all say "in" (в школе, w szkole,
  ve škole, u školi, в училище), each with those five forms recorded;
- split nouns are left out ("university": ru/bg в, pl/cs/hr na); a compound
  ("post office", "na pošti") is not looked up as its head noun.

```
She is at school.           na školě     ->  v školě      (lesson's Tatoeba 12999978)
I was at the hospital.      na boljnici  ->  v boljnici
We ate at the restaurant.   na restoranu ->  v restoranu
The man works at the house. na domu      ->  v domu
He is at work / at the station / at the concert / at the market   na (unchanged)
```

No other fixture changed. The Prepositions lesson's "Ona jest v školě" now
has a Try-it link: the translator agrees with the lesson.

---

## "for" as za, and "take" + a span of time

Both were classes, not sentences.

**"for".** The dictionary has two: `dlja` (+gen) "for" and `za` (+acc) "for, because
of, due to, in exchange for, in favour of". Ranking always chose `dlja`, so every
exchange / reason / support "for" was wrong: "platil dlja biletov", "glasovali dlja
njego", "odgovorny dlja projekta", "Blagodarju vas dlja". The deciding word picks it,
so these went into the existing governed-preposition table, each attested:
thank/thanks ("hvala za", Wp/isv), pay ("platil za", Wp/isv), vote ("glasovali za",
Wp/isv), responsible ("odgovorny za", Wp/isv), prize/award ("Nagrada za", Wp/isv),
fight and die ("borju se za", "umrli za", Tatoeba). The table now also takes an
adjective or noun as the deciding word. `dlja` stays the default for whom/what
something is for ("dar jest dlja vas", "dobro dlja vašego zdravja") - also how van
Steenbergen and Tatoeba use it ("idealny jezyk dlja prěvoda").

**"take" + time.** "took three days", "it takes an hour" mean "last" (`trvati`), not
`vzeti`: "Putovanje vzelo tri dnje" -> "Putovanje trvalo tri dnje". It also exposed
an aspect gap: a span of time parsed as the OBJECT counted as a bounded object
(perfective "potrvalo"). New `aspect.duration`: a time-span object says how long it
went on - imperfective, like "ran for an hour".

No existing fixture changed. Noticed: "won a prize" gives `izigral` (win a game)
where `dobyl` fits; "It takes an hour" keeps "Ono" for the dummy "it".

---

## Expressions translated whole

A test of 28 English expressions in sentences showed four causes, each fixed in turn.

### 1. Phrases the dictionary lists whole

The dictionary has 4,155 multi-word English glosses; the phrase rules covered ~2,200
(verb + particle, preposition + word, two-word nouns). Now any run of up to five
words that the dictionary glosses EXACTLY is translated whole, longest first, if
the words are adjacent, hang together (one word heads the run), and stay a phrase
after the lookup's "to" stripping. Base verb forms ("took place" -> "take place")
only reach a verb entry, which keeps the source tense; an inflecting entry (verb,
noun, adjective) only lands on a word of its kind.

```
By the way, where is ...     Od strany dragy, ...   ->  Mimohodom, ...
The meeting took place       vzela město            ->  odbyla se
That makes sense             dělaje smysl           ->  imaje smysl
You're welcome               Vy jeste vitahmo       ->  Nema za čto
He died last year            poslědnji rok          ->  v prošlom godu
g33 (his text)               kuri cigaretu          ->  dymi cigaretoju  (= gold)
```

Two general fixes it needed: a multi-word verb now conjugates with its first
verb's own irregular stems ("iměje smysl" -> "imaje smysl"); a comma owed by a word
the phrase absorbed is kept ("Excuse me," lost its comma).

The first version matched too much - "to Moscow" as "Moscow", "I thought that" as
the formula "I think", the verb "be happy" landing on the adjective - and each was
closed by one of the conditions above; the final diff shows only the two
improvements. "Excuse me" gives `pomiluj`: the dictionary glosses it and
`izvini/izvinite` identically and ranks by intelligibility (pomiluj marked not
understood in 1 language, izvini in 4); Tatoeba has izvin- twice, pomiluj never -
too little to override the dictionary.

### 2. Whole-sentence formulas

The dictionary keeps 87 formulas with their mark ("Thank you!" -> `Hvala!`, "Happy
Birthday!" -> `Ščęstnogo dnja rođeńja!`), so they never matched as words. When a run
is the WHOLE sentence it is now also looked up with "!" / "?". Two the dictionary
lacks are in `rules/data/formulas.json`, each with a source: "How are you?" ->
"Kako se imate?" (Tatoeba 14052288), "Thank you very much" -> "Velika hvala"
(Wp/isv, Krčma). "Thank you for your help" is untouched (not the whole sentence).

Left without a source, so not added: "Nice to meet you", "See you tomorrow",
"Never mind" (no Tatoeba or Wp/isv hit). "Thanks for the gift" gives the stiff
"Blagodarjenje za dar" where Wp/isv writes "hvala za".

### 3. Light verb + noun

"made a decision" was "sdělal rěšenje", "have breakfast" "imajemo snědanje". The
existing light-verb rewrite (take photos -> fotografovati) gained, each cited:
make + decision -> decide (`rěšiti`; "on rěšil ostati", Wp/isv), have + breakfast /
lunch / dinner / supper -> the dictionary's own meal verbs, glossed "eat breakfast"
(`zautrakati`, `snědati`), "eat lunch" (`obědati`), "eat dinner" (`večerjati`). One
verb may now lead several rules. Phrases the dictionary lists with the article -
"make a mistake" (`pogrěšiti`), "take a bath", "make a phone call", "take a nap",
"make friends" - are reached by the phrase lookup of step 1.

No source found, so not added (warned about instead, step 4): "pay attention",
"take a shower". Noticed: "at eight" gives "na osmi" - clock times are not handled.

### 4. Idioms with no sourced equivalent: flagged

"piece of cake" -> "děl torta", "raining cats and dogs" -> "Doždi kotov i psov":
no source gives an Interslavic equivalent, so none is invented. `rules/src/idioms.ts`
lists common English idioms and the set phrases left unsourced in steps 2-3 (nice
to meet you, see you later/tomorrow/soon, never mind, pay attention, take a shower)
- English-side facts, like the time units. A translation containing one carries a
`warnings` entry, shown under the result ("... is an English idiom. Translated word
by word, it will not mean the same in Interslavic."). Matched on base forms or as
written ("later" has the base form "late"). 12 of 271 English fixtures warn - the
intended ones; none of the rest.

---

## "Excuse me": izvinite, by usage

The dictionary glosses `izvini, izvinite` and `pomiluj` identically ("sorry, excuse
me") and prefers neither; `pomiluj` won only on our intelligibility heuristic. With
more evidence gathered, usage is one-sided: Wp/isv 4 (a phrase table "Izvinite!",
"Nu izvini"), Tatoeba 2, pomiluj 0 in both. Where the dictionary is neutral the
corpus decides, so a curated entry (function-words.json, cited) now picks
`izvinite` - the vy form the translator uses throughout - and the phrase lookup
consults curated entries like the single-word lookup does.

---

## Audit of the clause rules, and what it added (2026-10-29)

Every rule added this session was re-checked against its source.

**Confirmed:**
- *byl byh dělal* (verbs page).
- Purpose clauses with *da/že by* + conditional: syntax page, "Final clauses are translated by means of že or da followed by the conditional". The 2017 conjunctions page lists only *aby* / *že by*, but the syntax page and his usage (48 *da by(hmo)*, 0 *aby*) settle it.
- *hot*: the first variant of the dictionary's "hoť, hoti".
- *ja jesm* + L-participle in the first person, where only 3rd-person *je/jest/sut* is "usually omitted".
- *se* after the verb ("Ja myju se").
- *prijdti*, *zato že*.
- *dopoka* = "as long as" and *tutoj* for "this" (syntax page: "Tutoj hlěb jest nedragy").

**Fixed or added:**
- **Conditional aspect.** "would" + a bounded object is perfective: *kupil byh*, *pročital byh*. Evidence: his conditionals "da by uviděl grad i věžu", "by pomyslil", "by odkryl", and the verbs page, where the perfective "focuses on the result". "will" stays as it was: his futures go both ways ("budu odkryti cěnu ščestja" beside "budu poznavati zvuk kroka").
- **Purpose aspect.** A purpose infinitive under a single past event follows the same test: "že byhmo kupili hlěb". The old exclusion cited "že by fotografovali tulipany", whose bare-plural object is unbounded anyway.
- **Infinitive under an adjective.** It is a complement, not a purpose clause ("ne bylo legko napisati", Wikipedia). "Nice to meet you" was "Prijemno, že by strěčal vas".
- **Commas around adverbial clauses**, on either side of the main clause:
  - Examples: "ja ju slušal jesm, kogda ona žalila se" and "Ale kogda jest denj, ja nošu verigu".
  - No comma after a connective (*ale*, *i*).
  - Not applied to "after/before", whose one attested form has none ("poslě togo, kogda").
- **"until" + clause → *dopoka ne***, with *ne* before the verb.
  - Conjunctions page: "dopoka ne „till, until”".
  - His English–Interslavic dictionary: "until … (conj) dopoka ne".
  - Wikipedia: "dopoka raziskyvanje … ne našlo jego".
- **"until" + noun → *do* + genitive.** His dictionary: "till … (prep) do (kogo/čego)"; Wiktionary defines the preposition "till" as "until".

**Left unchanged, with the research done:**
- **"after/before" + clause.** No grammar page or dictionary entry gives a conjunction. The wiki has one "poslě togo, kogda" and one "poslě togo, ako"; "before" has none.
- **"письмо".** *piśmo* is his word for a letter (Piron: "piśmo od čitatelja"), but the dictionary scores *piśmo* and *pisańje* equally, and no general rule separates the senses of Russian "письмо". Two candidate rules were measured and rejected: they flipped 31 and 280 other keys.
- **"called" (phone), "get to", "next door", "in front of"**: no dictionary basis.
- **"to rest"**: Stanza parses "rest" as a noun. The purpose rule works when the parse is right ("On šel domov, že by spal").

---

## Tenses (2026-10-29)

I ran every English tense and the Russian aspect pairs through the translator, then fixed each broken one from a source:

- **"will be reading" / "will have read".** Was "budu čitaju" / "budu jesm pročital"; now "budu čitati" / "budu pročitati". The verbs page has one future, *budu* + infinitive, and aspect carries the rest.
- **"used to" + verb.** Was "upotrěbil čitati"; now the imperfective past, "čital". Verbs page: the imperfective expresses "a habit or a repeated action".
- **A habitual motion takes the non-directional verb.** "We used to go to the sea every summer" → "hodili". The verbs page's own table and "Igor jezdil do Moskvy".
- **"go" by transport.** It is *jehati / jezditi / pojehati* (the same table), with the means in the bare instrumental: "ježdžu … avtobusom", "pojehali … pojezdom". The dictionary has "jehati želěznicejų „travel by train”".
- **The passive agent "by".** Was "od strany njego"; now "od njego". Syntax page: "od with the genitive" ("pica sdělana od studentov"). The parser had labelled it a plain `obl`.
- **"by" outside a passive.** It drops the agent senses: "pri oknu" (dictionary *pri* (+6) "by, near"), not "od strany okna".
- **A Russian perfective future.** "Я прочитаю книгу" → "Ja budu pročitati knigu". Verbs page: the perfective present as a future "is rather to be avoided"; van Steenbergen writes "budu odkryti". Two guards apply:
  - It is skipped for the subjectless first-person plural "let us" form: his Babel gives "Построим" / "Сойдём" as "budujmo" / "Sojdimo".
  - It is skipped where the dictionary has no perfective verb for the lemma: the parser tags "мучится" as perfective.
- **The pluperfect "had read"** stays as the compound past. The verbs page calls the pluperfect optional: "Distinguishing between various past tenses is not necessary".

Open: "by" + a deadline ("by Friday" → "pri petku") has no source for its preposition.
