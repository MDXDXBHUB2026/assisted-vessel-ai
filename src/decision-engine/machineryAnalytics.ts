import type { VesselSnapshot } from '@/types'
import { clamp } from '@/utils/random'
import { mean, persistenceAbove, persistenceBelow, slopePerSample, type HistoryBuffer } from '@/simulation/telemetryHistory'

export interface MachineryAnalysis {
  baselineExhaustDeviationC: number
  baselineLubOilPressureBar: number
  actualExhaustDeviationC: number
  actualLubOilPressureBar: number
  exhaustSlopePerSample: number
  lubOilSlopePerSample: number
  exhaustPersistence: number
  lubOilPersistence: number
  anomalyScore: number
  healthScore: number
  probableCondition: string
  confidencePercent: number
  consequence: string
  maintenanceConsequence: string
  recommendedResponse: string
  sampleCount: number
}

const BASELINE_EXHAUST_DEVIATION_C = 3
const BASELINE_LUB_OIL_PRESSURE_BAR = 4.2

/**
 * Genuine time-series analytics: combines the instantaneous deviation from baseline with the
 * rolling trend (slope) and persistence of that deviation across the recent sample window,
 * rather than scoring a single point-in-time reading. This is what lets the engine-degradation
 * scenario be detected as a *developing* condition rather than a step-change status flag.
 */
export function analyseMainEngine(snapshot: VesselSnapshot, history?: { exhaustTempDeviationC: HistoryBuffer; lubOilPressureBar: HistoryBuffer }): MachineryAnalysis {
  const { exhaustTempDeviationC, lubOilPressureBar } = snapshot.mainEngine

  const exhaustHistory = history?.exhaustTempDeviationC
  const lubOilHistory = history?.lubOilPressureBar
  const sampleCount = exhaustHistory?.values.length ?? 0

  const thermalExcess = Math.max(0, exhaustTempDeviationC - BASELINE_EXHAUST_DEVIATION_C)
  const oilPressureDrop = Math.max(0, BASELINE_LUB_OIL_PRESSURE_BAR - lubOilPressureBar)

  const exhaustSlopePerSample = exhaustHistory ? slopePerSample(exhaustHistory) : 0
  const lubOilSlopePerSample = lubOilHistory ? slopePerSample(lubOilHistory) : 0
  const exhaustPersistence = exhaustHistory ? persistenceAbove(exhaustHistory, BASELINE_EXHAUST_DEVIATION_C + 5) : 0
  const lubOilPersistence = lubOilHistory ? persistenceBelow(lubOilHistory, BASELINE_LUB_OIL_PRESSURE_BAR - 0.3) : 0

  // Point deviation component
  const deviationComponent = thermalExcess * 2.0 + oilPressureDrop * 16
  // Trend component — only a *worsening* slope counts (rising exhaust temp, falling oil pressure)
  const trendComponent = clamp(exhaustSlopePerSample, 0, 3) * 9 + clamp(-lubOilSlopePerSample, 0, 0.3) * 40
  // Persistence component — a deviation sustained across the recent window is weighted higher
  // than a single noisy spike, matching how a real condition-monitoring system avoids
  // false-triggering on sensor noise.
  const persistenceComponent = (exhaustPersistence * 0.6 + lubOilPersistence * 0.4) * 20

  const anomalyScore = clamp(deviationComponent + trendComponent + persistenceComponent, 0, 100)
  const healthScore = clamp(100 - anomalyScore * 0.95, 0, 100)

  let probableCondition: string
  let consequence: string
  let maintenanceConsequence: string
  let recommendedResponse: string

  if (anomalyScore < 12) {
    probableCondition = 'Normal combustion and lubrication parameters'
    consequence = 'None — condition within expected operating envelope.'
    maintenanceConsequence = 'No maintenance action indicated.'
    recommendedResponse = 'Continue routine monitoring.'
  } else if (anomalyScore < 35) {
    probableCondition = 'Early-stage thermal deviation, possible fuel injector or turbocharger fouling trend'
    consequence = 'Minor efficiency loss if trend continues uncorrected.'
    maintenanceConsequence = 'Add to next routine inspection checklist; no schedule change required yet.'
    recommendedResponse = 'Increase monitoring frequency; schedule engineer inspection at next suitable opportunity.'
  } else if (anomalyScore < 65) {
    probableCondition = 'Developing exhaust valve or injector anomaly on affected unit'
    consequence = 'Progressive efficiency loss and increasing risk of localised component damage if deferred.'
    maintenanceConsequence = 'Bring forward inspection window; verify spare-part availability for affected component.'
    recommendedResponse = 'Request Chief Engineer technical review; consider load reduction pending assessment.'
  } else {
    probableCondition = 'Significant thermal anomaly consistent with advancing mechanical degradation'
    consequence = 'Risk of unplanned unit derating or failure if operation continues unchanged.'
    maintenanceConsequence = 'Unscheduled maintenance likely required; assess technical shore-support and next-port options now.'
    recommendedResponse = 'Recommend Chief Engineer review and load management decision; evaluate reduced-power passage plan.'
  }

  const dataMaturityPenalty = sampleCount < 6 ? 15 : 0
  const confidencePercent = Math.round(clamp(62 + anomalyScore * 0.35 - dataMaturityPenalty, 50, 96))

  return {
    baselineExhaustDeviationC: BASELINE_EXHAUST_DEVIATION_C,
    baselineLubOilPressureBar: BASELINE_LUB_OIL_PRESSURE_BAR,
    actualExhaustDeviationC: exhaustTempDeviationC,
    actualLubOilPressureBar: lubOilPressureBar,
    exhaustSlopePerSample,
    lubOilSlopePerSample,
    exhaustPersistence,
    lubOilPersistence,
    anomalyScore: Math.round(anomalyScore),
    healthScore: Math.round(healthScore),
    probableCondition,
    confidencePercent,
    consequence,
    maintenanceConsequence,
    recommendedResponse,
    sampleCount,
  }
}

export function exhaustHistoryMean(history: HistoryBuffer): number {
  return mean(history)
}
