import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['packages/**/test/**/*.test.ts', 'packages/**/test/**/*.test.tsx'],
    testTimeout: 30000,
    /**
     * The suite is run 264 times by the mutation audit, so its per-run cost is
     * the audit's whole cost. Measured on an 8-core, 8 GB machine:
     *
     *   default (isolated, unbounded forks)   killed by the OOM watchdog
     *   maxForks=1, isolate=true              78.5s
     *   maxForks=1, isolate=false             57s
     *   maxForks=4, isolate=false             25s   <- here
     *
     * Only 7.3s of that is running tests; the rest is Vite evaluating the
     * module graph once per test file. `isolate: false` lets the workers reuse
     * their environment instead of rebuilding it 33 times.
     *
     * `maxForks` is capped rather than left to default: unbounded workers each
     * load their own copy of the 743k-form index, which is what the watchdog
     * was killing. 4 leaves headroom on 8 cores; 6 and 8 measured 24s, which
     * is not worth the risk of being killed halfway through a 2-hour audit.
     *
     * Isolation is off because no test file depends on another's module state -
     * each builds its own `Lexicon` and its own fixtures. If a test ever starts
     * failing only when run with others, that assumption is what broke.
     */
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 4, isolate: false },
    },
  },
});
