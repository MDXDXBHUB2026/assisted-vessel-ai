import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Generative-AI containment (HMI-303): generative output may describe a verdict; it may never
 * produce or alter one. This spans three packages (the copilot adapter lives here in @ave/app;
 * the safety and decision engines it must never influence live in their own packages), so it
 * cannot be scoped to any single package's own boundary test — see
 * packages/safety-engine/src/boundaries.test.ts for the safety engine's own (single-package)
 * architectural boundary checks, which this file complements rather than duplicates.
 */

const SAFETY_ENGINE_SRC = resolve(import.meta.dirname, '../../../../safety-engine/src')
const DECISION_ENGINE_SRC = resolve(import.meta.dirname, '../../../../decision-engine/src')
const COPILOT_ADAPTER_FILE = resolve(import.meta.dirname, 'copilotAdapter.ts')

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
  for (const m of source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specifiers.push(m[1]!)
  return specifiers
}

describe('generative-AI containment', () => {
  it('no module under safety-engine or decision-engine imports the copilot adapter', () => {
    const files = [...sourceFilesUnder(SAFETY_ENGINE_SRC), ...sourceFilesUnder(DECISION_ENGINE_SRC)]
    const violations: string[] = []
    for (const file of files) {
      for (const spec of importSpecifiers(file)) {
        if (spec.includes('copilot')) violations.push(`${file} imports "${spec}"`)
      }
    }
    expect(violations).toEqual([])
  })

  it('the copilot adapter never imports the safety engine', () => {
    const violations = importSpecifiers(COPILOT_ADAPTER_FILE).filter((spec) => spec.includes('safety-engine'))
    expect(violations).toEqual([])
  })
})
