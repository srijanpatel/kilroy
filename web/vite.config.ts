import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    hmr: {
      host: 'localhost',
      port: 5173,
      clientPort: 5173,
    },
    proxy: {
      '^/workspaces$': {
        target: 'http://localhost:7432',
        changeOrigin: true,
      },
      '/_/': 'http://localhost:7432',
      '^/[^/]+/api(?:/.*)?$': {
        target: 'http://localhost:7432',
        changeOrigin: true,
      },
      '^/[^/]+/mcp(?:/.*)?$': {
        target: 'http://localhost:7432',
        changeOrigin: true,
      },
      '^/[^/]+/install(?:/.*)?$': {
        target: 'http://localhost:7432',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
