import type { AssistanceLevel, OddAssessment, OddParameterStatus, OddStatus, VesselSnapshot } from '@/types'
import { assistanceLevelRank, OPERATIONAL_MODE_LABELS } from '@/types'
import { ASSISTED_FUNCTIONS, getAssistedFunction } from './oddFunctions'
import { clamp } from '@/utils/random'

const NEAR_LIMIT_FRACTION = 0.25

function classify(rawMargin: number): { status: OddStatus; marginFraction: number } {
  if (rawMargin <= 0) return { status: 'outside', marginFraction: 0 }
  if (rawMargin < NEAR_LIMIT_FRACTION) return { status: 'near_limit', marginFraction: clamp(rawMargin, 0, 1) }
  return { status: 'inside', marginFraction: clamp(rawMargin, 0, 1) }
}

/** Margin for a "must be at least" constraint, expressed as a fraction of a comfort band above the minimum. */
function minMargin(actual: number, min: number, bandWidth: number): number {
  if (min <= 0) return 1
  if (bandWidth <= 0) return actual >= min ? 1 : 0
  return (actual - min) / bandWidth
}

/** Margin for a "must be at most" constraint, expressed as a fraction of a comfort band below the maximum. */
function maxMargin(actual: number, max: number, bandWidth: number): number {
  if (bandWidth <= 0) return actual <= max ? 1 : 0
  return (max - actual) / bandWidth
}

/**
 * Sensor confidence scoped to only the domains a given function actually depends on. A shared
 * global minimum across navigation/comms/machinery would let a comms-only degradation wrongly
 * throttle an unrelated onboard function (e.g. machinery monitoring) — exactly the failure mode
 * graceful degradation is meant to prevent.
 */
function relevantSensorConfidence(fn: { requiresRadar: boolean; requiresAis: boolean; requiresCommunications: boolean; minGnssConfidence: number; id: string }, snapshot: VesselSnapshot): number {
  const sources: number[] = []
  if (fn.requiresRadar || fn.requiresAis || fn.minGnssConfidence > 0) sources.push(snapshot.navigation.gnssConfidence)
  if (fn.requiresCommunications) sources.push(snapshot.communications.satelliteConfidence)
  if (fn.id === 'machinery_anomaly_detection' || fn.id === 'predictive_maintenance') sources.push(snapshot.systemHealth.find((s) => s.area === 'main_engine')?.confidence ?? 100)
  return sources.length === 0 ? 100 : Math.min(...sources)
}

function minAssistanceLevel(a: AssistanceLevel, b: AssistanceLevel): AssistanceLevel {
  return assistanceLevelRank(a) <= assistanceLevelRank(b) ? a : b
}

export function assessOdd(functionId: string, snapshot: VesselSnapshot): OddAssessment {
  const fn = getAssistedFunction(functionId)
  const sensorConfidence = relevantSensorConfidence(fn, snapshot)
  const modeAllowed = fn.allowedModes.includes(snapshot.operationalMode)

  const visibility = classify(minMargin(snapshot.environment.visibilityNm, fn.minVisibilityNm, Math.max(fn.minVisibilityNm * 0.5, 1)))
  const waveHeight = classify(maxMargin(snapshot.environment.waveHeightM, fn.maxWaveHeightM, fn.maxWaveHeightM * 0.25))
  const gnss = classify(fn.minGnssConfidence <= 0 ? 1 : snapshot.navigation.gnssAvailable ? minMargin(snapshot.navigation.gnssConfidence, fn.minGnssConfidence, 20) : -1)
  const radar = classify(!fn.requiresRadar ? 1 : snapshot.navigation.radarAvailable ? 1 : -1)
  const ais = classify(!fn.requiresAis ? 1 : snapshot.navigation.aisAvailable ? 1 : -1)
  const chart = classify(!fn.requiresChartData ? 1 : snapshot.navigation.chartDataValid ? 1 : -1)
  const comms = classify(!fn.requiresCommunications ? 1 : snapshot.communications.satelliteLinkUp ? 1 : -1)
  const sensor = classify(fn.minSensorConfidence <= 0 ? 1 : minMargin(sensorConfidence, fn.minSensorConfidence, 15))
  // Ship-shore data latency only constrains functions that actually depend on the shore link.
  // A purely onboard function (e.g. machinery monitoring) must keep working at full envelope
  // through a communications outage — that is the whole point of graceful degradation.
  const latency = classify(!fn.requiresCommunications ? 1 : maxMargin(snapshot.communications.shoreSyncLatencySec, fn.maxDataLatencySec, fn.maxDataLatencySec * 0.3))
  const mode = classify(modeAllowed ? 1 : -1)

  const parameters: OddParameterStatus[] = [
    { key: 'operationalMode', label: 'Operational Mode', value: OPERATIONAL_MODE_LABELS[snapshot.operationalMode], ...mode, detail: modeAllowed ? 'Function enabled in this operational mode.' : 'Function not enabled in this operational mode.' },
    { key: 'visibility', label: 'Visibility', value: `${snapshot.environment.visibilityNm.toFixed(1)} nm`, ...visibility, detail: `Requires ≥ ${fn.minVisibilityNm} nm` },
    { key: 'waveHeight', label: 'Wave Height', value: `${snapshot.environment.waveHeightM.toFixed(1)} m`, ...waveHeight, detail: `Requires ≤ ${fn.maxWaveHeightM} m` },
    { key: 'gnssAvailability', label: 'GNSS Confidence', value: `${snapshot.navigation.gnssConfidence.toFixed(0)}%`, ...gnss, detail: `Requires GNSS available and ≥ ${fn.minGnssConfidence}%` },
    { key: 'radarAvailability', label: 'Radar', value: snapshot.navigation.radarAvailable ? 'Available' : 'Unavailable', ...radar, detail: fn.requiresRadar ? 'Required for this function' : 'Not required' },
    { key: 'aisAvailability', label: 'AIS', value: snapshot.navigation.aisAvailable ? 'Available' : 'Unavailable', ...ais, detail: fn.requiresAis ? 'Required for this function' : 'Not required' },
    { key: 'chartDataValidity', label: 'Route / Chart Data', value: snapshot.navigation.chartDataValid ? 'Valid' : 'Invalid', ...chart, detail: fn.requiresChartData ? 'Valid chart data required' : 'Not required' },
    { key: 'communications', label: 'Ship-Shore Communications', value: snapshot.communications.satelliteLinkUp ? 'Up' : 'Down', ...comms, detail: fn.requiresCommunications ? 'Shore link required for this function' : 'Not required' },
    { key: 'sensorConfidence', label: 'Sensor Confidence', value: `${sensorConfidence.toFixed(0)}%`, ...sensor, detail: `Requires ≥ ${fn.minSensorConfidence}%` },
    { key: 'dataLatency', label: 'Data Latency', value: `${snapshot.communications.shoreSyncLatencySec.toFixed(1)} s`, ...latency, detail: fn.requiresCommunications ? `Requires ≤ ${fn.maxDataLatencySec}s round-trip` : 'Not required — onboard function' },
    { key: 'trafficDensity', label: 'Traffic Density', value: snapshot.environment.trafficDensity, status: 'inside', marginFraction: 1, detail: 'Informational — affects recommendation priority, not envelope admission' },
    { key: 'machineryHealth', label: 'Machinery Health', value: snapshot.systemHealth.find((s) => s.area === 'main_engine')?.health ?? 'healthy', status: 'inside', marginFraction: 1, detail: 'Informational — considered separately by the safety validation layer' },
  ]

  const limitingFactors = parameters.filter((p) => p.status === 'outside')
  const nearLimitFactors = parameters.filter((p) => p.status === 'near_limit')

  const status: OddStatus = limitingFactors.length > 0 ? 'outside' : nearLimitFactors.length > 0 ? 'near_limit' : 'inside'

  let availableAssistanceLevel: AssistanceLevel = fn.configuredAssistanceLevel
  let assistanceLimitingReason: string | undefined

  if (!modeAllowed) {
    availableAssistanceLevel = 'L0'
    assistanceLimitingReason = `Not offered in ${OPERATIONAL_MODE_LABELS[snapshot.operationalMode]}.`
  } else if (limitingFactors.length > 0) {
    availableAssistanceLevel = minAssistanceLevel(fn.configuredAssistanceLevel, 'L1')
    assistanceLimitingReason = `Outside operational envelope: ${limitingFactors.map((f) => f.label).join(', ')}.`
  } else if (nearLimitFactors.length > 0) {
    availableAssistanceLevel = minAssistanceLevel(fn.configuredAssistanceLevel, 'L2')
    assistanceLimitingReason = `Near envelope limit: ${nearLimitFactors.map((f) => f.label).join(', ')} — extra human oversight required.`
  }

  return {
    functionId: fn.id,
    functionLabel: fn.label,
    status,
    limitingFactors,
    nearLimitFactors,
    parameters,
    availableAssistanceLevel,
    configuredAssistanceLevel: fn.configuredAssistanceLevel,
    assistanceLimitingReason,
  }
}

export function assessAllOdd(snapshot: VesselSnapshot): OddAssessment[] {
  return ASSISTED_FUNCTIONS.map((fn) => assessOdd(fn.id, snapshot))
}
