import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Linked workspace package that ships CommonJS (the backend needs CJS). Pre-bundling
    // it keeps Vite from choking on the require/exports interop during dev.
    include: ['@bingo-draft/shared'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
