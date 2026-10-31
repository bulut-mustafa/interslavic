# Testing and verification

How the translator is checked, beyond a green test suite. What was found, and what
remains unverified, is recorded in [verification-log.md](verification-log.md).

Correctness is audited three ways, not just by a green suite.

**Mutation testing** — `bash scripts/mutation-audit.sh` injects a deliberate bug, one at a
time, and checks the suite catches every one; a surviving mutation means fake coverage.
**Do not edit the files it targets while it runs**: it snapshots each one and restores that
snapshot after every mutation, so an edit made mid-run is silently reverted. If the run is
killed outright (an out-of-memory watchdog sends SIGKILL, which no trap can catch), the
backups stay in `.mutation-backup/` and **the next run restores them first** and says so. `FROM`/`TO` run a slice by index and `TEST_CMD` overrides the
runner, so a machine short of memory can still complete it:
`FROM=1 TO=45 TEST_CMD="npx vitest run --silent --pool=forks --poolOptions.forks.maxForks=1" bash scripts/mutation-audit.sh`

The audit runs the whole suite once per mutation, so the suite's own speed is the
audit's cost. It is 25s, and `vitest.config.ts` explains the settings that got it there
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
documented fallback we were not entitled to, and plurale tantum nouns that never
inflected at all. Where it disagrees with van Steenbergen's pages, the pages win — and on
some irregular nouns they do, because the reference ignores the dictionary's own principal
parts.
`npm run fixtures:check` re-parses every frozen fixture against live Stanza and diffs it.
See [verification-log.md](verification-log.md) for what is verified, what was
wrong, and what remains unverified.
