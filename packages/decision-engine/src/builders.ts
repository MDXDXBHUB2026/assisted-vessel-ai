import type { AnalyticalMethod, EvidenceItem, HazardCategory, RequiredAuthority, RiskLevel, VesselSnapshot, VesselSystemArea } from '@ave/core-domain/types'
import type { MachineryAnalysis } from './machineryAnalytics'
import { CAUTION_BAND_MULTIPLIER, DEFAULT_TARGET_RISK_LIMITS, type TargetRiskLimits } from './targetRisk'

export interface RecommendationContent {
  vesselFunction: VesselSystemArea | 'voyage' | 'safety'
  title: string
  detectedCondition: string
  sourceSystems: string[]
  evidence: EvidenceItem[]
  dataQuality: 'high' | 'medium' | 'low' | 'unavailable'
  analyticalMethod: AnalyticalMethod
  modelId: string
  modelVersion: string
  confidencePercent: number
  riskLevel: RiskLevel
  recommendedResponse: string
  alternativeAction: string
  fallbackOption: string
  expectedBenefit: string
  potentialConsequence: string
  requiredAuthority: RequiredAuthority
  functionId: string
  /** Closes the decision chain both ways: the hazard this recommendation was generated from. */
  hazardId?: string
  /**
   * The category of the hazard named by `hazardId`. `functionId` picks a real assisted function's
   * ODD purely to source an envelope/mode/authority check — it is not necessarily sensitive to
   * this hazard's own category — so the safety engine checks this field directly against the open
   * hazard register rather than relying on `functionId`'s declared sensitivities.
   */
  originatingHazardCategory?: HazardCategory
}

export function engineDegradationRecommendation(snapshot: VesselSnapshot, analysis: MachineryAnalysis, severity: number): RecommendationContent {
  const riskLevel: RiskLevel = severity > 0.75 ? 'high' : severity > 0.4 ? 'medium' : 'low'
  return {
    vesselFunction: 'main_engine',
    title: 'Main Engine Thermal Anomaly — Technical Review Suggested',
    detectedCondition: analysis.probableCondition,
    sourceSystems: ['Exhaust temperature array', 'Lubricating oil pressure sensor', 'Shaft power calculation', 'Running-hours log'],
    dataQuality: analysis.sampleCount >= 6 ? 'high' : 'medium',
    analyticalMethod: 'ml_trend_detection',
    confidencePercent: analysis.confidencePercent,
    riskLevel,
    recommendedResponse: analysis.recommendedResponse,
    alternativeAction: 'Reduce main engine load pending Chief Engineer assessment rather than continuing at current load.',
    fallbackOption: 'If confidence in sensor data is in doubt, revert to manual engine-room rounds and log-book readings at increased frequency.',
    expectedBenefit: 'Early intervention reduces risk of unplanned derating and limits consequential damage.',
    potentialConsequence: analysis.consequence,
    requiredAuthority: 'chief_engineer',
    evidence: [
      { label: 'Exhaust temperature deviation', value: `${analysis.actualExhaustDeviationC.toFixed(1)} °C (baseline ${analysis.baselineExhaustDeviationC.toFixed(1)} °C)`, sourceSystem: 'Engine Monitoring', provenance: 'simulated' },
      { label: 'Exhaust temperature trend', value: `${analysis.exhaustSlopePerSample >= 0 ? '+' : ''}${analysis.exhaustSlopePerSample.toFixed(2)} °C/sample`, sourceSystem: 'Machinery Intelligence', provenance: 'calculated' },
      { label: 'Anomaly score', value: `${analysis.anomalyScore} / 100`, sourceSystem: 'Machinery Intelligence', provenance: 'calculated' },
      { label: 'Health score', value: `${analysis.healthScore} / 100`, sourceSystem: 'Machinery Intelligence', provenance: 'calculated' },
      { label: 'Lubricating oil pressure', value: `${snapshot.mainEngine.lubOilPressureBar.toFixed(2)} bar`, sourceSystem: 'Engine Monitoring', provenance: 'simulated' },
    ],
    modelId: 'ME-Anomaly-Detector',
    modelVersion: 'v2.3.1',
    functionId: 'machinery_anomaly_detection',
  }
}

export function collisionRiskRecommendation(cpaNm: number, tcpaMinutes: number, targetLabel: string, riskLimits: TargetRiskLimits = DEFAULT_TARGET_RISK_LIMITS): RecommendationContent {
  // Deliberately CPA-only (anchored to the operator's single cpaLimitNm, not an independent magic
  // number), not classifyTargetRisk's joint CPA-and-TCPA bands: this recommendation is triggered by
  // CPA proximity alone (see engine.ts's collision_risk_rec gate) for a target whose TCPA can stay
  // large for a long time even as CPA closes. Grading severity by the joint classification here
  // would report a "low"-risk card for a target the CPA-based gate just flagged as a closing hazard.
  const riskLevel: RiskLevel = cpaNm <= riskLimits.cpaLimitNm ? 'high' : cpaNm <= riskLimits.cpaLimitNm * CAUTION_BAND_MULTIPLIER ? 'medium' : 'low'
  return {
    vesselFunction: 'navigation',
    title: `Closing Range Development — ${targetLabel}`,
    detectedCondition: `Projected CPA of ${cpaNm.toFixed(2)} nm in ${tcpaMinutes.toFixed(0)} minutes if courses and speeds are maintained.`,
    sourceSystems: ['AIS target tracking', 'Radar tracking', 'Own-ship course and speed'],
    dataQuality: 'high',
    analyticalMethod: 'ml_trend_detection',
    confidencePercent: 88,
    riskLevel,
    recommendedResponse: 'Evaluate early course alteration, speed reduction, or enhanced monitoring in line with the COLREGs and bridge team judgement.',
    alternativeAction: 'Maintain course and speed under enhanced visual and radar monitoring if bridge team assesses risk as acceptable.',
    fallbackOption: 'If radar/AIS confidence degrades, revert to visual bearing-drift monitoring and sound signals per the COLREGs.',
    expectedBenefit: 'Earlier situational awareness supports timely bridge decision-making and increases available response time.',
    potentialConsequence: 'Continued closure without action reduces available manoeuvring time and options for both vessels.',
    requiredAuthority: 'officer_of_the_watch',
    evidence: [
      { label: 'CPA', value: `${cpaNm.toFixed(2)} nm`, sourceSystem: 'Navigation Assistance', provenance: 'calculated' },
      { label: 'TCPA', value: `${tcpaMinutes.toFixed(0)} minutes`, sourceSystem: 'Navigation Assistance', provenance: 'calculated' },
      { label: 'Target', value: targetLabel, sourceSystem: 'AIS / Radar Fusion', provenance: 'simulated' },
    ],
    modelId: 'CPA-Risk-Model',
    modelVersion: 'v1.4.0',
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
    sourceSystems: ['Reefer monitoring telemetry', 'Container power-status log'],
    dataQuality: 'high',
    analyticalMethod: 'ml_anomaly_detection',
    confidencePercent: 91,
    riskLevel,
    recommendedResponse: 'Dispatch crew to inspect unit, verify power supply and setpoint, and assess cargo condition.',
    alternativeAction: 'Move affected cargo priority for early discharge at next port if the unit cannot be stabilised underway.',
    fallbackOption: 'If the unit cannot be restored, document condition and notify cargo interests via shore technical support.',
    expectedBenefit: 'Early detection reduces risk of cargo loss or claim exposure.',
    potentialConsequence: 'Continued excursion risks spoilage of temperature-sensitive cargo and consequent claim exposure.',
    requiredAuthority: 'officer_of_the_watch',
    evidence: [
      { label: 'Actual temperature', value: `${actualTempC.toFixed(1)} °C`, sourceSystem: 'Reefer Monitoring', provenance: 'simulated' },
      { label: 'Set point', value: `${setPointC.toFixed(1)} °C`, sourceSystem: 'Reefer Monitoring', provenance: 'simulated' },
      { label: 'Cargo category', value: cargoCategory, sourceSystem: 'Cargo Manifest (synthetic)', provenance: 'simulated' },
    ],
    modelId: 'Reefer-Excursion-Rule',
    modelVersion: 'v1.2.0',
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
    sourceSystems: ['Fuel flow meters', 'Shaft power calculation', 'Weather routing data'],
    dataQuality: 'high',
    analyticalMethod: 'optimisation',
    confidencePercent: 84,
    riskLevel,
    recommendedResponse: 'Evaluate speed adjustment against ETA window, and consider hull/propeller and weather-routing factors.',
    alternativeAction: 'Maintain current speed if the arrival window has no tolerance for delay, accepting the fuel penalty.',
    fallbackOption: 'If optimisation inputs (weather routing) are unavailable, fall back to standard passage planning speed tables.',
    expectedBenefit: 'Restoring baseline consumption reduces cost and emissions without materially affecting ETA if arrival window allows.',
    potentialConsequence: 'Continued excess consumption increases voyage cost and emissions with no operational benefit.',
    requiredAuthority: 'master',
    evidence: [
      { label: 'Current consumption', value: `${snapshot.fuelEnergy.fuelConsumptionRateTonPerDay.toFixed(1)} t/day`, sourceSystem: 'Energy Monitoring', provenance: 'simulated' },
      { label: 'Baseline consumption', value: `${snapshot.fuelEnergy.baselineConsumptionRateTonPerDay.toFixed(1)} t/day`, sourceSystem: 'Energy Monitoring', provenance: 'simulated' },
      { label: 'Excess', value: `${excessPercent.toFixed(0)}%`, sourceSystem: 'Voyage & Energy Intelligence', provenance: 'calculated' },
    ],
    modelId: 'Voyage-Optimiser',
    modelVersion: 'v3.0.2',
    functionId: 'voyage_speed_optimisation',
  }
}

export function gnssDegradationRecommendation(gnssConfidence: number): RecommendationContent {
  return {
    vesselFunction: 'navigation',
    title: 'GNSS / Sensor Confidence Degraded',
    detectedCondition: `Position confidence has fallen to ${gnssConfidence.toFixed(0)}%, below the threshold for full navigation assistance.`,
    sourceSystems: ['GNSS receiver diagnostics', 'Sensor confidence fusion'],
    dataQuality: 'low',
    analyticalMethod: 'deterministic_rule',
    confidencePercent: 95,
    riskLevel: gnssConfidence < 40 ? 'high' : 'medium',
    recommendedResponse: 'Cross-check position by radar/visual fixing; navigation assistance functions restricted until confidence recovers.',
    alternativeAction: 'Continue on dead-reckoning with increased fixing frequency if radar/visual fixing is unavailable.',
    fallbackOption: 'Revert to conventional (L0) navigation practice until GNSS confidence is restored.',
    expectedBenefit: 'Prevents reliance on degraded position data for assistance recommendations.',
    potentialConsequence: 'Continued reliance on degraded GNSS data risks a compounding navigational error.',
    requiredAuthority: 'officer_of_the_watch',
    evidence: [{ label: 'GNSS confidence', value: `${gnssConfidence.toFixed(0)}%`, sourceSystem: 'Navigation Sensors', provenance: 'simulated' }],
    modelId: 'Sensor-Confidence-Fusion',
    modelVersion: 'v1.0.4',
    functionId: 'nav_collision_advisory',
  }
}

export function safetyEventRecommendation(hazardTitle: string, hazardId: string, hazardCategory: HazardCategory): RecommendationContent {
  return {
    hazardId,
    originatingHazardCategory: hazardCategory,
    vesselFunction: 'safety',
    title: `Safety Hazard Raised — ${hazardTitle}`,
    detectedCondition: `A safety hazard condition has been detected and requires crew acknowledgement and response.`,
    sourceSystems: ['Safety systems monitoring', 'Alarm correlation engine'],
    dataQuality: 'high',
    analyticalMethod: 'deterministic_rule',
    confidencePercent: 93,
    riskLevel: 'high',
    recommendedResponse: 'Acknowledge, assign a responsible role, and follow the vessel safety management system procedure.',
    alternativeAction: 'Muster additional crew if initial response indicates the condition is worsening.',
    fallbackOption: 'Escalate to shore safety support immediately if onboard resources cannot contain the condition.',
    expectedBenefit: 'Structured response reduces risk to personnel and vessel.',
    potentialConsequence: 'Delayed response could allow a contained condition to escalate.',
    requiredAuthority: 'master',
    evidence: [{ label: 'Hazard', value: hazardTitle, sourceSystem: 'Safety Intelligence', provenance: 'rule_validated' }],
    modelId: 'Safety-Event-Rule',
    modelVersion: 'v1.0.0',
    functionId: 'machinery_anomaly_detection',
  }
}
