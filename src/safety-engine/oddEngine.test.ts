import { describe, expect, it } from 'vitest'
import { assessAllOdd, vesselAssistanceLevelSummary } from './oddEngine'
import { buildBaselineSnapshot } from '@/simulation/baseline'
import { buildInitialSimulationState } from '@/simulation/state'
import { activeIntolerableHazardCategories } from '@/decision-engine/hazardLifecycle'
import type { VesselSnapshot } from '@/types'

describe('vesselAssistanceLevelSummary', () => {
  it('is L2 or better on a nominal baseline snapshot with no open hazards — not permanently pinned at L1', () => {
    // ALSO FIX 2 regression guard: shore_sync_assistance is configured at L1 forever, and
    // including it in the vessel-wide minimum previously pinned this stat at L1 regardless of
    // conditions. Excluding shore-side functions must actually change the result. This exercises
    // the ODD/mode/sensor dimension of that fix with no hazard register involved at all — the
    // hazard-driven floor is a separate, deliberate case covered below.
    const assessments = assessAllOdd(buildBaselineSnapshot(), [])
    const summary = vesselAssistanceLevelSummary(assessments)
    expect(['L2', 'L3']).toContain(summary.level)
  })

  it('the value visibly changes when conditions degrade — the stat must be able to move', () => {
    const nominal = buildBaselineSnapshot()
    const degraded: VesselSnapshot = {
      ...nominal,
      environment: { ...nominal.environment, visibilityNm: 0.2, waveHeightM: 9 },
      navigation: { ...nominal.navigation, gnssConfidence: 0, gnssAvailable: false, radarAvailable: false, aisAvailable: false },
    }
    const nominalLevel = vesselAssistanceLevelSummary(assessAllOdd(nominal, [])).level
    const degradedLevel = vesselAssistanceLevelSummary(assessAllOdd(degraded, [])).level
    expect(degradedLevel).not.toBe(nominalLevel)
  })

  it('names the constraining function once the summary drops below L3', () => {
    const nominal = buildBaselineSnapshot()
    const degraded: VesselSnapshot = { ...nominal, environment: { ...nominal.environment, visibilityNm: 0.2 }, navigation: { ...nominal.navigation, gnssAvailable: false, radarAvailable: false, aisAvailable: false } }
    const summary = vesselAssistanceLevelSummary(assessAllOdd(degraded, []))
    if (summary.level !== 'L3') {
      expect(summary.constrainingFunctionLabel).toBeTruthy()
    }
  })

  it('excludes shore-side monitoring functions from the vessel summary regardless of their own state', () => {
    const nominal = buildBaselineSnapshot()
    const commsDown: VesselSnapshot = { ...nominal, communications: { ...nominal.communications, satelliteLinkUp: false, satelliteConfidence: 0 } }
    // shore_sync_assistance alone would report L0/L1 here, but it must not depress the vessel
    // summary, which depends only on onboard safety-relevant functions.
    const summary = vesselAssistanceLevelSummary(assessAllOdd(commsDown, []))
    expect(['L2', 'L3']).toContain(summary.level)
  })

  it('is genuinely held at L1 by the real baseline hazard register at application start, and says so', () => {
    // The application's actual initial state (buildInitialSimulationState, not the bare
    // buildBaselineSnapshot() used above) seeds an open, intolerable-band (RI 8) cargo hazard —
    // a deliberate PROBLEM-2 demonstration of the Master-decision gate, not a bug. Every hazard
    // category maps to at least one vessel-safety-relevant function (SAFETY-HAZARD-001), so no
    // choice of baseline category could avoid constraining the summary; the correct fix is not to
    // hide this, but for the summary to say plainly that this floor is hazard-held rather than a
    // routine envelope limit, so it is never mistaken for the pinned-forever ALSO-FIX-2 defect.
    const initial = buildInitialSimulationState()
    const hazardCategories = activeIntolerableHazardCategories(initial.hazards)
    expect(hazardCategories.length).toBeGreaterThan(0)
    const summary = vesselAssistanceLevelSummary(assessAllOdd(initial.snapshot, hazardCategories))
    expect(summary.level).toBe('L1')
    expect(summary.constrainedByHazard).toBe(true)
  })

  it('recovers above L1 once the hazard-holding register is cleared — the floor is not permanent', () => {
    const initial = buildInitialSimulationState()
    const heldSummary = vesselAssistanceLevelSummary(assessAllOdd(initial.snapshot, activeIntolerableHazardCategories(initial.hazards)))
    expect(heldSummary.level).toBe('L1')

    const clearedSummary = vesselAssistanceLevelSummary(assessAllOdd(initial.snapshot, []))
    expect(['L2', 'L3']).toContain(clearedSummary.level)
    expect(clearedSummary.constrainedByHazard).toBeFalsy()
  })
})
