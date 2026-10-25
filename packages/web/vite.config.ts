import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
