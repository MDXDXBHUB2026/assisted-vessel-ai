import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: [{ find: /^@ave\/core-domain\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../core-domain/src/$1') }],
  },
  test: {
    name: 'assurance',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
