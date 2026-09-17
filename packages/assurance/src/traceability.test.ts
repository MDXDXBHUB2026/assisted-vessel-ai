import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TRACEABILITY_ROWS } from './traceability'

/**
 * The traceability matrix is rendered to the user as verification evidence. If it cites a test
 * file that does not exist, the artifact whose entire purpose is assurance rigour is itself
 * making an unverifiable claim — which is the single most damaging thing it could do.
 *
 * This suite makes that class of drift impossible: every file path the matrix cites must resolve
 * on disk, and a row may only claim 'verified' if it actually cites an automated test.
 *
 * Historical note: before this test existed, the matrix cited eight Playwright specs
 * (blocked-recommendation, gnss-degradation, collision-risk, reefer-excursion,
 * communication-loss, human-acceptance, human-rejection, shore-support-request) none of which
 * had ever been written, and rendered them in green as evidence.
 */

const REPO_ROOT = resolve(import.meta.dirname, '../../..')

/** Pull every `<dir>/<file>.(test|spec).ts` path out of a free-text evidence string. */
function citedFiles(evidence: string): string[] {
  const matches = evidence.match(/[\w./-]+\.(?:test|spec)\.ts/g) ?? []
  return [...new Set(matches)]
}

/**
 * Components are listed as short paths (e.g. `safety-engine/validate.ts`,
 * `store/simulationStore.ts`) rather than full monorepo paths, so this matrix stays readable
 * without every row spelling out `packages/<name>/src/...`. This resolves that short form to
 * where the code actually lives post-Phase-1A extraction — see docs/production-architecture-
 * assessment.md §7 and the Phase 1A work package.
 */
function resolveComponentPath(part: string): string {
  if (part.startsWith('safety-engine/')) return resolve(REPO_ROOT, 'packages/safety-engine/src', part.slice('safety-engine/'.length))
  if (part.startsWith('decision-engine/')) return resolve(REPO_ROOT, 'packages/decision-engine/src', part.slice('decision-engine/'.length))
  if (part.startsWith('simulation/') || part.startsWith('data/')) return resolve(REPO_ROOT, 'packages/simulator/src', part)
  // store/, features/, services/, components/, hooks/, layouts/ all still live directly under
  // the app package's own src, unchanged in internal shape by the extraction.
  return resolve(REPO_ROOT, 'packages/app/src', part)
}

describe('requirements traceability matrix', () => {
  it('has rows', () => {
    expect(TRACEABILITY_ROWS.length).toBeGreaterThan(0)
  })

  it('every cited test file exists on disk', () => {
    const missing: { requirement: string; file: string }[] = []
    for (const row of TRACEABILITY_ROWS) {
      for (const file of citedFiles(row.verificationEvidence)) {
        if (!existsSync(resolve(REPO_ROOT, file))) {
          missing.push({ requirement: row.systemRequirement, file })
        }
      }
    }
    expect(missing).toEqual([])
  })

  it("a row claiming 'verified' cites at least one automated test file", () => {
    const unsupported = TRACEABILITY_ROWS.filter(
      (row) => row.verificationStatus === 'verified' && citedFiles(row.verificationEvidence).length === 0,
    ).map((row) => row.systemRequirement)
    expect(unsupported).toEqual([])
  })

  it("a row claiming 'not_verified' does not cite an automated test as though it were evidence", () => {
    const contradictory = TRACEABILITY_ROWS.filter(
      (row) => row.verificationStatus === 'not_verified' && citedFiles(row.verificationEvidence).length > 0,
    ).map((row) => row.systemRequirement)
    expect(contradictory).toEqual([])
  })

  it('every row carries a non-empty requirement, component and evidence statement', () => {
    for (const row of TRACEABILITY_ROWS) {
      expect(row.systemRequirement.length).toBeGreaterThan(0)
      expect(row.component.length).toBeGreaterThan(0)
      expect(row.verificationEvidence.length).toBeGreaterThan(0)
      expect(['verified', 'partial', 'not_verified']).toContain(row.verificationStatus)
    }
  })

  it('every cited component path exists on disk', () => {
    const missing: string[] = []
    for (const row of TRACEABILITY_ROWS) {
      // Components are listed as comma-separated paths relative to src/, sometimes with a glob
      // suffix or a parenthetical note. Normalise before checking.
      const parts = row.component.split(',').map((part) => part.trim().replace(/\s*\(.*\)$/, ''))
      for (const part of parts) {
        if (!part || part.includes('*')) continue
        if (!existsSync(resolveComponentPath(part))) missing.push(part)
      }
    }
    expect(missing).toEqual([])
  })
})
