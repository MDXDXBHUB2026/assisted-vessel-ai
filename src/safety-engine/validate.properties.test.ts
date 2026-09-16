import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { validateRecommendation } from './validate'
import { assessOdd } from './oddEngine'
import { ASSISTED_FUNCTIONS } from './oddFunctions'
import { buildBaselineSnapshot } from '@/simulation/baseline'
import type { OperationalMode, RequiredAuthority, RiskLevel, VesselSnapshot } from '@/types'
import { assistanceLevelRank, isVesselAuthority, REQUIRED_AUTHORITIES, riskLevelRank } from '@/types'

/**
 * Property-based verification of the safety layer.
 *
 * Example-based tests verify the cases someone thought of. These assert invariants that must
 * hold across the whole reachable input space — which is what an independent V&V reviewer asks
 * for, and what catches the class of defect where a check silently cannot fail.
 *
 * Every generator below produces states the system can actually reach; nothing is forced with a
 * cast. A property that can only be satisfied by an impossible input verifies nothing.
 */

const OPERATIONAL_MODES: OperationalMode[] = [
  'open_sea',
  'coastal',
  'traffic_separation',
  'congested_waters',
  'port_approach',
  'manoeuvring',
  'anchored',
  'alongside',
]

const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'severe']

/** Environmental and system conditions spanning well inside, at, and well outside every limit. */
interface Conditions {
  operationalMode: OperationalMode
  visibilityNm: number
  waveHeightM: number
  gnssConfidence: number
  gnssAvailable: boolean
  radarAvailable: boolean
  aisAvailable: boolean
  chartDataValid: boolean
  satelliteLinkUp: boolean
  satelliteConfidence: number
  shoreSyncLatencySec: number
  engineAvailability: number
  commsAvailability: number
}

const conditionsArb: fc.Arbitrary<Conditions> = fc.record({
  operationalMode: fc.constantFrom(...OPERATIONAL_MODES),
  visibilityNm: fc.double({ min: 0.2, max: 12, noNaN: true }),
  waveHeightM: fc.double({ min: 0, max: 10, noNaN: true }),
  gnssConfidence: fc.double({ min: 0, max: 100, noNaN: true }),
  gnssAvailable: fc.boolean(),
  radarAvailable: fc.boolean(),
  aisAvailable: fc.boolean(),
  chartDataValid: fc.boolean(),
  satelliteLinkUp: fc.boolean(),
  satelliteConfidence: fc.double({ min: 0, max: 100, noNaN: true }),
  shoreSyncLatencySec: fc.double({ min: 1, max: 90, noNaN: true }),
  engineAvailability: fc.double({ min: 0, max: 100, noNaN: true }),
  commsAvailability: fc.double({ min: 0, max: 100, noNaN: true }),
})

function availabilityStatus(percent: number): 'ok' | 'degraded' | 'stale' | 'unavailable' {
  if (percent >= 85) return 'ok'
  if (percent >= 50) return 'degraded'
  if (percent > 0) return 'stale'
  return 'unavailable'
}

function snapshotFrom(c: Conditions): VesselSnapshot {
  const base = buildBaselineSnapshot()
  return {
    ...base,
    operationalMode: c.operationalMode,
    environment: { ...base.environment, visibilityNm: c.visibilityNm, waveHeightM: c.waveHeightM },
    navigation: {
      ...base.navigation,
      gnssConfidence: c.gnssConfidence,
      gnssAvailable: c.gnssAvailable,
      radarAvailable: c.radarAvailable,
      aisAvailable: c.aisAvailable,
      chartDataValid: c.chartDataValid,
    },
    communications: {
      ...base.communications,
      satelliteLinkUp: c.satelliteLinkUp,
      satelliteConfidence: c.satelliteConfidence,
      shoreSyncLatencySec: c.shoreSyncLatencySec,
    },
    systemHealth: base.systemHealth.map((h) => {
      if (h.area === 'main_engine') {
        return { ...h, dataAvailabilityPercent: c.engineAvailability, availabilityStatus: availabilityStatus(c.engineAvailability) }
      }
      if (h.area === 'communications') {
        return { ...h, dataAvailabilityPercent: c.commsAvailability, availabilityStatus: availabilityStatus(c.commsAvailability) }
      }
      return h
    }),
  }
}

const functionIdArb = fc.constantFrom(...ASSISTED_FUNCTIONS.map((f) => f.id))
const authorityArb = fc.constantFrom(...REQUIRED_AUTHORITIES)
const riskArb = fc.constantFrom(...RISK_LEVELS)

const RUNS = { numRuns: 500 }

describe('safety engine — invariants that must hold across the whole input space', () => {
  it('SAFE-101: is a pure function — identical input always yields an identical verdict', () => {
    fc.assert(
      fc.property(conditionsArb, functionIdArb, riskArb, authorityArb, (c, functionId, riskLevel, requiredAuthority) => {
        const snapshot = snapshotFrom(c)
        const a = validateRecommendation({ functionId, snapshot, riskLevel, requiredAuthority })
        const b = validateRecommendation({ functionId, snapshot, riskLevel, requiredAuthority })
        expect(b).toEqual(a)
      }),
      RUNS,
    )
  })

  it('SAFE-103: always returns exactly one of the three declared verdicts', () => {
    fc.assert(
      fc.property(conditionsArb, functionIdArb, riskArb, authorityArb, (c, functionId, riskLevel, requiredAuthority) => {
        const { verdict } = validateRecommendation({ functionId, snapshot: snapshotFrom(c), riskLevel, requiredAuthority })
        expect(['passed', 'conditional', 'blocked']).toContain(verdict)
      }),
      RUNS,
    )
  })

  it('SAFE-102: PASSED requires every check to pass — a verdict can never be more permissive than its own evidence', () => {
    fc.assert(
      fc.property(conditionsArb, functionIdArb, riskArb, authorityArb, (c, functionId, riskLevel, requiredAuthority) => {
        const result = validateRecommendation({ functionId, snapshot: snapshotFrom(c), riskLevel, requiredAuthority })
        if (result.verdict === 'passed') {
          expect(result.checks.every((check) => check.passed)).toBe(true)
          expect(result.reason).toBeUndefined()
        }
      }),
      RUNS,
    )
  })

  it('SAFE-002: a verdict other than PASSED always names a reason', () => {
    fc.assert(
      fc.property(conditionsArb, functionIdArb, riskArb, authorityArb, (c, functionId, riskLevel, requiredAuthority) => {
        const result = validateRecommendation({ functionId, snapshot: snapshotFrom(c), riskLevel, requiredAuthority })
        if (result.verdict !== 'passed') {
          expect(result.reason).toBeTruthy()
        }
      }),
      RUNS,
    )
  })

  it('outside the operational envelope, the verdict is never PASSED', () => {
    fc.assert(
      fc.property(conditionsArb, functionIdArb, riskArb, authorityArb, (c, functionId, riskLevel, requiredAuthority) => {
        const snapshot = snapshotFrom(c)
        const odd = assessOdd(functionId, snapshot)
        const result = validateRecommendation({ functionId, snapshot, riskLevel, requiredAuthority })
        if (odd.status === 'outside') {
          expect(result.verdict).not.toBe('passed')
        }
      }),
      RUNS,
    )
  })

  it('a function not permitted in the current operational mode is always BLOCKED', () => {
    fc.assert(
      fc.property(conditionsArb, functionIdArb, riskArb, authorityArb, (c, functionId, riskLevel, requiredAuthority) => {
        const snapshot = snapshotFrom(c)
        const odd = assessOdd(functionId, snapshot)
        const modeParam = odd.parameters.find((p) => p.key === 'operationalMode')!
        const result = validateRecommendation({ functionId, snapshot, riskLevel, requiredAuthority })
        if (modeParam.status === 'outside') {
          expect(result.verdict).toBe('blocked')
        }
      }),
      RUNS,
    )
  })

  it('SHORE-003: a high or severe risk assigned to a shore/advisory role is always BLOCKED', () => {
    fc.assert(
      fc.property(conditionsArb, functionIdArb, authorityArb, (c, functionId, requiredAuthority) => {
        fc.pre(!isVesselAuthority(requiredAuthority))
        const result = validateRecommendation({ functionId, snapshot: snapshotFrom(c), riskLevel: 'high', requiredAuthority })
        expect(result.verdict).toBe('blocked')
      }),
      RUNS,
    )
  })

  it('severe risk is never actionable below Chief Engineer seniority', () => {
    fc.assert(
      fc.property(conditionsArb, functionIdArb, authorityArb, (c, functionId, requiredAuthority) => {
        const result = validateRecommendation({ functionId, snapshot: snapshotFrom(c), riskLevel: 'severe', requiredAuthority })
        const senior = requiredAuthority === 'master' || requiredAuthority === 'chief_engineer'
        if (!senior) expect(result.verdict).toBe('blocked')
      }),
      RUNS,
    )
  })

  it('the declared assistance ceiling is never exceeded, under any conditions', () => {
    fc.assert(
      fc.property(conditionsArb, functionIdArb, (c, functionId) => {
        const odd = assessOdd(functionId, snapshotFrom(c))
        expect(assistanceLevelRank(odd.availableAssistanceLevel)).toBeLessThanOrEqual(assistanceLevelRank(odd.maxAssistanceLevel))
        // ASSIST-101: no function in this POC ever reaches L4.
        expect(assistanceLevelRank(odd.availableAssistanceLevel)).toBeLessThan(assistanceLevelRank('L4'))
      }),
      RUNS,
    )
  })

  it('ASSIST-102: degrading the envelope can only ever reduce the available assistance level', () => {
    fc.assert(
      fc.property(conditionsArb, functionIdArb, (c, functionId) => {
        const good = snapshotFrom({ ...c, visibilityNm: 12, waveHeightM: 0, gnssConfidence: 100, gnssAvailable: true })
        const bad = snapshotFrom({ ...c, visibilityNm: 0.2, waveHeightM: 10, gnssConfidence: 0, gnssAvailable: false })
        const levelGood = assessOdd(functionId, good).availableAssistanceLevel
        const levelBad = assessOdd(functionId, bad).availableAssistanceLevel
        expect(assistanceLevelRank(levelBad)).toBeLessThanOrEqual(assistanceLevelRank(levelGood))
      }),
      RUNS,
    )
  })

  it('a dead source feed for a required system is always BLOCKED', () => {
    fc.assert(
      fc.property(conditionsArb, riskArb, authorityArb, (c, riskLevel, requiredAuthority) => {
        // shore_sync_assistance requires the communications area; kill that feed outright.
        const snapshot = snapshotFrom({ ...c, operationalMode: 'open_sea', commsAvailability: 0 })
        const result = validateRecommendation({ functionId: 'shore_sync_assistance', snapshot, riskLevel, requiredAuthority })
        expect(result.verdict).toBe('blocked')
      }),
      RUNS,
    )
  })

  it('every check carries a non-empty label and detail — the operator is never shown a blank check', () => {
    fc.assert(
      fc.property(conditionsArb, functionIdArb, riskArb, authorityArb, (c, functionId, riskLevel, requiredAuthority) => {
        const result = validateRecommendation({ functionId, snapshot: snapshotFrom(c), riskLevel, requiredAuthority })
        expect(result.checks.length).toBeGreaterThan(0)
        for (const check of result.checks) {
          expect(check.label.length).toBeGreaterThan(0)
          expect(check.detail.length).toBeGreaterThan(0)
        }
      }),
      RUNS,
    )
  })

  it('ODD margin fractions are always a finite value in [0, 1]', () => {
    fc.assert(
      fc.property(conditionsArb, functionIdArb, (c, functionId) => {
        for (const p of assessOdd(functionId, snapshotFrom(c)).parameters) {
          expect(Number.isFinite(p.marginFraction)).toBe(true)
          expect(p.marginFraction).toBeGreaterThanOrEqual(0)
          expect(p.marginFraction).toBeLessThanOrEqual(1)
        }
      }),
      RUNS,
    )
  })

  it('an outside-limit parameter always reports zero margin, and vice versa is never true for an inside one', () => {
    fc.assert(
      fc.property(conditionsArb, functionIdArb, (c, functionId) => {
        for (const p of assessOdd(functionId, snapshotFrom(c)).parameters) {
          if (p.status === 'outside') expect(p.marginFraction).toBe(0)
          if (p.status === 'inside') expect(p.marginFraction).toBeGreaterThan(0)
        }
      }),
      RUNS,
    )
  })

  /**
   * Checks that cannot fail for any input reachable through the *typed* API, and why. Each is a
   * defensive guard, not a decorative one, and each is covered by its own targeted test that
   * forces the guarded condition. This list is deliberately explicit and deliberately short: it
   * is the only place a non-falsifiable check may legitimately live, so a future `passed: true`
   * cannot quietly hide among the real checks.
   */
  const DEFENSIVE_CHECKS: Record<string, string> = {
    'Required human authority is valid and identified':
      'RequiredAuthority is a closed union, so a generator over that union can never produce an invalid value. ' +
      'The guard exists for untyped boundaries (adapter JSON, persisted state) and is verified by the ' +
      '"rejects an unrecognised authority arriving from an untyped boundary" test, which forces that input with a cast.',
    'Assistance level does not exceed declared ceiling':
      'assessOdd() already clamps the available level to the declared ceiling, so by construction this check cannot ' +
      'fail downstream. It is retained as defence in depth against a regression in that clamp, and the clamp itself ' +
      'is verified by the "declared assistance ceiling is never exceeded" property above.',
  }

  it('no check is decorative — every non-defensive check fails for at least one reachable input', () => {
    // A check hardcoded to pass renders to the operator as validated while verifying nothing.
    // This guards the whole check list against that class of regression.
    const everFailed = new Map<string, boolean>()
    fc.assert(
      fc.property(conditionsArb, functionIdArb, riskArb, authorityArb, (c, functionId, riskLevel, requiredAuthority) => {
        const result = validateRecommendation({ functionId, snapshot: snapshotFrom(c), riskLevel, requiredAuthority })
        for (const check of result.checks) {
          everFailed.set(check.label, (everFailed.get(check.label) ?? false) || !check.passed)
        }
      }),
      { numRuns: 3000 },
    )
    const neverFailing = [...everFailed.entries()]
      .filter(([, failed]) => !failed)
      .map(([label]) => label)
      .filter((label) => !(label in DEFENSIVE_CHECKS))
    expect(neverFailing).toEqual([])
  })

  it('every declared defensive check is still a real check that appears in the result', () => {
    // Stops a check being neutralised by simply adding its label to the allowlist and deleting it.
    const result = validateRecommendation({
      functionId: 'machinery_anomaly_detection',
      snapshot: buildBaselineSnapshot(),
      riskLevel: 'low',
      requiredAuthority: 'chief_engineer',
    })
    const labels = result.checks.map((check) => check.label)
    for (const label of Object.keys(DEFENSIVE_CHECKS)) {
      expect(labels).toContain(label)
    }
  })

  it('the defensive allowlist stays small — a growing list means checks are being neutralised', () => {
    expect(Object.keys(DEFENSIVE_CHECKS).length).toBeLessThanOrEqual(2)
  })

  it('all three verdicts are reachable from states the system can actually produce', () => {
    const seen = new Set<string>()
    fc.assert(
      fc.property(conditionsArb, functionIdArb, riskArb, authorityArb, (c, functionId, riskLevel, requiredAuthority) => {
        seen.add(validateRecommendation({ functionId, snapshot: snapshotFrom(c), riskLevel, requiredAuthority }).verdict)
      }),
      { numRuns: 3000 },
    )
    expect([...seen].sort()).toEqual(['blocked', 'conditional', 'passed'])
  })
})

describe('ODD boundary behaviour — a value exactly at a stated limit satisfies it', () => {
  const nav = ASSISTED_FUNCTIONS.find((f) => f.id === 'nav_collision_advisory')!
  const base = buildBaselineSnapshot()

  function visibilityStatus(visibilityNm: number) {
    const snapshot: VesselSnapshot = { ...base, environment: { ...base.environment, visibilityNm } }
    return assessOdd('nav_collision_advisory', snapshot).parameters.find((p) => p.key === 'visibility')!.status
  }

  function waveStatus(waveHeightM: number) {
    const snapshot: VesselSnapshot = { ...base, environment: { ...base.environment, waveHeightM } }
    return assessOdd('nav_collision_advisory', snapshot).parameters.find((p) => p.key === 'waveHeight')!.status
  }

  it(`visibility exactly at the stated minimum (${nav.minVisibilityNm} nm) is not reported as outside`, () => {
    expect(visibilityStatus(nav.minVisibilityNm)).not.toBe('outside')
  })

  it('visibility just below the stated minimum is outside', () => {
    expect(visibilityStatus(nav.minVisibilityNm - 0.01)).toBe('outside')
  })

  it('visibility well above the stated minimum is inside', () => {
    expect(visibilityStatus(nav.minVisibilityNm * 3)).toBe('inside')
  })

  it(`wave height exactly at the stated maximum (${nav.maxWaveHeightM} m) is not reported as outside`, () => {
    expect(waveStatus(nav.maxWaveHeightM)).not.toBe('outside')
  })

  it('wave height just above the stated maximum is outside', () => {
    expect(waveStatus(nav.maxWaveHeightM + 0.01)).toBe('outside')
  })
})

describe('source-system scoping — availability is checked against the systems a function depends on', () => {
  it('a communications outage does not reduce an onboard-only machinery function', () => {
    const base = buildBaselineSnapshot()
    const commsDown: VesselSnapshot = {
      ...base,
      communications: { ...base.communications, satelliteLinkUp: false, satelliteConfidence: 0, shoreSyncLatencySec: 90 },
      systemHealth: base.systemHealth.map((h) =>
        h.area === 'communications' ? { ...h, dataAvailabilityPercent: 0, availabilityStatus: 'unavailable' as const } : h,
      ),
    }
    const result = validateRecommendation({
      functionId: 'machinery_anomaly_detection',
      snapshot: commsDown,
      riskLevel: 'medium',
      requiredAuthority: 'chief_engineer',
    })
    expect(result.verdict).toBe('passed')
  })

  it('the same outage does block the shore-dependent function', () => {
    const base = buildBaselineSnapshot()
    const commsDown: VesselSnapshot = {
      ...base,
      communications: { ...base.communications, satelliteLinkUp: false, satelliteConfidence: 0, shoreSyncLatencySec: 90 },
      systemHealth: base.systemHealth.map((h) =>
        h.area === 'communications' ? { ...h, dataAvailabilityPercent: 0, availabilityStatus: 'unavailable' as const } : h,
      ),
    }
    const result = validateRecommendation({
      functionId: 'shore_sync_assistance',
      snapshot: commsDown,
      riskLevel: 'low',
      requiredAuthority: 'master',
    })
    expect(result.verdict).toBe('blocked')
  })

  it('a degrading machinery condition never raises assessed source availability', () => {
    // Regression guard for the inversion where model confidence was used as an availability
    // signal: confidence RISES as a fault develops, so a worse engine reported better data.
    const base = buildBaselineSnapshot()
    const engine = base.systemHealth.find((h) => h.area === 'main_engine')!
    expect(engine.dataAvailabilityPercent).toBeLessThanOrEqual(100)
    const degraded: VesselSnapshot = {
      ...base,
      systemHealth: base.systemHealth.map((h) =>
        h.area === 'main_engine' ? { ...h, confidence: 96, dataAvailabilityPercent: 20, availabilityStatus: 'stale' as const } : h,
      ),
    }
    const result = validateRecommendation({
      functionId: 'machinery_anomaly_detection',
      snapshot: degraded,
      riskLevel: 'medium',
      requiredAuthority: 'chief_engineer',
    })
    // High model confidence must not rescue a stale feed.
    expect(result.verdict).not.toBe('passed')
  })
})

describe('authority model', () => {
  const base = buildBaselineSnapshot()

  it('rejects an unrecognised authority arriving from an untyped boundary', () => {
    const result = validateRecommendation({
      functionId: 'machinery_anomaly_detection',
      snapshot: base,
      riskLevel: 'low',
      requiredAuthority: 'not_a_real_role' as unknown as RequiredAuthority,
    })
    expect(result.verdict).toBe('blocked')
  })

  it('officer of the watch remains the correct authority for a high-risk collision advisory', () => {
    const result = validateRecommendation({
      functionId: 'nav_collision_advisory',
      snapshot: base,
      riskLevel: 'high',
      requiredAuthority: 'officer_of_the_watch',
    })
    expect(result.verdict).not.toBe('blocked')
  })

  it('risk ranking is strictly ordered', () => {
    expect(riskLevelRank('low')).toBeLessThan(riskLevelRank('medium'))
    expect(riskLevelRank('medium')).toBeLessThan(riskLevelRank('high'))
    expect(riskLevelRank('high')).toBeLessThan(riskLevelRank('severe'))
  })
})
