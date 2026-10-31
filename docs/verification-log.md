# Verification log

Every load-bearing claim in the project's design, with how it was checked. Started
because a vacuous test assertion was found in the suite, which made "the tests pass" an
inadequate answer to "is this correct?".

**Three categories, kept strictly separate:**
`VERIFIED` = checked empirically in this repo · `CORRECTED` = was wrong, now fixed ·
`UNVERIFIED` = sourced from research only, **not** independently confirmed.

The log runs from 2026-10-17 to 2026-10-30. It is split by topic; inside each file the
entries are in the order they were written, and the date is in each heading. Entries are
history: they are not rewritten when things change. Where a list was only true on its
date, the entry says so and points to what replaced it.

| File | What is in it |
|---|---|
| [foundations.md](verification/foundations.md) | The first audits: the limits of self-validation, the first real parses, the original claims (verified, corrected, unverified) |
| [testing-and-oracles.md](verification/testing-and-oracles.md) | The second engine used as an oracle, defects found in the suite, the mutation audits |
| [grammar.md](verification/grammar.md) | Reflexives, modals, coordination, verb government, tenses, aspect, prepositions, expressions translated whole |
| [lexicon-and-word-sense.md](verification/lexicon-and-word-sense.md) | Choosing the right dictionary word: word sense, the WordNet, experiments rejected, the dictionary's `type` and `intelligibility` columns |
| [gold-and-corpus.md](verification/gold-and-corpus.md) | Gold pairs, van Steenbergen's parallel texts, the corpus for what the grammar pages do not cover |
| [russian.md](verification/russian.md) | Russian as a source language |
| [ukrainian.md](verification/ukrainian.md) | Ukrainian as a source language |

**Adding an entry:** put it at the end of the file for its topic, with a dated `##`
heading and one of the three labels. How to run the checks is in
[testing.md](testing.md).
