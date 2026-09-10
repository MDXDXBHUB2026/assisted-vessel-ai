import { describe, expect, it } from 'vitest'
import { validateRecommendation } from './validate'
import { buildBaselineSnapshot } from '@/simulation/baseline'

describe('validateRecommendation', () => {
  it('passes a low-risk recommendation under nominal conditions', () => {
    const snapshot = buildBaselineSnapshot()
    const result = validateRecommendation({ functionId: 'machinery_anomaly_detection', snapshot, riskLevel: 'low', requiredAuthority: 'chief_engineer' })
    expect(result.verdict).toBe('passed')
    expect(result.checks.every((c) => c.passed)).toBe(true)
  })

  it('returns conditional when the operational envelope is violated but authority is present', () => {
    const snapshot = buildBaselineSnapshot()
    const degraded = { ...snapshot, environment: { ...snapshot.environment, visibilityNm: 0.5 } }
    const result = validateRecommendation({ functionId: 'nav_collision_advisory', snapshot: degraded, riskLevel: 'medium', requiredAuthority: 'officer_of_the_watch' })
    expect(result.verdict).toBe('conditional')
    expect(result.reason).toBeDefined()
  })

  it('blocks a recommendation with no required authority', () => {
    const snapshot = buildBaselineSnapshot()
    const result = validateRecommendation({
      functionId: 'machinery_anomaly_detection',
      snapshot,
      riskLevel: 'high',
      requiredAuthority: undefined as unknown as 'chief_engineer',
    })
    expect(result.verdict).toBe('blocked')
  })

  it('blocks a severe-risk recommendation unless gated by master or chief engineer authority', () => {
    const snapshot = buildBaselineSnapshot()
    const notGated = validateRecommendation({ functionId: 'machinery_anomaly_detection', snapshot, riskLevel: 'severe', requiredAuthority: 'officer_of_the_watch' })
    expect(notGated.verdict).toBe('blocked')

    const gated = validateRecommendation({ functionId: 'machinery_anomaly_detection', snapshot, riskLevel: 'severe', requiredAuthority: 'chief_engineer' })
    expect(gated.verdict).not.toBe('blocked')
  })

  it('never returns passed when the function is not permitted in the current operational mode', () => {
    const snapshot = { ...buildBaselineSnapshot(), operationalMode: 'anchored' as const }
    const result = validateRecommendation({ functionId: 'voyage_speed_optimisation', snapshot, riskLevel: 'low', requiredAuthority: 'master' })
    expect(result.verdict).not.toBe('passed')
  })
})
