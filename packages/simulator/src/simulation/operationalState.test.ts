import { describe, expect, it } from 'vitest'
import { buildVesselOperationalState } from './operationalState'
import { buildBaselineSnapshot } from './baseline'
import type { VesselSnapshot } from '@ave/core-domain/types'

/**
 * ALSO FIX 1 regression guard. `overallConfidencePercent` previously took the minimum of
 * *sensor/analytical confidence* values, which is a measurement-confidence signal, not an
 * availability signal — the same inversion fixed in simulation/health.ts (H2) during V4, which
 * survived here in a second file. A healthy engine could report DATA QUALITY LOW (low sample-count
 * confidence) while a degrading engine reported HIGH (a condition-monitoring model grows more
 * confident as the fault becomes clearer). The fix derives quality from feed
 * dataAvailabilityPercent instead.
 */
describe('buildVesselOperationalState — data quality', () => {
  function qualityLabel(percent: number): 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' {
    if (percent >= 80) return 'HIGH'
    if (percent >= 55) return 'MEDIUM'
    if (percent > 0) return 'LOW'
    return 'NONE'
  }

  it('a fully healthy baseline snapshot yields HIGH data quality', () => {
    const snapshot = buildBaselineSnapshot()
    const state = buildVesselOperationalState(snapshot)
    expect(qualityLabel(state.dataQuality.overallConfidencePercent.value)).toBe('HIGH')
  })

  it('a degraded-feed snapshot (low data availability) yields LOW data quality even with high analytical confidence', () => {
    const base = buildBaselineSnapshot()
    const degradedFeeds: VesselSnapshot = {
      ...base,
      systemHealth: base.systemHealth.map((s) =>
        s.area === 'main_engine'
          ? { ...s, confidence: 96, dataAvailabilityPercent: 20, availabilityStatus: 'stale' as const }
          : s.area === 'navigation'
            ? { ...s, confidence: 95, dataAvailabilityPercent: 15, availabilityStatus: 'stale' as const }
            : s,
      ),
    }
    const state = buildVesselOperationalState(degradedFeeds)
    // High model/sensor CONFIDENCE (96, 95) must not rescue a stale feed — this is the exact
    // inversion the fix removes.
    expect(qualityLabel(state.dataQuality.overallConfidencePercent.value)).toBe('LOW')
  })

  it('a healthy engine with low analytical confidence (few rolling samples) is not penalised — confidence is not the signal', () => {
    const base = buildBaselineSnapshot()
    const lowConfidenceButAvailable: VesselSnapshot = {
      ...base,
      systemHealth: base.systemHealth.map((s) => (s.area === 'main_engine' ? { ...s, confidence: 50, dataAvailabilityPercent: 97, availabilityStatus: 'ok' as const } : s)),
    }
    const state = buildVesselOperationalState(lowConfidenceButAvailable)
    expect(qualityLabel(state.dataQuality.overallConfidencePercent.value)).toBe('HIGH')
  })

  it('an unavailable required feed drives data quality to NONE, regardless of other feeds', () => {
    const base = buildBaselineSnapshot()
    const commsDown: VesselSnapshot = {
      ...base,
      systemHealth: base.systemHealth.map((s) => (s.area === 'communications' ? { ...s, dataAvailabilityPercent: 0, availabilityStatus: 'unavailable' as const } : s)),
    }
    const state = buildVesselOperationalState(commsDown)
    expect(qualityLabel(state.dataQuality.overallConfidencePercent.value)).toBe('NONE')
  })
})
