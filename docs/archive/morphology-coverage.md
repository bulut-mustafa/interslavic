# M0 audit: `@interslavic/morphology` coverage

> **Archived.** A one-time audit from before the engine was built; its verdict (use the library)
> was acted on. Kept for the record, not maintained. Current checks are in
> [../verification-log.md](../verification-log.md).

**Date:** 2026-10-17 · **Version probed:** `@interslavic/morphology@0.1.2` (MIT, ESM-only, `node>=20`)

## Verdict: GATE PASSED. Use the library; author no paradigm tables.

Probed by calling `inflect({form, xpos})` on **every inflectable dictionary entry**
(17,982 of 19,100 rows, filtered to noun/adjective/verb/pronoun/numeral classes).

| Result | Count | Share |
|---|---|---|
| Crashed | **0** | 0.00% |
| Inflected successfully | 16,338 | 90.86% |
| Returned an empty paradigm | 1,644 | 9.14% |

### The 9.14% gap is entirely ours, not the library's

Categorising every empty result:

| Cause | Count |
|---|---|
| Multiword lemma (`adaptivny režim`, `bojati sę`) | 1,451 |
| Comma-separated synonym list (`altana, altanka`) | 193 |
| **Single-word lemma the library genuinely cannot inflect** | **0** |

Preprocessing — take the first comma variant, then inflect the head word — recovers
**1,644 / 1,644 (100%)**. The `v.refl.` class initially looked catastrophic at 606/606
empty; every reflexive verb is simply a ` sę` multiword entry.

So coverage for single-word lemmas is effectively complete. No fallback paradigm engine
is needed, and the biggest risk to the approach is retired.

## API facts established by probing

- Exports are exactly `inflect`, `derive`, `detectPos`.
- The `exports` map permits only `.` and `./package.json`, so **deep imports are blocked**.
  Internal helpers such as `steen/split-lemmas.ts` must be reimplemented, not imported.
- **`inflect()` returns an entire paradigm, not one form.** `inflect('žena')` → 14 tokens.
  The wrapper's real job is therefore *form selection by feature matching*.
- Nouns carry `Gender`/`Case`/`Number`; verbs additionally carry
  `Aspect`, `VerbForm`, `Mood`, `Tense`, `Person`, `Variant`, `Voice`.
- **Syncretism is pervasive.** For `žena`, the form `ženy` serves Nom.Pl, Acc.Pl *and*
  Gen.Sg simultaneously. Consequences:
  - generation must break ties deterministically (we prefer `Variant: Long`);
  - **reverse analysis cannot return a single reading** and must return a set.
- Irregular stems can be pinned by passing an array of forms, which is exactly what the
  dictionary's `addition` column supplies.

## Cross-checked forms

Derived by hand from the grammar tables *before* running the library, then compared:

| Lemma | Features | Grammar table predicts | Library returns |
|---|---|---|---|
| `hlåpėc` (m.anim.) | Nom.Sg | root unchanged | `hlåpėc` ✓ |
| `děva` (f.) | Dat.Sg | root + `ě` | `děvě` ✓ |
| `kniga` (f.) | Acc.Sg | root + `ų` | `knigų` ✓ |
| `davati` (v.tr. ipf.) | 3.Sg.Pres | `-ati` → `-aj-` + `-e` | `davaje` ✓ |

## Follow-up

Jan van Steenbergen's own generators are reachable and serve as an **independent second
oracle** for golden tests (the npm library and the Rust port share a lineage, so they are
not independent of each other):

- `http://steen.free.fr/interslavic/declinator.html`
- `http://steen.free.fr/interslavic/adjectivator.html`
- `http://steen.free.fr/interslavic/conjugator.html`
