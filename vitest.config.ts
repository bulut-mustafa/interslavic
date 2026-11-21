import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Files that replace a module with vi.mock. With isolate:false the module
 * registry is shared, so a file that mocked ../src/video/transport.ts left
 * VideoEditor bound to that mock for the next file, which expected another one
 * (the video-editor-integration and waveform tests failed in a full run and
 * passed alone). These few files run isolated in their own project instead.
 */
const MOCKING = [
  'packages/web/test/photo-cutout-wiring.test.tsx',
  'packages/web/test/studio-workspace.test.tsx',
  'packages/web/test/video-timeline-ui.test.tsx',
  'packages/web/test/video-editor.test.tsx',
  'packages/web/test/video-features.test.tsx',
  'packages/web/test/video-editor-integration.test.tsx',
  'packages/web/test/phone-video.test.tsx',
];
const INCLUDE = ['packages/**/test/**/*.test.ts', 'packages/**/test/**/*.test.tsx'];

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      { extends: true, test: { name: 'shared', include: INCLUDE, exclude: [...MOCKING, '**/node_modules/**'], pool: 'forks', poolOptions: { forks: { maxForks: 2, isolate: false } } } },
      { extends: true, test: { name: 'mocking', include: MOCKING, pool: 'forks', poolOptions: { forks: { maxForks: 2, isolate: true } } } },
    ],
    testTimeout: 30000,
    /**
     * The suite is run 264 times by the mutation audit, so its per-run cost is
     * the audit's whole cost. Measured on an 8-core, 8 GB machine:
     *
     *   default (isolated, unbounded forks)   killed by the OOM watchdog
     *   maxForks=1, isolate=true              78.5s
     *   maxForks=1, isolate=false             57s
     *   maxForks=4, isolate=false             25s
     *   maxForks=2, isolate=false             69s   <- here
     *
     * Only 7.3s of that is running tests; the rest is Vite evaluating the
     * module graph once per test file. `isolate: false` lets the workers reuse
     * their environment instead of rebuilding it 33 times.
     *
     * `maxForks` is capped rather than left to default: unbounded workers each
     * load their own copy of the 743k-form index, which is what the watchdog
     * was killing. 4 workers (~350 MB each) froze the machine when the parser
     * and dev servers were also running; at 2, free memory never fell below
     * 66% (measured Oct 24). Slower, but a frozen laptop costs more than time.
     *
     * Isolation is off because no test file depends on another's module state -
     * each builds its own `Lexicon` and its own fixtures. If a test ever starts
     * failing only when run with others, that assumption is what broke.
     */
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 2, isolate: false },
    },
  },
});
