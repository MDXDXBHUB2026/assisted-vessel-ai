import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@ave\/core-domain\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../core-domain/src/$1') },
      { find: /^@ave\/decision-engine\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../decision-engine/src/$1') },
      { find: /^@ave\/simulator\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../simulator/src/$1') },
    ],
  },
  test: {
    name: 'safety-engine',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
