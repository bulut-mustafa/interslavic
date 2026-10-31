# Gold data and corpus checks

Measuring meaning against Interslavic written by people: the gold pairs, van Steenbergen's parallel texts, the corpus used where the grammar pages are silent, and batches of ordinary sentences.

Part of the [verification log](../verification-log.md). Entries are in the order they were written; the date of each is in its heading.

---

## Measuring meaning on 29 pairs instead of 10 (2026-10-18)

The gold set was 10 sentences from a single page, and it had done its job - it caught five
grammar bugs that 135 passing tests had not. But a 10-sentence set drawn from one page
measures one page's worth of grammar, and it reported 6/10 while the engine could not form
a question, a passive, a reflexive, a purpose clause or a comparative at all.

It now has **29 pairs from six pages** (syntax, prepositions, verbs, pronouns, adjectives,
numerals), every `isv` string checked against the page text character by character, each
carrying its page and the constructions it exercises. The new ones deliberately cover what
the syntax page never exercised: the preposition case contrast (`pod stolom` vs `pod stol`),
reflexive `se`, possessive `svoj`, predicate short-form adjectives, numeral government and
plurale tantum, purpose clauses and the optative.

**The honest score is 10/29.** That is not a regression from 6/10 - it is a wider ruler.

Terminal punctuation is no longer compared: several pages give their examples inline, with
no final period, so requiring one would measure punctuation instead of translation. That
punctuation is carried over at all is asserted separately.

### Every difference is now classified, not excused

The old harness had a free-text exception list keyed by the Interslavic string. With 19
differences that does not scale, and "accepted" blurred three very different things. Each
difference now carries a status, and the suite fails if one is missing, if one is stale
(the pair has started matching), or if the tally of statuses changes without being updated
- so quietly reclassifying a defect as "acceptable" cannot pass:

| Status | Count | Meaning |
|---|---|---|
| `acceptable` | 3 | a documented equivalent; the grammar permits both |
| `defect` | 11 | we are wrong, and the cause is named |
| `unsupported` | 4 | the construction is not built yet |
| `parser` | 1 | the UD parse is wrong, so transfer never had a chance |

That last category earned its place. For "Which woman does that man love?" Stanza makes
**`does` the root VERB** with `love` as its `xcomp`, so do-support is never recognised and
we faithfully translate a wrong parse. Before writing it off, five comparable questions
were checked - "Does he know the answer?", "What does she want?", "Which book does she
read?", "Do you know the answer?", "Where does father live?" - and **all five parse
correctly**. So this is an isolated parse error, not a systemic one, and a parse-repair
heuristic would be unjustified.

`packages/eval/scripts/score-gold.ts` prints the full report with a per-construction pass
rate, so a change shows *which* rule improved rather than only moving a single number.

---

## A corpus for what the grammar pages do not cover (2026-10-20)

`VERIFIED`. The grammar site has **no page on case usage** — `cases.html`,
`case.html` and `accusative.html` all return 404 — so questions like "what case
does a duration take" were unanswerable from tier 1. Two bodies of real
Interslavic prose settle them, and both are the language's own community:

- **Van Steenbergen's parallel texts**, linked from `toc.html`: `maly_princ`,
  `babel_text`, `schleicher`, `northwind`, `wren`, `selo`, `volk_i_pes`,
  `declaration`, `jokes`, `otcze_nasz`, `samples`. 399 lines after extraction.
- **The Interslavic Wikipedia** at `incubator.wikimedia.org/wiki/Wp/isv`,
  searchable with `insource:/…/ prefix:Wp/isv`. Thousands of articles; the
  Krčma talk page is signed by IJzeren Jan, van Steenbergen's own handle.

This is a tier **below** the normative pages and above research: attested usage,
cited per rule, used only where tier 1 is silent. Six rules at the time rested on
it, each quoting its source in the code.

### What it settled

| Question | Evidence | Rule |
|---|---|---|
| duration takes no preposition | `Eksperiment trval samo několiko lět`; `Dėnj i noć ja blųđų po lěsah` | `case.durationAccusative` |
| `dlja` is never temporal | every occurrence in his prose takes a beneficiary — `dlja mene`, `dlja sebe`, `dlja ženy i dětij` | same |
| a time adverbial is accusative | `načal KAŽDU SEDMICU posylati radio soobčenje` (accusative feminine) | `case.temporalAccusative` |
| "wait for" is `čekati na` + acc | `on rěšil ostati i čekati na njego` | `case.verbGovernedPrep` |
| "believe in" takes the accusative | `člověk može ne věriti v Boga` | same |
| "depend on" is `zavisěti od` + gen | 24 occurrences of `zavisi od` | same |
| no placeholder subject | `trěba jest uznati za silnějšego`; `Nužno jest tuty članok…`; every `ono` in the corpus is referential | `expletives.ts` |
| a predicate agreeing with a person takes the masculine animate plural | `Vse kury sųt jednakove i vsi ljudi sųt jednakovi` | `agreement.predicate.person` |
| a genitive possessor follows its noun | `język cěloj zemje`; `v centru Solnečnoj sistemy`; `Rodny jezyk němcov` | possessor reordering |
| a substantivised modifier stands alone | `uznati za silnějšego od drugogo`; `Jedni ljudi…, drugi zimu` | `anaphora.one` |

### Licensing

Same posture as the dictionary: **nothing is committed.** The texts are fetched
over `curl` when a question needs them, and quoted in code comments with their
URL. The Wikipedia content is CC BY-SA; `medzuslovjansky/database` carries **no
license at all**, which is why the clone below was treated as read-only
research and deleted.

---

## CORRECTED: five registry quotes were not verbatim (2026-10-24)

Every normative quote in `rule-registry.json` was checked against the fetched page
text. Four were paraphrases presented as quotations, and one corpus quote was wrong:

| Rule | Was | The page / corpus actually says |
|---|---|---|
| `animacy.lexical`, `animacy.noAnimateHead` | "...in the case of inanimate nouns it is identical to the nominative" | "...in the case of inanimate objects the accusative is identical to the nominative" |
| `negation.beforeVerb` | "...the particle ne „not" preceding the verb" | "...preceding the word being negated, usually the verb" |
| `aspect.adverbial.imp` | a sentence about the perfective present read as future | "It can also express a an ongoing process, a habit or a repeated action" |
| `agreement.impersonal` | "Nužno jest tuty članok prěvesti" | "Nužno jest tuty članok prěimenovati/prěměstiti" (Wp/isv/Incubator:Krčma) |

The 13 rules that cited a page without a sentence are now pinned too (one,
`case.phrasalObject`, turned out to be unreachable - its input set was never filled -
and was deleted), so the
test requires a quote for every normative and corpus rule. Pinning `aspect.perfect`
also exposed a real defect - the perfect progressive came out perfective, against the
page's own "ja čital jesm knigu ... „I have been reading a book"" - fixed in `1f88eb5`.

---

## VERIFIED: the remaining gold defects, one at a time (2026-10-25)

Gold 29/49 -> 31/49; defects 7 -> 1. Each change was measured against every gold
pair and every fixture before it was kept; each output it moved is listed here.

| Change | Source | Outputs moved |
|---|---|---|
| "work" with to/at/from -> `råbota` (curated) | verbs page: "Iduči do raboty" | g33 only |
| the source's interior commas carried over | as the final punctuation already was; his own prose writes "naděju, že" and "spoločenstvo, ktorym jest selska občina, jest" (selo page) | g26, g33, and 5 fixtures: an address, "prosim", a conditional, a relative clause, `že` |
| "take photos (of X)" -> `fotografovati` X | syntax page: "že by fotografovali tulipany" | g15, g34 |
| a plural whose own form the dictionary glosses is looked up by it | nouns page "člověk ... pl. ljudi"; Wp/isv "deset lět" 5 hits, "deset rokov" 0 | "people" -> `ljudi`, "years" -> `lěta` |
| indefinite cardinals (`mnogo`, `malo`, `několiko` ...) govern the genitive | named on the numerals page; the case is the corpus's: "několiko projektov" (User:IJzeren Jan), -ov 21 hits, -y 0 | g26 `ljudij`; "mnogo knig", "mnogo vody" (new fixtures) |
| "many/much/few" (UD: ADJ) -> `mnogo`/`malo` (curated) | numerals page | "mnoge knigy" -> "mnogo knig" |
| motion verb + "around" + "in X" -> `po` + locative, "drive" there -> `jezditi` | verbs page: "Igor jezdil po Moskvě" | g21 (now exact) |
| "nobody but X" -> "only X", stressed reflexive -> `sebe` | pronouns page: "Ja myju jedino sebe" | g30 (now exact) |
| a reflexive after a preposition takes the long form | pronouns page: "After a preposition, it is better to use the longer forms" | none in the fixtures; it was only a note before, while the dictionary's published "(sę, ...)" made the clitic win |

Reclassified rather than changed, each with the source that decides it:

- **g15, g34 acceptable.** `Niderlandy` is the dictionary's own entry (m.pl.);
  `Niderlandija` is not in it. `posěčajut` is the present-imperfective rule, which
  quotes the verbs page's warning against the perfective present. `Turisti` is the
  animate plural the nouns page gives, and g15 itself writes it.
- **g33 acceptable.** `svojej` is what the pronouns page prescribes ("Whenever the
  possessor is also the subject of the sentence, the reflexive svoj is used");
  `kuriti` + accusative is the verb the dictionary marks transitive "smoke".
- **g26 parser.** Stanza makes "others" a modifier of "Winter" and "Winter" an
  apposition of "Summer", so no clause exists for "drugi zimu".

### g13 stays a defect, on purpose

"Father couldn't find his keys anywhere" -> gold `najdti` (pf), ours `nahoditi`
(ipf, the visible `aspect.default.imp` guess). UD gives "could" no tense, and the
obvious rule - the object of a past modal is a completed event - makes the ability
reading wrong: "He could read books" is `mogl čitati`, imperfective. No page states
which reading to pick, and a guess shown as a guess is better than a rule that is
wrong half the time. It stays classified `defect` because the output is wrong for
this sentence, not `acceptable`.

---

## VERIFIED: a real parallel text - UDHR Article 1 and the Lord's Prayer (2026-10-25)

The first test against text written outside this repo on BOTH sides: van Steenbergen's
own Interslavic of UDHR Article 1 (credited "IJzeren Jan",
https://cals.no/translation/udhr-art-1/language/interslavic), against the official UN
English and Russian. Added as gold g50, g51, g50-ru, g51-ru. The Lord's Prayer
(Synodal Russian, Interslavic from Simple English Wikipedia) was tried too. Its
Church-style Russian defeats the parser ("Отче" INTJ root, "да" as CCONJ, "будет"
Tense=Pres), so it is not gold, but it surfaced three general defects.

Correction: an earlier entry said no Russian gold existed. 14 Russian
pairs were already there. Their TARGETS are van Steenbergen's, but their Russian
SOURCES were written in this repo. The UDHR pairs are the first whose Russian is
independent.

| defect | fix and source | before -> after |
|---|---|---|
| "Все" -> `cěly` "whole" | curated `vėś`; pronouns page "ves ... all", plural `vsi` | Cěli ljudi -> Vsi ljudi |
| Russian zero copula before a short passive participle | copula stage; verbs page "byti + passive participle" | Oni obdarjene -> Oni sut obdarjeni |
| predicate agreeing with `oni` not animate | pronouns page table: oni "masc.anim.", one "other" | obdarjene -> obdarjeni; "They are tired" -> utomljeni |
| a second predicate ("i должны") agreed with nothing | the subject is shared up a conj/xcomp chain | dolžne -> dolžni |
| adjective complement copied the Russian instrumental / got no agreement in English | nominative, agreeing; his "rodęt sę svobodni i råvni" (one authoritative example, no counter-example in pages or corpus; nouns excluded, so "stala lěkarem" keeps its instrumental) | svobodnymi i ravnymi / svobodna i ravna -> svobodni i ravni |
| fixed expressions translated word by word | exact-gloss lookup of the whole `fixed` phrase | prijatelj prijatelja -> jedin drugogo (dictionary pron.rec., pronouns page formula) |
| "human beings" as adjective + noun | exact gloss "human being" = `člověk`, one-word targets only | člověčje jestestvo -> ljudi |
| "are born" as a passive of "bear" | exact gloss "be born" = `roditi sę`, finite, tense from "are" | sut trpěni -> rodet se |
| "should" unhandled | `imati` (dictionary v.aux. "must, have to"); his "imajųt postųpati" | dolžnogo postupajut -> imajut postupati |
| "rights" -> `pravica` "right (pol.)" | an unsupported abbreviated domain label no longer outranks a plain gloss on position | pravicah -> pravah |
| adjective in a slot that marks no gender failed to inflect | form selection treats a key a form does not carry as undistinguished there | dolžnikam naš -> dolžnikam našim |
| planet `Zemja` for lowercase "земле" | the source lemma's capital decides between case-variant glosses | na Zemji -> na zemji |
| semicolons and an interior "!" dropped | carried over like commas | clauses no longer run together |
| "она пишет" -> `pišati` "pee" | the objectless-transitive penalty is English-only (it exists for "leave"); Russian homograph "писать" | ona pišaje -> ona piše |

Every change was measured against all 238 fixtures and the gold set. Each changed only
its target outputs, plus "Oni sut utomljeni" (the oni rule). The gold score held at 31
exact. The new pairs are classified:
- g50 and g50-ru are acceptable: only the dictionary's type-1 `dostojenstvo`
  where he writes `dostojnost`, and `svojem` from Russian "своём".
- g51 and g51-ru are unsupported: the reciprocal with a preposition, "jedin K
  drugomu", needs the preposition inside the formula.

Left open, with the reason:
- the reciprocal with an inner preposition;
- `do` vs `k` for "towards" (the prepositions page lists both);
- the English participle's aspect (obdarjani/obdarjeni);
- "endowed with" keeping a comitative `s`;
- the archaic Russian of the prayer (сущий, Царствие, приидет);
- the parser's `да`.

---

## VERIFIED: two more of van Steenbergen's own texts (2026-10-25)

Sources:
- **"The North Wind and the Sun"** (http://steen.free.fr/interslavic/northwind.html),
  against the standard IPA-handbook English. Added as gold g52-g56. His sentences 3
  and 4 render English sentence 3.
- **"Věža Babelja"** (http://steen.free.fr/interslavic/babel_text.html), against the
  Synodal Russian of Genesis 11:1-9. Not gold: his text is a retelling, not a
  translation of the Synodal. The Russian verses were used to find defects, as the
  Lord's Prayer was.
- The UDHR gold source now points at his own page,
  http://steen.free.fr/interslavic/declaration.html. Its text is identical to the
  Conlang Atlas copy.

| defect | fix and source | before -> after |
|---|---|---|
| verb singular for "X and Y" | subjects joined by and/и are plural; his "Sěverny Větr i Solnce sporili se" | osparjal -> osparjali |
| "traveler" untranslated | a miss is retried in the other spelling (the dictionary mixes "color" and "traveller") | traveler -> putujuči |
| "as hard as he could" left "could" raw | a bare modal is still the modal; his "kako mogl" | kak on could -> kak on mogl |
| "warmly" untranslated | adjectives page: "Adverbs can be derived from adjectives by using the ending -o ... identical to the neuter singular" | warmly -> teplo |
| "at last" word by word | preposition + word as an exact one-adverb gloss | na poslědnjej -> nakonec (his "I nakonec") |
| "should be considered" conjugated "be" | the passive "be" after a modal stays infinitive | imaje jest -> imaje byti |
| Russian hortative "построим" took the outer clause's person | a subjectless Russian verb keeps its own Person/Number | sbudujut -> sbudujemo |
| "друг другу" -> prijatelj prijatelju | reciprocal halves -> jedin + drugy in its own case, masculine; pronouns page "the formula jedin drugogo", his Babel "jedin k drugomu" | -> jedin drugomu |
| standalone "один" feminine | an agreeing word with no noun takes the gender the source marks | jedna -> jedin |
| "того" -> tamtogo "that over there" | curated тот/то -> tȯj; pronouns page "The primary demonstrative pronoun is toj" | tamtogo -> togo |

Each fix was measured against every fixture and the gold set. Only its target changed,
plus g23-ru: the parser misreads "Я мою себя", and the output went "moj" -> "moju".
The gold score holds at 31 exact; the new North Wind pairs are classified.

The engine cannot fix these, because they are the parser's:
- smešat'/obžeč' are lemmatised as "смесать"/"обождать";
- рассеяться is lemmatised as "рассеваться";
- "сойдем" is tagged 2nd person;
- "один у всех язык" is parsed with "один" as the subject.

"Господь" is not in the dictionary.

Left open:
- English noun compounds: "North Wind" should be an adjective + noun, "Sěverny Větr";
- the correlative comparative ("čim ..., tym ...");
- "the one who" -> "togo, kto";
- causative "make X do";
- "of the two" -> "iz njih dvoh";
- the "out" particle read as "von".

---

## VERIFIED: four batches of ordinary modern sentences, then stop (2026-10-25)

The rule for calling this round done:
1. Run real everyday sentences.
2. Fix only the GENERAL bugs, meaning patterns that break many ordinary sentences.
3. Log rare constructions instead of building them.
4. Stop when the batches stop turning up general bugs.

The source is Tatoeba (https://tatoeba.org, CC BY 2.0 FR). Each batch was drawn at
random: Interslavic sentences of 4-12 words, Latin script, with a human English or
Russian translation. The Interslavic is community-written, so it was read as evidence
of usage, not as a target. Every rule below cites the grammar pages, the dictionary,
van Steenbergen's own texts, or Tatoeba usage counts. The tests (and their Tatoeba
IDs) are in packages/engine/test/everyday-sentences.test.ts.

| batch | sentences | exact matches | general bugs found (all fixed) |
|---|---|---|---|
| 1 | 30 | 4 -> 6 | 6: "It's a/This is a/Это" -> To jest (Tatoeba: 39 "To jest" vs 2 "Ono jest", 0 "Tuto/Tutoj jest"); "-ing" complement -> infinitive (his "prěstali budovati"); "let me" no longer read as "let us"; Russian name "Том" no longer the noun "том"; "everything"/"всё" neuter vse; Russian short adjective "прав" |
| 2 | 25 | 6 | 2: "his X" INSIDE the subject is not svoj ("Jego brat jest vysoky"), and a possessive no longer ranks as the PERSONAL pronoun (UD "Prs" never matched the dictionary's "pers"/"poss"), which turned "Her grandmother" into "Ona baba"; ne before an inserted copula ("My ne jesmo idioti"; syntax page "Tuto avto ne jest drago") |
| 3 | 25 | 5 | 6: "will be" -> budu, not "budu jesm"; Russian "буду" is future (Stanza tags it present); the impersonal past is neuter ("bylo zimno"); the copula follows a fronted phrase AND the subject; "don't X" is an imperative; "no one" -> nikto with one ne |
| 4 | 25 | 4 | 3: "to be"/"can be" -> byti; "too" = takože unless it modifies an adjective (zamnogo); "At home," -> doma despite the comma |

Also fixed along the way:
- English noun modifiers become adjectives ("Sěverny větr", as he writes it).
- UD's PronType "Prs" never matched the dictionary's "pers"/"poss", so possessives
  ranked as personal pronouns.
- A curated "tutoj" never matched the dictionary's "tutȯj".
- Agreement no longer overwrites the case a word's own preposition gives it.

Every change was measured against all fixtures and the gold set:
- Gold holds at 31 exact.
- The only other outputs that changed:
  - "It is a good book" -> To jest;
  - "This is the biggest house" -> To jest;
  - "One of them" -> Jedin;
  - g52/g53 -> koj, ktory, drugy (his masculine);
  - g23-ru "moj" -> "moju" (a parser misreading either way).

**The trend: 6, 2, 6, 3 general bugs per batch.** That does not converge cleanly. Each
batch still finds a few common constructions, but they get narrower:
- batch 4's were a single word sense, an infinitive copula and a comma.
- The exact-match rate on random community sentences holds at about 20%.
- Most of the rest differ only in equally valid words, the T-V choice, or the speaker's
  gender (which the source does not give).

Stopped here, per that rule.

Known and left open:
- **Rare constructions:**
  - "let me + verb" (one Tatoeba example only);
  - the correlative comparative ("čim ..., tym ...");
  - "the one who";
  - causatives;
  - "jedin k drugomu" with an inner preposition;
  - "of the two";
  - idioms ("how about you", "the hell", "chickens out", "are we there yet").
- **Names:** English names Stanza tags PROPN can still match a common noun ("Trump" ->
  kozyr). English capitalises common nouns too, so a gate there broke "Father", "the
  Sun" and "God". Russian names stay in Cyrillic.
- **Word sense:** "fix" -> naznačati, "time" -> raz, "once" -> raz, "yet" -> jednako.
- **Parser** (Stanza): mis-lemmatised Russian verbs (смешаем, обожжем, рассеемся),
  "сойдем" tagged 2nd person, "Отче" as an interjection.
- **Dictionary gaps:** Господь, бессрочный, эфиопка, пицца, "asleep", "concerned".

---

## VERIFIED: the rare constructions and the names (2026-10-25)

Built, each from a source:

- **Russian names in Latin.** The flavourisation page's East Slavic row (я ю йо/ьо
  (й)е/ье и/ьи ль нь = ja ju jo je ji lj nj, http://steen.free.fr/interslavic/flavorizacija.html),
  its "šč ... can also be written щ", and the orthography page's shared letters give a
  complete table: Зульфия -> Zuljfija, Том -> Tom, Наталья -> Natalja, Елена -> Jelena.
  Where a letter is not covered (э, ъ, a soft sign elsewhere: Эдуард, Господь), the name
  stays in Cyrillic, not guessed.
- **"jedin k drugomu".** The preposition goes inside the reciprocal (his UDHR and Tower
  of Babel). "towards one another" -> "jedin k drugomu", exactly his g51 phrase.
- **"the more ..., the more ..." -> "čim ..., tym ..."** (his North Wind):
  "čim vyše on vějal, tym vyše ...".
- **"the one who" -> demonstrative + kto.** His North Wind has "togo, kto"; the Wikipedia
  has toj, kto 2, togo, kto 5, tyh, kto 3, ti, kto 2.
- **Partitive "of" -> iz + genitive.** His North Wind "koj iz njih", "iz njih dvoh"; the
  Wikipedia has 142 "jedin iz" and 46 "iz njih". "One of them" -> "Jedin iz njih".

Left open, with the reason:

- **English names that are also words** ("Trump" -> kozyr): tried and reverted. A
  narrower gate (no determiner, not sentence-initial, no capitalised gloss) still broke
  "North Wind", "God" and a misparsed "Winter". Telling a name from a capitalised
  common noun needs named-entity recognition (Stanza's NER model). That is an extra
  download and memory cost on this machine, so it was not added.
- **"let me + verb":** the only evidence is one Tatoeba sentence ("Daj mi znati"), with
  nothing in the pages or the Wikipedia.
- **Causative "make X do":** one example ("pričiniti, že ... sojme"), and the clause
  restructuring it needs is not general.
- **Idioms** ("how about you", "the hell"): phrase-by-phrase, no rule.

---

## VERIFIED: asking someone's name (2026-10-25)

"What is your name" was compared with another tool's "Kak se ty zoveš?". Ours was
"Čto jest vaše ime".

- **"vaše" (polite you) is right** for a stranger: "vy is a universal second person
  pronoun for both numbers, whereas the second person singular ty is used only for
  addressing friends, relatives and children" (pronouns page). The other tool's "ty"
  is the familiar form.
- **"čto" was a calque.** Slavic asks a name with "how": Russian "Как ваше имя?",
  Croatian "Kako je vaše ime?", Czech "Jak se jmenujete?", Tatoeba's Interslavic "kak
  on se imenuje" (12987096). Our own Russian path already gave "Kak jest vaše ime?".
  Now "What is your name?" is "Kak jest vaše ime?"; only a name - "What is your
  address?" stays "Čto jest vaš adres?".
- **Found on the way: "What is this/that?"** was "Čto jest tutoj/toj?", masculine.
  Tatoeba writes "Čto jest to?" for "What's that?" (12984803), the neuter
  presentational "to" the engine already used before a noun. Now "Čto jest to?" and
  "Kto jest to?".

Left as is: with no question mark typed, none is added - the output keeps the
source's punctuation. "Kak se zovete?" (reflexive verb) is the other natural way to
ask; "Kak jest vaše ime?" mirrors the English and the Russian it is translated from.
