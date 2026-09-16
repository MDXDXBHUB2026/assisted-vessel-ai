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
 * Until this test existed, that independence held **by convention** — the modules simply
 * happened not to import across the boundary, and nothing would have caught a future import that
 * did. A property this important should be enforced by the build, not by reviewer vigilance.
 */

const SRC = resolve(import.meta.dirname, '..')

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
const SAFETY_ENGINE_ALLOWED = [/^@\/types(\/|$)/, /^@\/utils(\/|$)/, /^\.\/|^\.\.\//]

const FORBIDDEN_FOR_SAFETY_ENGINE: { pattern: RegExp; why: string }[] = [
  { pattern: /^react($|\/)/, why: 'the safety engine must be framework-free and runnable outside a browser' },
  { pattern: /^@\/services(\/|$)/, why: 'a network response must never be able to reach a safety verdict' },
  { pattern: /^@\/store(\/|$)/, why: 'UI state must never be able to reach a safety verdict' },
  { pattern: /^@\/features(\/|$)/, why: 'the safety engine must not depend on any UI' },
  { pattern: /^@\/components(\/|$)/, why: 'the safety engine must not depend on any UI' },
  { pattern: /^@\/decision-engine(\/|$)/, why: 'the layer being validated must not be a dependency of the validator' },
  { pattern: /^@\/hooks(\/|$)/, why: 'the safety engine must be free of React lifecycle coupling' },
  { pattern: /^node:/, why: 'the safety engine must be pure — no I/O of any kind' },
]

describe('safety engine architectural boundary', () => {
  const files = sourceFilesUnder(join(SRC, 'safety-engine'))

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('imports nothing outside @/types, @/utils and its own directory', () => {
    const violations: string[] = []
    for (const file of files) {
      for (const spec of importSpecifiers(file)) {
        if (!SAFETY_ENGINE_ALLOWED.some((allowed) => allowed.test(spec))) {
          violations.push(`${file.replace(SRC, 'src')} imports "${spec}"`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('never imports the UI, the store, the services layer, the decision engine, React or Node', () => {
    const violations: string[] = []
    for (const file of files) {
      for (const spec of importSpecifiers(file)) {
        const hit = FORBIDDEN_FOR_SAFETY_ENGINE.find((rule) => rule.pattern.test(spec))
        if (hit) violations.push(`${file.replace(SRC, 'src')} imports "${spec}" — ${hit.why}`)
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
        if (source.includes(forbidden)) violations.push(`${file.replace(SRC, 'src')} uses ${forbidden}`)
      }
    }
    expect(violations).toEqual([])
  })
})

describe('generative-AI containment', () => {
  it('no module under safety-engine or decision-engine imports the copilot adapter', () => {
    // HMI-303: generative output may describe a verdict; it may never produce or alter one.
    const files = [...sourceFilesUnder(join(SRC, 'safety-engine')), ...sourceFilesUnder(join(SRC, 'decision-engine'))]
    const violations: string[] = []
    for (const file of files) {
      for (const spec of importSpecifiers(file)) {
        if (spec.includes('copilot')) violations.push(`${file.replace(SRC, 'src')} imports "${spec}"`)
      }
    }
    expect(violations).toEqual([])
  })

  it('the copilot adapter never imports the safety engine', () => {
    const file = join(SRC, 'services/adapters/copilotAdapter.ts')
    const violations = importSpecifiers(file).filter((spec) => spec.includes('safety-engine'))
    expect(violations).toEqual([])
  })
})
