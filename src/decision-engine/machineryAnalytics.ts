import type { VesselSnapshot } from '@/types'
import { clamp } from '@/utils/random'

export interface MachineryAnalysis {
  deviationC: number
  anomalyScore: number
  healthScore: number
  probableCondition: string
  confidencePercent: number
  consequence: string
  recommendedResponse: string
}

const BASELINE_EXHAUST_DEVIATION_C = 3
const BASELINE_LUB_OIL_PRESSURE_BAR = 4.2

export function analyseMainEngine(snapshot: VesselSnapshot): MachineryAnalysis {
  const { exhaustTempDeviationC, lubOilPressureBar } = snapshot.mainEngine
  const thermalExcess = Math.max(0, exhaustTempDeviationC - BASELINE_EXHAUST_DEVIATION_C)
  const oilPressureDrop = Math.max(0, BASELINE_LUB_OIL_PRESSURE_BAR - lubOilPressureBar)

  const anomalyScore = clamp(thermalExcess * 2.1 + oilPressureDrop * 18, 0, 100)
  const healthScore = clamp(100 - anomalyScore * 0.95, 0, 100)

  let probableCondition: string
  let consequence: string
  let recommendedResponse: string

  if (anomalyScore < 12) {
    probableCondition = 'Normal combustion and lubrication parameters'
    consequence = 'None — condition within expected operating envelope.'
    recommendedResponse = 'Continue routine monitoring.'
  } else if (anomalyScore < 35) {
    probableCondition = 'Early-stage thermal deviation, possible fuel injector or turbocharger fouling trend'
    consequence = 'Minor efficiency loss if trend continues uncorrected.'
    recommendedResponse = 'Increase monitoring frequency; schedule engineer inspection at next suitable opportunity.'
  } else if (anomalyScore < 65) {
    probableCondition = 'Developing exhaust valve or injector anomaly on affected unit'
    consequence = 'Progressive efficiency loss and increasing risk of localised component damage if deferred.'
    recommendedResponse = 'Request Chief Engineer technical review; consider load reduction pending assessment.'
  } else {
    probableCondition = 'Significant thermal anomaly consistent with advancing mechanical degradation'
    consequence = 'Risk of unplanned unit derating or failure if operation continues unchanged.'
    recommendedResponse = 'Recommend Chief Engineer review and load management decision; evaluate reduced-power passage plan.'
  }

  const confidencePercent = Math.round(clamp(62 + anomalyScore * 0.35, 55, 96))

  return { deviationC: exhaustTempDeviationC, anomalyScore: Math.round(anomalyScore), healthScore: Math.round(healthScore), probableCondition, confidencePercent, consequence, recommendedResponse }
}
