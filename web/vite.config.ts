import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:7432',
      '/mcp': 'http://localhost:7432',
    },
  },
  build: {
    outDir: 'dist',
  },
})
