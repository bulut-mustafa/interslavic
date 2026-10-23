import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Bind explicitly: Vite's default "localhost" resolves to ::1 only, so
  // 127.0.0.1 health checks silently never succeed.
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
});
