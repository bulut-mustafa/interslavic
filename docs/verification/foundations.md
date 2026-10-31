# Foundations: the first audits (2026-10-17)

The first checks of the design, before anything was built on it: what self-validation can and cannot prove, what the first real parses exposed, the claims that were verified, the ones that were wrong, and the ones that were only research. Several lists here are snapshots; each carries a note saying what changed since.

Part of the [verification log](../verification-log.md). Entries are in the order they were written; the date of each is in its heading.

---

## The limit of self-validation (found 2026-10-17)

A user compared our output with another translator and was right to distrust ours.

**"How are you doing?" produced `Kak ty dělaješ?`** — which means *"how do you do it?"*, a
question about method. It scored **100% validated**: every word real, correctly inflected,
every case traceable to a documented rule. It was still the wrong sentence.

> **The full-form lexicon proves words are real. It says nothing about whether the sentence
> means what was asked.** Those are separate questions, and only gold data answers the second.

Interslavic for the greeting is **`Kako jesi?`** / `Kako ty jesi?` (*kako* + 2sg of *byti*);
`Kako se imaš?` is a valid Slovenian-style alternative. Ours was neither. The cause is not
grammatical: Stanza correctly makes "doing" the root, so a compositional engine faithfully
translates *do*. Greetings are idioms, and idioms are non-compositional.

### Measuring meaning: gold data

So a gold set was built from **Jan van Steenbergen's own grammar pages** - he co-authored the
language, making these the most authoritative parallel data available
(`packages/eval/data/gold-steenbergen.json`, from
<http://steen.free.fr/interslavic/syntax.html>).

First measurement: **1 of 10 exact matches.** It exposed five real grammar bugs that 135
passing tests and a 100% validation rate had not:

| Bug | Was | Gold |
|---|---|---|
| **Negative concord missing** | `Ja nikogda jem čokoladu` | `Ja nikogda **ne** jem čokoladu` |
| **`ne` placed after the verb** | `hlěb jest ne dragy` | `hlěb **ne jest** dragy` |
| **Infinitival "to" read as a preposition** | `hoču **do ide** do kina` | `hoču **idti** v kino` |
| **English perfect not perfective** | `Otec **kupoval** knigu` | `Otec **kupil** knigu` |
| **Tense not read off the auxiliary** | `Kde otec **kupoval**…` | `Kde otec **kupil**…` |

The first two change meaning or grammaticality outright. After fixing them: **6 of 10.**

A sixth bug surfaced while fixing these, caught by the existing suite: requesting a
perfective of a verb that has no perfective counterpart matched nothing, and realisation fell
back to the citation form - `Ona ne **znati** odgovor` instead of `znala`. The requested
aspect is now reconciled with the aspect the chosen lexeme actually has. **The validator
could not have caught this either: `znati` is a real word.**

### The four remaining differences, each judged

| Gold | Ours | Verdict |
|---|---|---|
| `Koju knigu kupil otec?` | `Koju knigu otec kupil?` | **Acceptable** - word order is free in Interslavic |
| `Ja ne hoču idti v kino.` | `…idti do kina.` | **Acceptable** - both express motion to a place |
| `Tuto avto ne jest drago.` | `Tutoj voz ne jest dragy.` | **Acceptable** - `voz` is also glossed "car" and is more frequent |
| `Nikto ne prijehal na zabavu.` | `Nikto ne prihodil do partije.` | **KNOWN DEFECT** - `partija` is the *political* party. Needs word-sense disambiguation. |

`packages/eval/test/gold.test.ts` enforces this: anything not on that written exception list
must match exactly, the match rate cannot fall below 6/10, and a stale excuse fails the suite
if a sentence starts matching.

### Closed-class words are now curated, not ranked

Ranking picked `tamto` for "that" because it is glossed exactly "that", while the general
demonstrative `tȯj` is glossed "this, that" and so looked like a weaker match - but `tamto`
means "that **over there**". Frequency and gloss-overlap are the wrong tools for a few dozen
constantly-used function words, so `packages/rules/data/function-words.json` holds curated
choices, each citing the source that justifies it. Open-class words stay with ranking.

---

## Recheck before the web UI (2026-10-17)

A full re-audit before starting the web UI. It found one **missing design
requirement** and three further defects.

### The missing requirement: self-validation was never built

The design made the full-form lexicon the **keystone artifact**, scheduled early,
because the output cannot be reviewed sentence by sentence by a fluent speaker, so the
approach is "validate and flag". It had not been built.

Worse, the `validation` field reported `validated` whenever the morphology library returned
*any* form — which is **not** the claim it appears to make. Earlier reports of "validated"
were therefore weaker than they sounded.

Now built (`packages/lexicon/src/full-forms.ts`):

- **286,457 distinct surface keys** from 350,660 generated forms, built in ~2.8s
- indexed under **both** etymological and folded spellings, since output is standard
  orthography and the dictionary cites etymological
- `has()` validates; `analyze()` returns **all** readings, because syncretism is real
- multiword lemmas are indexed as citation forms: for **1,734 entries (9%)** the phrase
  never appears among its own generated forms, since only the head inflects
- `validationRate` is reported per sentence and is now the project's primary quality metric

It immediately proved itself: it rejects `velikyu`, the exact invented form the earlier
multiword bug produced. **Validation rate across all 18 fixtures is 100%**, enforced by a
test that fails if the engine starts inventing words.

### Other defects found in the recheck

| Defect | Detail |
|---|---|
| **Questions became statements** | Punctuation was hardcoded to "." — "Do you know the answer?" came out "Ty znaješ odgovor." Source punctuation is now carried over. |
| Punctuation-only input | "." produced ".." |
| Dead declarations | `TargetNode` and `ValidationStatus` were declared and never referenced; removed. |

### Checked and found sound

- Russian regressions, including past tense: `Женщина читала книгу` → `Žena čitala knigu`,
  `Мальчик не знал ответ` → `Hlapčik ne znal odgovor`
- Multi-sentence input: "The cat sat. The dog ran." → `Kot sěděl.` / `Pes běgl.`
- Unknown words are passed through and flagged, not silently dropped
- All 18 fixtures still match live Stanza

---

## What real parses exposed

Every sentence below was correct in tests but **wrong the first time it met a real parse**.
Hand-written fixtures had hidden these, because I had unconsciously written the parses the
way the engine already expected them.

| Typed at the CLI | Was | Cause |
|---|---|---|
| "Water is cold." | `Voda běše zimna` | A copula is tagged `AUX`/`cop`, not `VERB`, so it got **no verb features**, and tie-breaking picked the literary imperfect |
| "She does not know…" | `Ona sdělaju ne znaje…` | English **do-support** was translated as a real verb instead of deleted |
| "She did not know…" | `Ona ne znaše…` | Past tense generated the **imperfect**; the standard past is the l-participle agreeing in gender |
| "My brother…" | `Moja brat` | UD attaches possessives as `nmod:poss`, which was missing from the agreement list |
| "…in a big city." | `v velikom velikyu grad` | The multiword entry `veliky gråd` was inflected on its **first** word instead of its noun head |

The fixtures are now generated by `npm run fixtures:write` and verified by
`npm run fixtures:check` (18 fixtures, 0 differ), so they cannot drift from the parser again.

**Validation of the earlier hand-written fixtures:** when first checked against live Stanza,
6 of 11 matched byte-for-byte and the other 5 differed only by features Stanza *adds*
(`PronType=Prs`, `NumForm=Word`, `Voice=Act`, `Animacy=Anim`). **No deprel, head, lemma or
UPOS differed anywhere** — the dependency structure, which is what the resolvers consume,
was right in every one.

### Known limitation, documented rather than hidden

"I work in a big city." still gives `Ja rabotaju v velikom veliky gradu`. The dictionary
glosses "city" **only** as the phrase `veliky gråd` ("big town"), so the source's own "big"
and the phrase's `veliky` both appear, and the phrase's modifier does not agree. The noun
head is now correctly locative. A single-word target is preferred where one exists; for
"city" the dictionary offers none.

---

## VERIFIED

| Claim | Method | Result |
|---|---|---|
| Dictionary is reachable, 26 columns, 19,100 rows | `curl` + header assert | Confirmed; `lexicon:fetch` fails loudly on drift |
| Government codes are numeric `(+2)`, not `(+gen)` | Scanned all rows | **0** named codes, 205 numeric |
| `@interslavic/morphology` 0.1.2 is MIT | npm registry | Confirmed |
| Library handles all single-word lemmas | Probed all 17,982 inflectable entries | 0 crashes; **0** genuinely unhandled single words |
| `inflect()` returns a whole paradigm | Probe | `žena` → 14 tokens |
| Syncretism is real | Probe | `ženy` = Nom.Pl + Acc.Pl + Gen.Sg |
| Aspect must gate lexeme choice | Dictionary + test | `dati` (Perf, 7606) outranks `davati` (Imp, 6395) by frequency |
| Aspect pairs recoverable from `en` glosses | Grouped verbs by gloss | **1,616** ipf/pf pairs, 905 ipf-only |
| Principal parts are required for correctness | A/B probe | `viděti` → `viděje` without, `vidi` with |
| `idti` suppletion propagates to compounds | Probe | `idti`→`šėl`, `pojdti`→`pošėl`, `prijdti`→`prišėl` |
| `derive()` yields passive participles | Probe | `dělati` → `dělany`, `dělajemy`, `dělamy` |
| `type` is too coarse to rank with | Scan | 14,163 of 19,100 are type 1; 799 empty |
| Multiword lemmas are 10% of the dictionary | Scan | 1,917 rows; 586 end in ` sę` |
| en/ru glosses are asymmetric | Dictionary + **en.wiktionary** | See below — real linguistics, not a bug |
| Rust engine `gold-silver-copper/interslavic` is unlicensed | GitHub API + raw file probe | No LICENSE, no license field → study only, never copy |
| `steen.free.fr` tools are reachable | HTTP | 200; usable as an independent second oracle |
| **Perfective present must not be used as a future** | **Primary source fetched directly** | Verbatim, see below |
| Future = `byti` future + infinitive, stem `bud-` | Primary source | `budu, budeš, bude, budemo, budete, budut` |
| Imperfect/pluperfect are optional | Primary source | "an optional imperfect tense and an optional pluperfect tense" |
| 1sg is `-u`/`-ju`, with `-em`/`-im` as regional alternates | Primary source | Confirms our generator default |
| Long/Short variants are the contracted third conjugation | Primary source | `-aje-` contracts to `-am, -aš, -a, -amo, -ate, -ajut` |
| **Numeral government: 1→sg, 2-4→pl, 5+→gen pl** | **Primary source** | "jedin dom, dva domy, četyri domy, pet domov" |
| Standard past is the l-participle, not the imperfect | Library paradigm + research | `znal/znala/znalo/znali` (Gender+Number, no Person) vs finite `znaše` |
| Hand-written fixtures were structurally correct | Re-parsed all with live Stanza | 18/18 now match; no deprel/head/lemma ever differed |
| **Prepositions govern case per sense** | Generated from dictionary codes | 108 prepositions, 133 rows, **11 govern >1 case** (`v`, `na`, `za`, `po`, `s`, `pod`, `nad`, `prěd`, `među`…) |
| Government table must override frequency ranking | Compared all 130 glosses | **13 diverge** — e.g. "at": table `na`(+Loc) vs lexical `u`(+Gen) |

### The perfective-present rule — confirmed at primary source

Fetched directly from `https://interslavic.fun/learn/grammar/verbs/`:

> "The future tense is formed by combining the future tense of the verb *byti* 'to be' with
> the infinitive. The forms are the same as if a verb with the stem **bud-** were conjugated
> in the present tense. Examples: ja **budu** dělati, ty **budeš** dělati, on/ona/ono
> **bude** dělati, my **budemo** dělati, vy **budete** dělati, oni/one **budut** dělati.
>
> Using the present tense of a perfective verb for the future (as is done in West and East
> Slavic) is **rather to be avoided, as it can easily be misunderstood by South Slavs**."

This is the justification for `aspect.tense.presImp`, our highest-impact rule, and it is now
confirmed from the grammar itself rather than relayed through a research agent.

The same page also explains the `Long`/`Short` variants our generator must choose between:
Interslavic admits a **third conjugation** formed by contracting `-aje-` sequences
(`-am, -aš, -a, -amo, -ate, -ajut`). So `davaje` (uncontracted) and `dava` (contracted) are
both legitimate; preferring the uncontracted form is a defensible, documented choice rather
than an arbitrary one.

### The en/ru asymmetry — confirmed genuine

English `boy` → `hlåpėc`; Russian `мальчик` → `hlåpčik`. This was checked because it looked
like a bug. It is not.

The dictionary's own per-language columns:

| | `hlåpėc` | `hlåpčik` |
|---|---|---|
| Ukrainian | хлопець | хлопчик |
| Polish | chłopiec | chłopczyk |
| Czech | chlapec | chlapeček |
| **Russian** | **парень** (lad) | **мальчик** (boy) |

Independently confirmed by English Wiktionary on Russian хлопец: *"Borrowed from Ukrainian
хло́пець (boy, lad), cognate to Polish chłopiec"*, defined as *"(colloquial) lad, boy"*.

So the root is native and means "boy" in Ukrainian/Polish/Czech, while Russian's reflex is
a colloquial borrowing meaning "lad" — Russian's word for a boy child is мальчик, matching
the Interslavic **diminutive**. Both of our outputs are correct for their source language.
The gloss panel now prints `matched en gloss "boy"` / `matched ru gloss "мальчик"` so this
is traceable rather than surprising.

---

## CORRECTED — claims in the original design that were wrong

*Counts here are as of 2026-10-17. The full-form index has grown since: forms derived from the library (comparatives, participles, paradigms) were added to it.*

| The design said | Actually | Why it was wrong |
|---|---|---|
| Full-form lexicon ≈ **600k** forms | **352,182** | An estimate (19k × ~30); the real average is ~18 forms/entry. Nearly 2× overstated. |
| 124 `prep.` entries | **136** entries, 133 with codes | Research counted raw rows; we count entries after lemma-splitting |
| ~19,100 entries | 19,100 **rows** → **19,361 entries** | Comma/slash variants expand into separate entries |
| `(+gen)`-style government hints | numeric `(+2)`…`(+6)` | Assumed from prose, never checked |
| `!` = unchecked, `#` = flag | `!` = autogenerated (6), `#` = flagged (79) | Inverted |
| Synonyms are the main ingestion complexity | Multiword entries are (1,917 vs 245) | Assumed |
| `type` is the tie-breaker | `frequency` is | `type` is nearly constant |
| Rewrite passives to active | Don't force it — agentless passives have no agent to promote | Over-generalised |

---

## UNVERIFIED — research-sourced, NOT independently confirmed

*Snapshot of 2026-10-17. Struck-through items were resolved later in this log. The rest were not revisited, and `packages/rules/src/numerals.ts` still states that the numeral items are deliberately not implemented.*

These were in the original design and may be wrong. **None of them is implemented yet**, so
nothing in the working code depends on them. They must be confirmed before they are used.

- **Verb agreement after 5+** (research claimed 3rd-person singular neuter). The grammar
  page does not state it, so it is **not implemented**.
- **Numeral behaviour in oblique positions.** Not stated, so we deliberately leave an
  already-assigned oblique case alone and record a note.
- **Compound numerals** (21, 22…). The grammar says only "5 and more"; standard Slavic keys
  off the last digit. We follow the literal reading and mark such cases `guess`.
- ~~**Verb government** for specific verbs~~ — **resolved 2026-10-18 for 45 of them.**
  `pomagati`+Dat and `vladati`+Ins are attested in the dictionary's own codes and now
  implemented. `bojati sę`+Gen carries **no** code, so it stays unimplemented rather than
  inferred. Counted properly: 78 verb entries carry a code, 33 of which belong to a
  preposition inside the lemma, leaving 45.
- **Imperfect/aorist are optional or literary**, so we never generate them. (The
  conditional and the passive, which the library computes but never emitted, are now built
  from `derive()` and the auxiliary tables - see 2026-10-19.)
- **Gen-plural fugitive vowels are ~99.98% correct upstream** with a lexical exception list.
- **Flavorization** North/South substitution tables.
- ~~**formal `vy` default**~~ — **VERIFIED 2026-10-19** at tier 1: "Interslavic has got T-V
  distinction, i.e. vy is a universal second person pronoun for both numbers, whereas the
  second person singular ty is used only for addressing friends, relatives and children."
  Implemented. Subject pronouns are still kept, except in the optative, where both of the
  page's examples drop them (`Nehaj žive dolgo!`).
- The claim that **nobody has shipped a translator into Interslavic**. Plausible and
  consistent with what was found, but an absence claim and not provable by search alone.

---

## OPEN implementation gaps discovered during verification

*Snapshot of 2026-10-17, kept as history. Since then: item 1 (the future auxiliary) is built, see "Tenses" in [grammar.md](grammar.md); items 2 and 5 (predicate agreement) have their own stage, `packages/engine/src/stages/predicate-agreement.ts`; item 4 is closed below. Item 3 (word order) is still source order, as `packages/engine/src/stages/render.ts` says.*

1. **The library generates no future tense.** `inflect('byti')` exposes only `Pres` and
   `Past` — there are **no `bud-` forms at all**, even when the `bųdų` principal part is
   supplied. Since every future must be periphrastic, the engine must supply this one closed
   auxiliary paradigm itself. The primary source gives it exactly:
   **`budu, budeš, bude, budemo, budete, budut`** (note `budemo`, not `budem`).
   This does not contradict "author no paradigm tables": it is one documented irregular
   auxiliary, not an open class.
2. **Agreement covers `amod`/`det`/`nummod`/`appos` only.** Predicate adjectives and
   participles are not handled.
3. **Word order is copied from the source.** Fine for English and Russian SVO; a real
   precedence spec is needed before any SOV source language.
4. ~~**Verb governance is not wired in.**~~ **CLOSED 2026-10-18** for the 45 entries the
   dictionary codes; see "Verb government, wired in at last" in [grammar.md](grammar.md). Verbs with no code
   still take the `default`-confidence accusative, and hand-authoring the rest remains
   out of scope because the grammar does not state them.
5. **Predicate adjectives and participles** are not covered by agreement in general - a
   root ADJ/NOUN is special-cased, nothing else is. This is now a measured defect, not a
   suspicion: "Peter is happy" gives **`Peter jest ščestliva`** - feminine - because an
   untranslated PROPN subject carries no lexical gender for the predicate to agree with.
