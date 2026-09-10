import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'

// Update BASE_PATH once the GitHub repository name is known, e.g. '/assisted-vessel-ai/'.
// It can also be overridden at build time with the VITE_BASE_PATH env var, which is what
// .github/workflows/deploy.yml does automatically from the repository name.
const BASE_PATH = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base: BASE_PATH,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
