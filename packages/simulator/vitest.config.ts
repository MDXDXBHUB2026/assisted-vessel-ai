import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@ave\/core-domain\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../core-domain/src/$1') },
      { find: /^@ave\/safety-engine\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../safety-engine/src/$1') },
      { find: /^@ave\/decision-engine\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../decision-engine/src/$1') },
    ],
  },
  test: {
    name: 'simulator',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
