import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The speech library names a 27 MB WebAssembly runtime that the build would
 * copy into dist, but the page never loads it: it fetches the runtime from
 * cdn.jsdelivr.net (checked by hiding the file and transcribing again). Left
 * in, it would be uploaded for nothing - and deploy/hosting.py refuses to
 * publish anything that is not an HTML, script, style or font file.
 */
const dropUnusedWasm = (): Plugin => ({
  name: 'drop-unused-wasm',
  generateBundle(_options, bundle) {
    for (const name of Object.keys(bundle)) if (name.endsWith('.wasm')) delete bundle[name];
  },
});

export default defineConfig({
  plugins: [react(), dropUnusedWasm()],
  // The speech worker imports the model library, which splits into chunks: module workers allow that.
  worker: { format: 'es' },
  // Bind explicitly: Vite's default "localhost" resolves to ::1 only, so
  // 127.0.0.1 health checks silently never succeed.
  // The API is same-origin ("/api/..."): in production the engine serves the
  // page itself, and in development this proxy forwards to it.
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8766' },
  },
});
