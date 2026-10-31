# Design

How the translator is built and why. For what it does and how to run it, see the
[README](../README.md).

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
   candidates: "give" can rank `dati` (perfective) above `davati` (imperfective), and a
   perfective present reads as a *future* in Interslavic — the error the
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

## Where the grammar pages are silent

They have no page on case usage, so some questions cannot be answered from them at all.
Those rules are settled instead from **attested usage** — van Steenbergen's own parallel
texts (`maly_princ`, `babel_text`, `schleicher`, `northwind`, `selo`, `volk_i_pes` …) and
the Interslavic Wikipedia at `incubator.wikimedia.org/wiki/Wp/isv`, searchable with
`insource:/…/ prefix:Wp/isv`. That is a tier below the normative pages and above research:
every such rule quotes its source in the code. Neither corpus is committed.

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
