import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
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
  test: {
    name: 'app',
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
})
