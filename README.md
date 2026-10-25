# Interslavic Translator

A rule-based, deterministic translator into **Interslavic** (Medžuslovjansky) that shows
its reasoning for every word.

Nobody has shipped a translator *into* Interslavic: the official dictionary is word-lookup
only, and the one neural demo is paused. The missing work is all on the source-analysis and
transfer side, which is what this project builds.

## Try it

```bash
npm install
npm run lexicon:fetch       # dictionary snapshot (not committed)
npm run parser:setup        # one-off: Python venv + Stanza models (~1.3 GB)
```

**Web UI** — three processes, one per terminal:

```bash
npm run parser              # UD parsing   (127.0.0.1:8765)
npm run server              # engine API   (127.0.0.1:8766)
npm run web                 # interface    (127.0.0.1:5174)
```

Then open <http://127.0.0.1:5174>. The server builds the lexicon and the 743k-form
index once at boot, so translations are fast after that.

**Learn** - beside the translator, the site has 17 lessons (alphabet to word formation)
and a phrasebook with flashcards, in `packages/web/src/learn/`. Lessons are data, and
`packages/web/test/lessons.test.ts` checks every Interslavic word on them against the
lexicon, every table cell against the engine, and every "Try it" example against the
translator's own output.

**Online, for testers** — one container serves the page, the engine and the parser
on one address, with a *Report a problem* button whose reports the server keeps.
See [DEPLOY.md](DEPLOY.md): it runs on Google Cloud Run.

**Command line** — needs only the parser:

```bash
npm run isv -- "The woman read a book."
npm run isv -- "Мальчик даёт девочке книгу." --lang ru
npm test
```

Type any English or Russian sentence. The first request loads a language model and
takes a few seconds; after that it is fast.

```
npm run isv -- "She did not know the answer." --brief
  source   She did not know the answer.
  standard Ona ne znala odgovor.
  checked  100% of words found in the full-form lexicon
```

Every emitted word is checked against a generated full-form lexicon (286,457 forms), so the
engine catches its own invented non-words. `--no-validate` skips the check.

**Read this if you are learning from the output.** That check proves the *words* are real
Interslavic forms. It does **not** prove the sentence means what you asked. The two are
separate, and we learned it the hard way: "How are you doing?" once produced
`Kak ty dělaješ?` — "how do you do it?" — at 100% validation.

Meaning is measured separately, against Interslavic written by the language's co-author
(`npm test` runs it): see **[docs/verification-log.md](docs/verification-log.md)** for the
current score, the bugs that measurement caught, and the differences that remain. One is a
known defect: "party" resolves to `partija`, the *political* sense.

A pre-parsed fixture works too, and needs no running service:

```bash
npm run isv -- packages/engine/test/fixtures/parse/en/water-is-cold.conllu
```

Correctness is audited three ways, not just by a green suite.

**Mutation testing** — `bash scripts/mutation-audit.sh` injects a deliberate bug, one at a
time, and checks the suite catches every one; a surviving mutation means fake coverage.
**Do not edit the files it targets while it runs**: it snapshots each one and restores that
snapshot after every mutation, so an edit made mid-run is silently reverted. If the run is
killed outright (an out-of-memory watchdog sends SIGKILL, which no trap can catch), the
backups stay in `.mutation-backup/` and **the next run restores them first** and says so. `FROM`/`TO` run a slice by index and `TEST_CMD` overrides the
runner, so a machine short of memory can still complete it:
`FROM=1 TO=45 TEST_CMD="npx vitest run --silent --pool=forks --poolOptions.forks.maxForks=1" bash scripts/mutation-audit.sh`

The audit runs the suite 264 times, so the suite's own speed is the audit's
cost. It is 25s, and `vitest.config.ts` explains the settings that got it there
from 78s - the short version is that only 7s of a run is testing, and capping
the worker count is what stops the out-of-memory watchdog killing the pool.
Closing other applications matters more than it sounds: with swap near full the
pool cannot run in parallel at all.

**A second, independent engine** — `@interslavic/utils`, the inflection and transliteration
engine behind interslavic-dictionary.com, is used as an oracle for every form we emit:

```bash
node --experimental-strip-types packages/eval/scripts/diff-orthography.ts   # all 4 scripts, every form
node --experimental-strip-types packages/eval/scripts/diff-paradigms.ts     # case/number slots
node --experimental-strip-types packages/eval/scripts/score-gold.ts         # meaning, per construction
```

It found two real defects the full-form validator could not: a Cyrillic rule that took a
documented fallback we were not entitled to, and 155 plurale tantum nouns that never
inflected at all. Where it disagrees with van Steenbergen's pages, the pages win — and on
17 irregular nouns they do, because the reference ignores the dictionary's own principal
parts.
`npm run fixtures:check` re-parses every frozen fixture against live Stanza and diffs it.
See [docs/verification-log.md](docs/verification-log.md) for what is verified, what was
wrong, and what remains unverified.

### Where the grammar pages are silent

They have no page on case usage, so some questions cannot be answered from them at all.
Those rules are settled instead from **attested usage** — van Steenbergen's own parallel
texts (`maly_princ`, `babel_text`, `schleicher`, `northwind`, `selo`, `volk_i_pes` …) and
the Interslavic Wikipedia at `incubator.wikimedia.org/wiki/Wp/isv`, searchable with
`insource:/…/ prefix:Wp/isv`. That is a tier below the normative pages and above research:
every such rule quotes its source in the code. Neither corpus is committed.

### What is still wrong, and why

Word **choice** is the weak layer, not grammar. `party` resolves to the political
`partija` because all four dictionary senses carry the bare gloss "party"; `floor` and
`coat` miss because the Interslavic word is glossed under a different English word (`etaž`
"storey", `paljto` "overcoat"). The zonal WordNet was evaluated as the fix for this and
**rejected on measurement** — it replicates the same gaps. See the log.

Output:

```
  source   The boy gives the girl a book.
  standard Hlapec davaje děvě knigu.

  hlapec   <- boy   [hlåpėc, m.anim.]
      Case = Nom  (certain)  <- subject (nsubj)
  davaje   <- gives   [davati, v.tr. ipf.]
      Aspect = Imp  (high)  <- present tense requires imperfective -
                                a perfective present reads as a future in Interslavic
      chose over: ... dati (v.tr. pf., freq 7606)
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

## The interface

Two panes, with the per-word analysis beneath them. The design has one job beyond
translating: showing where the engine is guessing, because the reader cannot yet judge
Interslavic unaided.

- **A confidence rail** runs down the left of every analysis line. Teal is certain, amber is
  a default with known exceptions, plum is a guess. You scan one column to find the doubt.
- **Feature names are written out** — "nominative", not `Nom` — with the reason beside the
  value ("subject (nsubj)").
- **Alternatives are shown** wherever the engine had to choose.
- **Unverified words are marked** in the output and listed, so an invented form cannot slip
  past unnoticed.
- **The other script sits under the translation.** Interslavic's Latin and Cyrillic map 1:1,
  which is the defining fact about how it is written, so the alternate is always visible
  rather than hidden behind the switcher.

Typography is IBM Plex Serif and Sans, chosen for a real constraint rather than taste: the
etymological alphabet needs `ě ų å ė ȯ ć đ ŕ ť ś ź` and the Cyrillic output needs Cyrillic,
and most display faces drop those glyphs.

## How it works

```
text → parse (Python/Stanza, UD)
     → plan prepositions → auxiliaries and modals → negation → verb government
     → lexical transfer (aspect first, then the lexeme)
     → numeral government → agreement → predicate agreement → past participle
     → realise → linearise → orthography → gloss
```

Each arrow is one file in `packages/engine/src/stages/`, and the order above is declared
in `stages/index.ts` as what each stage reads and writes. A test fails if a stage reads
something no earlier stage has written — the ordering contract used to live in comments,
and a stage reading an empty map is invisible to the type checker and to every output test.

The Python service parses and nothing else; every translation decision lives in the
TypeScript engine, which keeps it swappable and the interesting logic in one place.
Parser output is frozen as CoNLL-U fixtures, so the test suite needs no Python, no models
and no network.

Design rules worth knowing before changing anything:

1. **Every feature assignment is a `Decision<T>`** carrying a rule id, a confidence, a
   human-readable justification and the rejected alternatives. Resolvers may not write a
   bare value. Glossing is structural, not retrofitted.
   The rule id reaches the output, and `packages/rules/data/rule-registry.json` says where
   each rule comes from - its tier, its source and, where the grammar states it in a
   sentence, the verbatim quote. A test fails if the engine can emit a rule the registry
   does not cite, so a rule cannot be added without saying what says so, and the UI shows
   that citation beside the decision it justifies.
2. **Aspect is resolved before the lexeme is finalised.** Aspect is a *filter* on
   candidates: "give" ranks `dati` (perfective, freq 7606) above `davati` (imperfective,
   freq 6395), and a perfective present reads as a *future* in Interslavic — the error the
   standard explicitly warns against.
3. **Confidence is honest.** `nsubj`→Nom is `certain`; `obj`→Acc is only `default`, because
   many verbs govern genitive or instrumental and we have no frame for them yet. Visible
   wrongness beats invisible wrongness.
4. **Orthography is a pure post-processing function**, which is why four variants are cheap.
5. **Parser output is frozen as CoNLL-U fixtures**, so the test suite needs no Python, no
   models and no network, and a parser upgrade becomes a reviewable diff.
6. **Some English words are deleted, not translated.** Articles, do-support, and the case
   markers "of" and recipient "to" have no Interslavic equivalent; the gloss says why each
   one went.

## Attribution

Interslavic vocabulary comes from the **Medžuslovjansky slovnik**
([interslavic-dictionary.com](https://interslavic-dictionary.com/)), maintained by Sergey
Cherebedov and contributors, with the lexicon originating in
[Jan van Steenbergen's](http://steen.free.fr/interslavic) work.

Inflection uses [`@interslavic/morphology`](https://www.npmjs.com/package/@interslavic/morphology) (MIT).
Forms are cross-checked against [`@interslavic/utils`](https://www.npmjs.com/package/@interslavic/utils)
(MIT), the older engine behind interslavic-dictionary.com, used as a verification oracle only.
Both come from the same authors, so they are independent *implementations* rather than
independent sources — enough to catch a coding error, not a shared misreading of the grammar.

**The dictionary snapshot is deliberately not committed to this repository.** Its wordlist
traces to CC BY-NC-ND material and carries no explicit license of its own, so this project
is for personal, non-commercial use with attribution. `packages/lexicon/data/provenance.json`
records the exact source URL, checksum and row count instead. See
[docs/dictionary-provenance.md](docs/dictionary-provenance.md).
