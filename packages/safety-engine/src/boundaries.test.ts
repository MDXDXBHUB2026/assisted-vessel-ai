import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Determinism guarantee for the safety engine.
 *
 * Import-boundary enforcement (what the safety engine may and may not depend on — core-domain
 * only, never the app, the decision engine it validates, the simulator, React or Node) is now
 * enforced by .dependency-cruiser.cjs (`npm run depcruise`), which runs over the real resolved
 * module graph rather than a text scan, and is derived from packages/safety-engine/package.json
 * so it cannot drift from what that file declares. See rules `safety-engine-prod-deps-match-
 * package-json`, `no-package-imports-app` and the generative-containment rules in that file, plus
 * the isolation build this whole boundary was originally proved with:
 * `tsc -p packages/safety-engine` type-checks with only @ave/core-domain present.
 *
 * This file covers only what a dependency-graph tool structurally cannot: whether the safety
 * engine's SOURCE CONTENT touches I/O or ambient non-determinism, which is a text-content
 * property, not an import-graph one. A verdict must be reproducible from its recorded inputs — a
 * safety layer that consults Date.now() or Math.random() cannot be replayed during an
 * investigation, and dependency-cruiser has no way to see that from the import graph alone.
 */

const SRC = resolve(import.meta.dirname, '.')

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFilesUnder(full))
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

describe('safety engine determinism', () => {
  const files = sourceFilesUnder(SRC)

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('performs no I/O and reads no ambient clock or randomness', () => {
    // Determinism is what makes a verdict reproducible from its recorded inputs. A safety layer
    // that consults Date.now() or Math.random() cannot be replayed during an investigation.
    const violations: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      for (const forbidden of ['fetch(', 'Date.now(', 'Math.random(', 'localStorage', 'sessionStorage', 'XMLHttpRequest']) {
        if (source.includes(forbidden)) violations.push(`${file.replace(SRC, 'packages/safety-engine/src')} uses ${forbidden}`)
      }
    }
    expect(violations).toEqual([])
  })
})
