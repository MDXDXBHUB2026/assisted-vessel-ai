import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    name: 'core-domain',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
