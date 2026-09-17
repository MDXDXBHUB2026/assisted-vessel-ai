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
    alias: [
      { find: '@/types', replacement: path.resolve(import.meta.dirname, '../core-domain/src/types/index.ts') },
      { find: /^@\/utils\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../core-domain/src/utils/$1') },
      { find: /^@ave\/core-domain\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../core-domain/src/$1') },
      { find: /^@ave\/safety-engine\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../safety-engine/src/$1') },
      { find: /^@ave\/decision-engine\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../decision-engine/src/$1') },
      { find: /^@ave\/simulator\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../simulator/src/$1') },
      { find: /^@ave\/assurance\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../assurance/src/$1') },
      { find: '@', replacement: path.resolve(import.meta.dirname, './src') },
    ],
  },
})
