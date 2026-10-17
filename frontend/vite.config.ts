import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // The hosted demo (--mode demo, see .env.demo) replays a snapshot of the real API from
  // src/api/snapshot. Other builds leave the snapshot out entirely.
  define: { __SNAPSHOT__: JSON.stringify(loadEnv(mode, process.cwd(), 'VITE_').VITE_SNAPSHOT === '1') },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // In dev, every /api call is forwarded to the FastAPI backend.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // es2022 for top-level await in src/api/client.ts (mock module is loaded lazily).
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
}))
