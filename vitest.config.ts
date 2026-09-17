import { defineConfig } from 'vitest/config'

// Each package under packages/* owns its own vitest config (or falls back to its vite config),
// including its own module resolution aliases — a single shared '@/*' alias cannot be correct for
// every package at once, since '@/*' points at a different package's own src in each of them.
export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
})
