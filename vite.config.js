import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: {
    host: true, // Listen on all interfaces (needed for Docker)
    port: 5173,
    strictPort: true,
    hmr: {
      // Explicit HMR config for Docker environments
      host: 'localhost',
      port: 5173,
      clientPort: 5173,
    },
    proxy: {
      // Proxy API requests to Express server (used in Docker dev mode)
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // Also proxy Netlify functions path (rewrite to /api for Express server)
      '/.netlify/functions': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/.netlify\/functions/, '/api')
      }
    }
  }
})
