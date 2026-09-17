import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Architectural boundary enforcement.
 *
 * The safety engine's independence is the single most important structural property of this
 * codebase: it is what lets the project claim that no generative-AI output, no network response
 * and no UI state can influence a PASSED / CONDITIONAL / BLOCKED verdict.
 *
 * This package (@ave/safety-engine) now enforces that independence structurally — its own
 * package.json declares only @ave/core-domain as a runtime dependency, and `tsc -p` on this
 * package alone (with no sibling package present) proves it cannot even type-check against
 * anything else. This test is defence in depth on top of that: it catches a forbidden import
 * specifier by text, regardless of whether a future change to package.json or tsconfig paths
 * would have let it resolve.
 *
 * The generative-AI containment checks (copilot adapter <-> safety-engine/decision-engine) moved
 * to packages/app, since the copilot adapter itself lives there now — see
 * packages/app/src/services/adapters/generativeAiContainment.test.ts.
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

function importSpecifiers(file: string): string[] {
  const source = readFileSync(file, 'utf-8')
  const specifiers: string[] = []
  const pattern = /(?:^|\n)\s*import\s[^'"]*from\s*['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) specifiers.push(match[1]!)
  // bare side-effect imports and dynamic imports
  for (const m of source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specifiers.push(m[1]!)
  return specifiers
}

/** Import prefixes the safety engine is permitted to depend on, and nothing else. */
const SAFETY_ENGINE_ALLOWED = [/^@ave\/core-domain(\/|$)/, /^\.\/|^\.\.\//]

const FORBIDDEN_FOR_SAFETY_ENGINE: { pattern: RegExp; why: string }[] = [
  { pattern: /^react($|\/)/, why: 'the safety engine must be framework-free and runnable outside a browser' },
  { pattern: /^@ave\/app(\/|$)/, why: 'a network response or UI state must never be able to reach a safety verdict' },
  { pattern: /^@ave\/decision-engine(\/|$)/, why: 'the layer being validated must not be a dependency of the validator' },
  { pattern: /^@ave\/simulator(\/|$)/, why: 'the safety engine must not depend on the simulator it is asked to validate against' },
  { pattern: /^node:/, why: 'the safety engine must be pure — no I/O of any kind' },
]

describe('safety engine architectural boundary', () => {
  const files = sourceFilesUnder(SRC)

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('imports nothing outside @ave/core-domain and its own directory', () => {
    const violations: string[] = []
    for (const file of files) {
      for (const spec of importSpecifiers(file)) {
        if (!SAFETY_ENGINE_ALLOWED.some((allowed) => allowed.test(spec))) {
          violations.push(`${file.replace(SRC, 'packages/safety-engine/src')} imports "${spec}"`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('never imports the app, the decision engine, the simulator, React or Node', () => {
    const violations: string[] = []
    for (const file of files) {
      for (const spec of importSpecifiers(file)) {
        const hit = FORBIDDEN_FOR_SAFETY_ENGINE.find((rule) => rule.pattern.test(spec))
        if (hit) violations.push(`${file.replace(SRC, 'packages/safety-engine/src')} imports "${spec}" — ${hit.why}`)
      }
    }
    expect(violations).toEqual([])
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
