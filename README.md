# Interslavic Translator

A rule-based, deterministic translator into **Interslavic** (Medžuslovjansky) that shows
its reasoning for every word.

Dictionaries look Interslavic words up one at a time; this project translates whole
sentences and explains every word it chose, so a learner can follow - and check - the
grammar.

**Try it online: https://interslavic.web.app** - free, no sign-up.

## What it does

- Translates **English, Russian and Ukrainian into Interslavic**, written in Latin, Cyrillic, or the
  etymological and simplified alphabets.
- Shows **why each word has its form**: tap a word to see its case, aspect, gender and
  number, the rule that decided it, and the source of that rule - Jan van Steenbergen's
  grammar pages, the Interslavic dictionary, or attested usage (Tatoeba, the Interslavic
  Wikipedia).
- Says **how sure** it is. Where English gives no information (aspect, say) the choice is
  marked as a guess; English idioms with no sourced equivalent are flagged instead of
  translated as if they made sense.
- Checks **every output word** against a full-form lexicon generated from
  the dictionary, so invented non-words are caught.
- Includes **16 short lessons** and a **phrasebook** with flashcards, in Latin and Cyrillic.

It is rule-based and deterministic, not a neural or LLM translator: a parser analyses the
source sentence, and documented rules plus the dictionary build the Interslavic. How each
rule was checked is recorded in [docs/verification-log.md](docs/verification-log.md). All the
documentation is listed in [docs/README.md](docs/README.md).

## Try it

```bash
npm install
npm run lexicon:fetch       # dictionary snapshot (not committed)
npm run parser:setup        # one-off: Python venv + Stanza models for en, ru, uk (a large download)
```

**Web UI** — three processes, one per terminal:

```bash
npm run parser              # UD parsing   (127.0.0.1:8765)
npm run server              # engine API   (127.0.0.1:8766)
npm run web                 # interface    (127.0.0.1:5174)
```

Then open <http://127.0.0.1:5174>. The server builds the lexicon and its full-form
index once at boot, so translations are fast after that.

**Learn** - beside the translator, the site has 16 lessons (alphabet to word formation)
and a phrasebook with flashcards, in `packages/web/src/learn/`. Lessons are data, and
`packages/web/test/lessons.test.ts` checks every Interslavic word on them against the
lexicon, every table cell against the engine, and every "Try it" example against the
translator's own output.

**Online** — the pages are served from Firebase Hosting and the translator runs on Google
Cloud Run; every page has a *Report a problem* button whose reports the server keeps.
See [DEPLOY.md](DEPLOY.md).

**Command line** — needs only the parser:

```bash
npm run isv -- "The woman read a book."
npm run isv -- "Мальчик даёт девочке книгу." --lang ru
npm run isv -- "Хлопчик дає дівчинці нову книгу." --lang uk
npm test
```

Type any English, Russian or Ukrainian sentence. The first request loads a language model and
takes a few seconds; after that it is fast.

```
npm run isv -- "She did not know the answer." --brief
  source   She did not know the answer.
  standard Ona ne znala odgovor.
  checked  100% of words found in the full-form lexicon
```

Every emitted word is checked against a generated full-form lexicon, so the
engine catches its own invented non-words. `--no-validate` skips the check.

**Read this if you are learning from the output.** That check proves the *words* are real
Interslavic forms. It does **not** prove the sentence means what you asked. The two are
separate: a sentence made of real words can still mean something else.

Meaning is measured separately, against Interslavic written by the language's co-author
(`npm test` runs it): see **[docs/verification-log.md](docs/verification-log.md)** for the
current score, the bugs that measurement caught, and the differences that remain.

A pre-parsed fixture works too, and needs no running service:

```bash
npm run isv -- packages/engine/test/fixtures/parse/en/water-is-cold.conllu
```

Correctness is audited three ways, not just by a green suite: mutation testing, a second
independent engine used as an oracle, and frozen parser fixtures. How to run each is in
[docs/testing.md](docs/testing.md); what was found is in
[docs/verification-log.md](docs/verification-log.md).

### Example output

```
  source   The boy gives the girl a book.
  standard Hlapec davaje děvě knigu.

  hlapec   <- boy   [hlåpėc, m.anim.]
      Case = Nom  (certain)  <- subject (nsubj)
  davaje   <- gives   [davati, v.tr. ipf.]
      Aspect = Imp  (high)  <- present tense requires imperfective -
                                a perfective present reads as a future in Interslavic
      chose over: ... dati (v.tr. pf.)
  děvě   <- girl   [děva, f.]
      Case = Dat  (certain)  <- indirect object (iobj) of "gives"
  knigu   <- book   [kniga, f.]
      Case = Acc  (default)  <- direct object of "gives" - no governance entry for this verb
```

`--orth=` selects `etymological`, `standard`, `simplified` or `cyrillic`:

```
etymological   Hlåpėc davaje děvě knigų.
standard       Hlapec davaje děvě knigu.
simplified     Hlapec davaje deve knigu.
cyrillic       Хлапец даваје дєвє книгу.
```

### What is still wrong, and why

Word **choice** is the weak layer, not grammar. When several dictionary senses carry the
same English gloss, or a word is glossed under a different English word, the engine can pick
the wrong one. The zonal WordNet was evaluated as the fix and **rejected on measurement** —
it replicates the same gaps. See [docs/verification-log.md](docs/verification-log.md).

## How it works

A parser (Python, Stanza) analyses the source sentence; a TypeScript engine then runs a fixed
series of stages - prepositions, auxiliaries, negation, verb government, lexical transfer,
agreement, realisation, orthography - and every decision carries the rule that made it and
where that rule comes from. The parser parses and nothing else.

The pipeline, the design rules, the interface and where the grammar pages are silent are in
[docs/design.md](docs/design.md).

## Attribution

Interslavic vocabulary comes from the **Medžuslovjansky slovnik**
([interslavic-dictionary.com](https://interslavic-dictionary.com/)), maintained by Sergey
Cherebedov and contributors, with the lexicon originating in
[Jan van Steenbergen's](http://steen.free.fr/interslavic) work.

Grammar rules are cited to Steenbergen's grammar pages, with some quotations from the same
grammar on [interslavic.fun](https://interslavic.fun/learn/grammar/) and attested usage from
the [Interslavic Wikipedia](https://isv.miraheze.org/) (CC BY-SA 4.0) and
[Tatoeba](https://tatoeba.org). Terms for each are in [DATA-LICENSES.md](DATA-LICENSES.md).

Inflection uses [`@interslavic/morphology`](https://www.npmjs.com/package/@interslavic/morphology) (MIT).
Forms are cross-checked against [`@interslavic/utils`](https://www.npmjs.com/package/@interslavic/utils)
(MIT), the older engine behind interslavic-dictionary.com, used as a verification oracle only.
Both come from the same authors, so they are independent *implementations* rather than
independent sources — enough to catch a coding error, not a shared misreading of the grammar.

**The dictionary snapshot is deliberately not committed to this repository.** Its wordlist
traces to Jan van Steenbergen's work and carries no explicit license of its own, so this project
is for personal, non-commercial use with attribution. `packages/lexicon/data/provenance.json`
records the exact source URL, checksum and row count instead. See
[docs/dictionary-provenance.md](docs/dictionary-provenance.md).

## License

The code is [MIT](LICENSE). The dictionary is not included (it is fetched at build
time), and the texts quoted from van Steenbergen and Tatoeba keep their own licenses -
see [DATA-LICENSES.md](DATA-LICENSES.md). Reports of wrong translations are welcome as
GitHub issues, or with "Report a problem" on the site.
