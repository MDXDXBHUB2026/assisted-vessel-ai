import type { EvidenceItem, RequiredAuthority, RiskLevel, VesselSnapshot, VesselSystemArea } from '@/types'
import { analyseMainEngine } from './machineryAnalytics'

export interface RecommendationContent {
  vesselFunction: VesselSystemArea | 'voyage' | 'safety'
  title: string
  detectedCondition: string
  sourceData: string[]
  confidencePercent: number
  riskLevel: RiskLevel
  recommendedResponse: string
  expectedBenefit: string
  requiredAuthority: RequiredAuthority
  evidence: EvidenceItem[]
  modelId: string
  functionId: string
}

export function engineDegradationRecommendation(snapshot: VesselSnapshot, severity: number): RecommendationContent {
  const analysis = analyseMainEngine(snapshot)
  const riskLevel: RiskLevel = severity > 0.75 ? 'high' : severity > 0.4 ? 'medium' : 'low'
  return {
    vesselFunction: 'main_engine',
    title: 'Main Engine Thermal Anomaly — Technical Review Suggested',
    detectedCondition: analysis.probableCondition,
    sourceData: ['Exhaust temperature array', 'Lubricating oil pressure sensor', 'Shaft power calculation', 'Running-hours log'],
    confidencePercent: analysis.confidencePercent,
    riskLevel,
    recommendedResponse: analysis.recommendedResponse,
    expectedBenefit: 'Early intervention reduces risk of unplanned derating and limits consequential damage.',
    requiredAuthority: 'chief_engineer',
    evidence: [
      { label: 'Exhaust temperature deviation', value: `${analysis.deviationC.toFixed(1)} °C above baseline`, sourceSystem: 'Engine Monitoring' },
      { label: 'Anomaly score', value: `${analysis.anomalyScore} / 100`, sourceSystem: 'Machinery Intelligence' },
      { label: 'Health score', value: `${analysis.healthScore} / 100`, sourceSystem: 'Machinery Intelligence' },
      { label: 'Lubricating oil pressure', value: `${snapshot.mainEngine.lubOilPressureBar.toFixed(2)} bar`, sourceSystem: 'Engine Monitoring' },
    ],
    modelId: 'ME-Anomaly-Detector v2.3',
    functionId: 'machinery_anomaly_detection',
  }
}

export function collisionRiskRecommendation(cpaNm: number, tcpaMinutes: number, targetLabel: string): RecommendationContent {
  const riskLevel: RiskLevel = cpaNm < 1 ? 'high' : cpaNm < 2.5 ? 'medium' : 'low'
  return {
    vesselFunction: 'navigation',
    title: `Closing Range Development — ${targetLabel}`,
    detectedCondition: `Projected CPA of ${cpaNm.toFixed(2)} nm in ${tcpaMinutes.toFixed(0)} minutes if courses and speeds are maintained.`,
    sourceData: ['AIS target tracking', 'Radar tracking', 'Own-ship course and speed'],
    confidencePercent: 88,
    riskLevel,
    recommendedResponse: 'Evaluate early course alteration, speed reduction, or enhanced monitoring in line with the COLREGs and bridge team judgement.',
    expectedBenefit: 'Earlier situational awareness supports timely bridge decision-making and increases available response time.',
    requiredAuthority: 'officer_of_the_watch',
    evidence: [
      { label: 'CPA', value: `${cpaNm.toFixed(2)} nm`, sourceSystem: 'Navigation Assistance' },
      { label: 'TCPA', value: `${tcpaMinutes.toFixed(0)} minutes`, sourceSystem: 'Navigation Assistance' },
      { label: 'Target', value: targetLabel, sourceSystem: 'AIS / Radar Fusion' },
    ],
    modelId: 'CPA-Risk-Model v1.4',
    functionId: 'nav_collision_advisory',
  }
}

export function reeferExcursionRecommendation(containerRef: string, actualTempC: number, setPointC: number, cargoCategory: string): RecommendationContent {
  const deviation = Math.abs(actualTempC - setPointC)
  const riskLevel: RiskLevel = deviation > 4 ? 'high' : deviation > 2 ? 'medium' : 'low'
  return {
    vesselFunction: 'cargo_reefer',
    title: `Reefer Temperature Excursion — ${containerRef}`,
    detectedCondition: `Actual temperature ${actualTempC.toFixed(1)}°C has drifted ${deviation.toFixed(1)}°C from set point ${setPointC.toFixed(1)}°C (${cargoCategory}).`,
    sourceData: ['Reefer monitoring telemetry', 'Container power-status log'],
    confidencePercent: 91,
    riskLevel,
    recommendedResponse: 'Dispatch crew to inspect unit, verify power supply and setpoint, and assess cargo condition.',
    expectedBenefit: 'Early detection reduces risk of cargo loss or claim exposure.',
    requiredAuthority: 'officer_of_the_watch',
    evidence: [
      { label: 'Actual temperature', value: `${actualTempC.toFixed(1)} °C`, sourceSystem: 'Reefer Monitoring' },
      { label: 'Set point', value: `${setPointC.toFixed(1)} °C`, sourceSystem: 'Reefer Monitoring' },
      { label: 'Cargo category', value: cargoCategory, sourceSystem: 'Cargo Manifest (synthetic)' },
    ],
    modelId: 'Reefer-Excursion-Rule v1.2',
    functionId: 'reefer_monitoring',
  }
}

export function fuelConsumptionRecommendation(snapshot: VesselSnapshot): RecommendationContent {
  const excess = snapshot.fuelEnergy.fuelConsumptionRateTonPerDay - snapshot.fuelEnergy.baselineConsumptionRateTonPerDay
  const excessPercent = (excess / snapshot.fuelEnergy.baselineConsumptionRateTonPerDay) * 100
  const riskLevel: RiskLevel = excessPercent > 20 ? 'medium' : 'low'
  return {
    vesselFunction: 'voyage',
    title: 'Fuel Consumption Trending Above Baseline',
    detectedCondition: `Fuel consumption is ${excessPercent.toFixed(0)}% above the baseline rate for the current speed and loading condition.`,
    sourceData: ['Fuel flow meters', 'Shaft power calculation', 'Weather routing data'],
    confidencePercent: 84,
    riskLevel,
    recommendedResponse: 'Evaluate speed adjustment against ETA window, and consider hull/propeller and weather-routing factors.',
    expectedBenefit: 'Restoring baseline consumption reduces cost and emissions without materially affecting ETA if arrival window allows.',
    requiredAuthority: 'master',
    evidence: [
      { label: 'Current consumption', value: `${snapshot.fuelEnergy.fuelConsumptionRateTonPerDay.toFixed(1)} t/day`, sourceSystem: 'Energy Monitoring' },
      { label: 'Baseline consumption', value: `${snapshot.fuelEnergy.baselineConsumptionRateTonPerDay.toFixed(1)} t/day`, sourceSystem: 'Energy Monitoring' },
      { label: 'Excess', value: `${excessPercent.toFixed(0)}%`, sourceSystem: 'Voyage & Energy Intelligence' },
    ],
    modelId: 'Voyage-Optimiser v3.0',
    functionId: 'voyage_speed_optimisation',
  }
}

export function gnssDegradationRecommendation(gnssConfidence: number): RecommendationContent {
  return {
    vesselFunction: 'navigation',
    title: 'GNSS / Sensor Confidence Degraded',
    detectedCondition: `Position confidence has fallen to ${gnssConfidence.toFixed(0)}%, below the threshold for full navigation assistance.`,
    sourceData: ['GNSS receiver diagnostics', 'Sensor confidence fusion'],
    confidencePercent: 95,
    riskLevel: gnssConfidence < 40 ? 'high' : 'medium',
    recommendedResponse: 'Cross-check position by radar/visual fixing; navigation assistance functions restricted until confidence recovers.',
    expectedBenefit: 'Prevents reliance on degraded position data for assistance recommendations.',
    requiredAuthority: 'officer_of_the_watch',
    evidence: [{ label: 'GNSS confidence', value: `${gnssConfidence.toFixed(0)}%`, sourceSystem: 'Navigation Sensors' }],
    modelId: 'Sensor-Confidence-Fusion v1.0',
    functionId: 'nav_collision_advisory',
  }
}

export function safetyEventRecommendation(hazardTitle: string): RecommendationContent {
  return {
    vesselFunction: 'safety',
    title: `Safety Hazard Raised — ${hazardTitle}`,
    detectedCondition: `A safety hazard condition has been detected and requires crew acknowledgement and response.`,
    sourceData: ['Safety systems monitoring', 'Alarm correlation engine'],
    confidencePercent: 93,
    riskLevel: 'high',
    recommendedResponse: 'Acknowledge, assign a responsible role, and follow the vessel safety management system procedure.',
    expectedBenefit: 'Structured response reduces risk to personnel and vessel.',
    requiredAuthority: 'master',
    evidence: [{ label: 'Hazard', value: hazardTitle, sourceSystem: 'Safety Intelligence' }],
    modelId: 'Safety-Event-Rule v1.0',
    functionId: 'machinery_anomaly_detection',
  }
}
