import type { AssistanceLevel, HazardCategory, OddAssessment, OddParameterStatus, OddStatus, VesselSnapshot } from '@ave/core-domain/types'
import { assistanceLevelRank, OPERATIONAL_MODE_LABELS } from '@ave/core-domain/types'
import { ASSISTED_FUNCTIONS, getAssistedFunction } from './oddFunctions'
import { clamp } from '@ave/core-domain/utils/random'

const NEAR_LIMIT_FRACTION = 0.25

function classify(rawMargin: number): { status: OddStatus; marginFraction: number } {
  // A value exactly AT a stated limit satisfies the stated predicate: the UI renders
  // "Requires >= 2 nm", so visibility of exactly 2.0 nm must not be reported as a violation
  // of the constraint it literally meets. Strictly below zero is outside; zero is the
  // boundary case and classifies as near_limit.
  if (rawMargin < 0) return { status: 'outside', marginFraction: 0 }
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

/**
 * @param activeHazardCategories Categories with at least one currently open, intolerable-band
 * (RI 8-11) hazard — see `decision-engine/hazardLifecycle.ts#activeIntolerableHazardCategories`.
 * Defaults to none so every existing caller (and every existing test) is unaffected until it
 * opts in by passing the vessel's actual hazard register.
 */
export function assessOdd(functionId: string, snapshot: VesselSnapshot, activeHazardCategories: HazardCategory[] = []): OddAssessment {
  const fn = getAssistedFunction(functionId)
  const sensorConfidence = relevantSensorConfidence(fn, snapshot)
  const modeAllowed = fn.allowedModes.includes(snapshot.operationalMode)
  const hazardActive = fn.hazardSensitiveCategories.some((category) => activeHazardCategories.includes(category))

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
    {
      key: 'safetyHazard',
      label: 'Active Safety Hazard',
      value: hazardActive ? 'Intolerable hazard open in a sensitive category' : 'None',
      ...classify(hazardActive ? -1 : 1),
      detail: hazardActive
        ? `An open, intolerable-band (RI 8-11) hazard in a category this function is sensitive to (${fn.hazardSensitiveCategories.join(', ')}) constrains assistance until resolved.`
        : fn.hazardSensitiveCategories.length > 0
          ? `No open intolerable hazard in a category this function is sensitive to (${fn.hazardSensitiveCategories.join(', ')}).`
          : 'This function declares no hazard-category sensitivity.',
    },
  ]

  const limitingFactors = parameters.filter((p) => p.status === 'outside')
  const nearLimitFactors = parameters.filter((p) => p.status === 'near_limit')

  const status: OddStatus = limitingFactors.length > 0 ? 'outside' : nearLimitFactors.length > 0 ? 'near_limit' : 'inside'

  // The declared ceiling is enforced here, not merely documented. `maxAssistanceLevel` is
  // specified as "may never exceed, regardless of conditions", so it clamps the configured
  // level before any condition-based reduction is applied.
  let availableAssistanceLevel: AssistanceLevel = minAssistanceLevel(fn.configuredAssistanceLevel, fn.maxAssistanceLevel)
  let assistanceLimitingReason: string | undefined
  if (assistanceLevelRank(fn.configuredAssistanceLevel) > assistanceLevelRank(fn.maxAssistanceLevel)) {
    assistanceLimitingReason = `Configured level ${fn.configuredAssistanceLevel} exceeds the declared ceiling ${fn.maxAssistanceLevel} for this function — clamped to the ceiling.`
  }

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
    maxAssistanceLevel: fn.maxAssistanceLevel,
    requiredSourceAreas: fn.requiredSourceAreas,
    status,
    limitingFactors,
    nearLimitFactors,
    parameters,
    availableAssistanceLevel,
    configuredAssistanceLevel: fn.configuredAssistanceLevel,
    assistanceLimitingReason,
  }
}

export function assessAllOdd(snapshot: VesselSnapshot, activeHazardCategories: HazardCategory[] = []): OddAssessment[] {
  return ASSISTED_FUNCTIONS.map((fn) => assessOdd(fn.id, snapshot, activeHazardCategories))
}

/**
 * `shore_sync_assistance` is configured at L1 (a shore-side monitoring function, not a vessel
 * safety-relevant one) while every other function is L2 or L3 — including it in a vessel-wide
 * minimum pins that minimum at L1 permanently, regardless of actual conditions, which is exactly
 * the defect where the ribbon's "Assistance Level" stat never visibly moves. Excluded here.
 */
const VESSEL_SAFETY_RELEVANT_FUNCTION_IDS = ['nav_collision_advisory', 'voyage_speed_optimisation', 'machinery_anomaly_detection', 'predictive_maintenance', 'reefer_monitoring']

export interface VesselAssistanceLevelSummary {
  level: AssistanceLevel
  /** The function currently pulling the summary below L3, if any — named so the ribbon can show
   * *why*, not just the number. */
  constrainingFunctionLabel?: string
  /**
   * True when the constraint is an open, intolerable-band safety hazard rather than an
   * environmental/sensor/mode condition. An operator seeing "L1" needs to know whether that is a
   * routine envelope limit (which clears as conditions change) or a deliberately-held floor tied
   * to an open hazard (which clears only when that hazard is resolved) — collapsing both into one
   * undifferentiated "L1" would itself look like the stuck-forever defect this stat was fixed for.
   */
  constrainedByHazard?: boolean
}

/** The vessel's own assistance-level headline: the minimum available level across its safety-
 * relevant assisted functions (excluding shore-side monitoring functions), naming whichever one
 * is currently constraining it. Genuinely moves as conditions change — see oddEngine.test.ts. */
export function vesselAssistanceLevelSummary(assessments: OddAssessment[]): VesselAssistanceLevelSummary {
  const relevant = assessments.filter((a) => VESSEL_SAFETY_RELEVANT_FUNCTION_IDS.includes(a.functionId))
  let summary: VesselAssistanceLevelSummary = { level: 'L3' }
  for (const a of relevant) {
    if (assistanceLevelRank(a.availableAssistanceLevel) < assistanceLevelRank(summary.level)) {
      const hazardParam = a.parameters.find((p) => p.key === 'safetyHazard')
      summary = {
        level: a.availableAssistanceLevel,
        constrainingFunctionLabel: a.functionLabel,
        constrainedByHazard: hazardParam?.status === 'outside',
      }
    }
  }
  return summary
}
