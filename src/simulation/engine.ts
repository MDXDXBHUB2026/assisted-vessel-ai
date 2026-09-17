import type { AuditEvent, HealthLevel, Hazard, Recommendation, TargetVessel } from '@/types'
import { OPERATIONAL_MODE_LABELS } from '@/types'
import type { SimulationState } from './state'
import { clamp, mulberry32, stepTowards } from '@/utils/random'
import { advanceOwnPosition, courseToNextWaypoint, updateTargets } from './navigation'
import { computeScenarioTargets, SCENARIO_RAMP_MINUTES } from './scenarioEffects'
import { DEMO_VOYAGE_PHASES } from './demoVoyage'
import { recomputeSystemHealth } from './health'
import { buildDesiredAlarms, mergeAlarms } from './alarms'
import { pushSample } from './telemetryHistory'
import { validateRecommendation } from '@/safety-engine/validate'
import { assessAllOdd } from '@/safety-engine/oddEngine'
import { analyseMainEngine } from '@/decision-engine/machineryAnalytics'
import {
  collisionRiskRecommendation,
  engineDegradationRecommendation,
  fuelConsumptionRecommendation,
  gnssDegradationRecommendation,
  reeferExcursionRecommendation,
  safetyEventRecommendation,
  type RecommendationContent,
} from '@/decision-engine/builders'
import { CAUTION_BAND_MULTIPLIER } from '@/decision-engine/targetRisk'

const REEFER_EXCURSION_INDEX = 3

/** Bounds on session-lifetime collections. Unbounded growth is a slow leak in a long demo run. */
const MAX_AUDIT_EVENTS = 2000
const MAX_RECOMMENDATIONS = 200
/** A recommendation left undecided for this long in simulated time is expired, not silently kept. */
const RECOMMENDATION_EXPIRY_MINUTES = 240

export function tick(prev: SimulationState, dtMinutesBase: number): SimulationState {
  const dtMinutes = dtMinutesBase * prev.speedMultiplier
  // Seed from a monotonic tick counter, not from scenarioElapsedMinutes. The latter decays to a
  // constant 0 in normal operations, which reused one seed forever and turned the "random walk"
  // into a fixed per-tick bias. Determinism is preserved: the same tick index yields the same draw.
  const tickCount = prev.tickCount + 1
  const rng = mulberry32(Math.floor(prev.seed + tickCount))

  let idCounter = prev.nextIdCounter
  const nextId = (prefix: string) => {
    idCounter += 1
    return `${prefix}-${String(idCounter).padStart(6, '0')}`
  }

  const newAuditEvents: AuditEvent[] = []
  const pushAudit = (partial: Omit<AuditEvent, 'id' | 'timestampIso' | 'operatingMode' | 'scenarioId'>) => {
    newAuditEvents.push({
      id: nextId('AUD'),
      timestampIso: prev.snapshot.simTimeIso,
      operatingMode: OPERATIONAL_MODE_LABELS[prev.snapshot.operationalMode],
      scenarioId: prev.activeScenario === 'normal_operations' ? null : prev.activeScenario,
      ...partial,
    })
  }

  // --- scenario severity ---
  const scenarioElapsedMinutes = prev.activeScenario === 'normal_operations' ? Math.max(0, prev.scenarioElapsedMinutes - dtMinutes * 2) : prev.scenarioElapsedMinutes + dtMinutes
  const ramp = SCENARIO_RAMP_MINUTES[prev.activeScenario]
  const severity = prev.activeScenario === 'normal_operations' ? 0 : clamp(scenarioElapsedMinutes / ramp, 0, 1)
  const targets = computeScenarioTargets(prev.activeScenario, severity)

  // --- navigation / position ---
  const distanceRemainingNm = Math.max(0, prev.voyagePlan.distanceRemainingNm - prev.snapshot.navigation.speedOverGroundKn * (dtMinutes / 60))
  const heading = courseToNextWaypoint(prev.snapshot.navigation.position, distanceRemainingNm)
  // Anchor to the recommended cruising speed unless the Master has explicitly authorised a
  // different speed. Anchoring to the previous tick's own resulting speed here would remove
  // all mean reversion (target === current every tick) and let the random-walk noise term
  // accumulate into unbounded drift over a long-running session.
  const commandedSpeed = prev.voyagePlan.userModifiedSpeedKn ?? prev.voyagePlan.recommendedSpeedKn
  const speedOverGroundKn = stepTowards(prev.snapshot.navigation.speedOverGroundKn, commandedSpeed, 0.05, 0.2, rng)
  const position = advanceOwnPosition(prev.snapshot.navigation.position, heading, speedOverGroundKn, dtMinutes)

  const gnssConfidence = clamp(stepTowards(prev.snapshot.navigation.gnssConfidence, targets.gnssConfidence, 0.6, 0.08, rng), 0, 100)
  const gnssAvailable = gnssConfidence > 22
  const gnssDegraded = prev.activeScenario === 'gnss_sensor_degradation' && severity > 0.15

  // --- main engine ---
  const exhaustTempDeviationC = Math.max(0, stepTowards(prev.snapshot.mainEngine.exhaustTempDeviationC, targets.exhaustTempDeviationC, 0.5, 0.06, rng))
  const lubOilPressureBar = clamp(stepTowards(prev.snapshot.mainEngine.lubOilPressureBar, targets.lubOilPressureBar, 0.03, 0.06, rng), 1.5, 5)

  // Per-cylinder exhaust deviations: natural small inter-cylinder variance, plus — during engine
  // degradation — a localised extra drift on one unit, producing a genuinely widening spread
  // (a distinct multivariate signal from the fleet-average deviation above).
  const CYLINDER_OFFSETS = [0, -0.2, 0.15, -0.15, 0.2, -0.05]
  const LOCALISED_CYLINDER_INDEX = 2
  const localisedExtra = prev.activeScenario === 'engine_degradation' ? severity * 16 : 0
  const cylinderExhaustDeviationsC = prev.snapshot.mainEngine.cylinderExhaustDeviationsC.map((prevVal, i) => {
    const target = targets.exhaustTempDeviationC + (CYLINDER_OFFSETS[i] ?? 0) + (i === LOCALISED_CYLINDER_INDEX ? localisedExtra : 0)
    return Math.max(0, stepTowards(prevVal, target, 0.4, 0.08, rng))
  })

  const rpm = clamp(stepTowards(prev.snapshot.mainEngine.rpm, 84, 0.3, 0.1, rng), 70, 95)
  const loadPercent = clamp(stepTowards(prev.snapshot.mainEngine.loadPercent, 72 + severity * (prev.activeScenario === 'engine_degradation' ? 8 : 0), 0.5, 0.1, rng), 50, 95)

  // --- environment ---
  const windSpeedKn = clamp(stepTowards(prev.snapshot.environment.windSpeedKn, targets.windSpeedKn, 0.6, 0.05, rng), 0, 70)
  const waveHeightM = clamp(stepTowards(prev.snapshot.environment.waveHeightM, targets.waveHeightM, 0.1, 0.05, rng), 0, 10)
  const seaState = clamp(stepTowards(prev.snapshot.environment.seaState, targets.seaState, 0.15, 0.05, rng), 0, 9)
  const visibilityNm = clamp(stepTowards(prev.snapshot.environment.visibilityNm, targets.visibilityNm, 0.3, 0.05, rng), 0.2, 12)
  const trafficDensity: 'low' | 'moderate' | 'high' = prev.snapshot.operationalMode === 'open_sea' ? 'low' : prev.snapshot.operationalMode === 'coastal' ? 'moderate' : 'high'

  // --- comms ---
  const satelliteConfidence = clamp(stepTowards(prev.snapshot.communications.satelliteConfidence, targets.satelliteConfidence, 0.7, 0.08, rng), 0, 100)
  const commsDegraded = prev.activeScenario === 'communication_loss' && severity > 0.15
  const satelliteLinkUp = satelliteConfidence > 18
  const shoreSyncLatencySec = clamp(stepTowards(prev.snapshot.communications.shoreSyncLatencySec, satelliteLinkUp ? 2.1 : 45, 1.5, 0.15, rng), 1, 90)

  // --- fuel / energy ---
  const baselineConsumption = prev.snapshot.fuelEnergy.baselineConsumptionRateTonPerDay
  const fuelTarget = baselineConsumption * targets.fuelConsumptionMultiplier
  const fuelConsumptionRateTonPerDay = clamp(stepTowards(prev.snapshot.fuelEnergy.fuelConsumptionRateTonPerDay, fuelTarget, 0.8, 0.1, rng), 60, 260)
  const fuelRemainingTons = Math.max(0, prev.snapshot.fuelEnergy.fuelRemainingTons - fuelConsumptionRateTonPerDay * (dtMinutes / 1440))
  const co2EmissionRateTonPerDay = fuelConsumptionRateTonPerDay * 3.114

  // --- electrical ---
  const blackoutRiskScore = clamp(stepTowards(prev.snapshot.electricalPower.blackoutRiskScore, targets.blackoutRiskScore, 1.2, 0.08, rng), 0, 100)

  // --- cargo / reefer ---
  let reeferExcursionRef: string | null = null
  const reeferUnits = prev.snapshot.cargoReefer.reeferUnits.map((unit, index) => {
    if (index === REEFER_EXCURSION_INDEX && prev.activeScenario === 'reefer_excursion') {
      reeferExcursionRef = unit.containerRef
      const target = unit.setPointC + targets.reeferDeviationC
      const actualTempC = stepTowards(unit.actualTempC, target, 0.15, 0.08, rng)
      const deviation = Math.abs(actualTempC - unit.setPointC)
      const risk: HealthLevel = deviation > 4 ? 'critical' : deviation > 2 ? 'warning' : deviation > 0.8 ? 'advisory' : 'healthy'
      const ambientTempC = stepTowards(unit.ambientTempC, 29, 0.3, 0.1, rng)
      return {
        ...unit,
        actualTempC,
        returnTempC: actualTempC + 1.8 + deviation * 0.4,
        ambientTempC,
        trend: actualTempC > unit.setPointC + 0.3 ? ('rising' as const) : actualTempC < unit.setPointC - 0.3 ? ('falling' as const) : ('stable' as const),
        powerStatus: deviation > 3 ? ('power_fluctuation' as const) : ('on_power' as const),
        alarmCount: deviation > 0.8 ? unit.alarmCount + (rng() > 0.7 ? 1 : 0) : unit.alarmCount,
        risk,
      }
    }
    const actualTempC = stepTowards(unit.actualTempC, unit.setPointC, 0.05, 0.15, rng)
    const ambientTempC = stepTowards(unit.ambientTempC, 29, 0.3, 0.1, rng)
    return { ...unit, actualTempC, returnTempC: actualTempC + 1.8, ambientTempC, trend: 'stable' as const, risk: 'healthy' as const }
  })

  // --- targets (other vessels) ---
  const targetVessels = updateTargets({
    targets: prev.targets,
    ownPosition: position,
    ownHeading: heading,
    ownSpeedKn: speedOverGroundKn,
    collisionScenarioActive: prev.activeScenario === 'collision_risk',
    severity,
    dtMinutes,
    riskLimits: prev.targetRiskLimits,
  })
  const collisionHighRisk = targetVessels.some((t) => t.relativeRisk === 'high')
  // Rank by relativeRisk severity first, not raw CPA: a target with a tiny historical CPA that has
  // already opened (negative TCPA) classifies 'low' and must not outrank a genuinely closing target
  // with a larger but still-converging CPA — sorting on cpaNm alone previously let it do exactly that.
  const relativeRiskRank: Record<TargetVessel['relativeRisk'], number> = { high: 2, medium: 1, low: 0 }
  const riskiestTarget = [...targetVessels].sort((a, b) => relativeRiskRank[b.relativeRisk] - relativeRiskRank[a.relativeRisk] || a.cpaNm - b.cpaNm)[0]

  // --- assemble snapshot ---
  const simTimeIso = new Date(new Date(prev.snapshot.simTimeIso).getTime() + dtMinutes * 60_000).toISOString()
  const simTimeMs = new Date(simTimeIso).getTime()

  const snapshotDraft = {
    ...prev.snapshot,
    simTimeIso,
    navigation: {
      ...prev.snapshot.navigation,
      position,
      heading,
      courseOverGround: heading,
      speedOverGroundKn,
      speedThroughWaterKn: speedOverGroundKn * 0.98,
      gnssAvailable,
      gnssConfidence,
    },
    mainEngine: {
      ...prev.snapshot.mainEngine,
      rpm,
      loadPercent,
      exhaustTempDeviationC,
      exhaustTempAvgC: 369 + exhaustTempDeviationC,
      cylinderExhaustDeviationsC,
      lubOilPressureBar,
      runningHours: prev.snapshot.mainEngine.runningHours + dtMinutes / 60,
    },
    electricalPower: {
      ...prev.snapshot.electricalPower,
      blackoutRiskScore,
    },
    fuelEnergy: {
      ...prev.snapshot.fuelEnergy,
      fuelConsumptionRateTonPerDay,
      fuelRemainingTons,
      co2EmissionRateTonPerDay,
    },
    cargoReefer: {
      ...prev.snapshot.cargoReefer,
      reeferUnits,
    },
    safetySystems: {
      ...prev.snapshot.safetySystems,
      bilgeAlarmActive: prev.activeScenario === 'safety_event' && severity > 0.3,
      watertightIntegrityOk: !(prev.activeScenario === 'safety_event' && severity > 0.6),
    },
    communications: {
      ...prev.snapshot.communications,
      satelliteLinkUp,
      satelliteConfidence,
      shoreSyncLatencySec,
      lastShoreSyncIso: satelliteLinkUp ? simTimeIso : prev.snapshot.communications.lastShoreSyncIso,
    },
    environment: {
      windSpeedKn,
      windDirectionDeg: prev.snapshot.environment.windDirectionDeg,
      waveHeightM,
      seaState: Math.round(seaState),
      visibilityNm,
      trafficDensity,
    },
  }

  // --- telemetry history (genuine time-series backing for trend/anomaly analytics) ---
  const cylinderSpreadC = Math.max(...cylinderExhaustDeviationsC) - Math.min(...cylinderExhaustDeviationsC)

  const telemetryHistoryPartial = {
    exhaustTempDeviationC: pushSample(prev.telemetryHistory.exhaustTempDeviationC, simTimeMs, exhaustTempDeviationC),
    cylinderSpreadC: pushSample(prev.telemetryHistory.cylinderSpreadC, simTimeMs, cylinderSpreadC),
    lubOilPressureBar: pushSample(prev.telemetryHistory.lubOilPressureBar, simTimeMs, lubOilPressureBar),
    fuelConsumptionRateTonPerDay: pushSample(prev.telemetryHistory.fuelConsumptionRateTonPerDay, simTimeMs, fuelConsumptionRateTonPerDay),
    gnssConfidence: pushSample(prev.telemetryHistory.gnssConfidence, simTimeMs, gnssConfidence),
    satelliteConfidence: pushSample(prev.telemetryHistory.satelliteConfidence, simTimeMs, satelliteConfidence),
    blackoutRiskScore: pushSample(prev.telemetryHistory.blackoutRiskScore, simTimeMs, blackoutRiskScore),
    rpm: pushSample(prev.telemetryHistory.rpm, simTimeMs, rpm),
    loadPercent: pushSample(prev.telemetryHistory.loadPercent, simTimeMs, loadPercent),
  }

  const machineryAnalysis = analyseMainEngine(snapshotDraft, telemetryHistoryPartial)
  const telemetryHistory = {
    ...telemetryHistoryPartial,
    anomalyScore: pushSample(prev.telemetryHistory.anomalyScore, simTimeMs, machineryAnalysis.anomalyScore),
  }

  const { systemHealth, overallHealth } = recomputeSystemHealth(snapshotDraft, machineryAnalysis, commsDegraded, gnssDegraded)
  const snapshot = { ...snapshotDraft, systemHealth, overallHealth }

  // --- audit: system state transitions ---
  for (const area of systemHealth) {
    const prevArea = prev.snapshot.systemHealth.find((s) => s.area === area.area)
    if (prevArea && prevArea.state !== area.state) {
      pushAudit({
        kind: 'system_state_change',
        event: `${area.area.replace(/_/g, ' ')} system state changed from ${prevArea.state.toUpperCase()} to ${area.state.toUpperCase()}.`,
        outcome: area.state,
      })
      if (area.state === 'fallback' && (area.area === 'communications' || area.area === 'navigation')) {
        const affected = area.area === 'communications' ? 'Shore-Assisted Support Functions become unavailable; onboard assistance continues.' : 'Navigation assistance restricts to monitoring-level pending recovery.'
        pushAudit({ kind: 'fallback_transition', event: `Fallback engaged for ${area.area.replace(/_/g, ' ')}. ${affected}`, outcome: 'fallback' })
      }
    }
  }

  // --- audit: assistance-level changes per assisted function ---
  const prevOdd = assessAllOdd(prev.snapshot)
  const currentOdd = assessAllOdd(snapshot)
  for (const current of currentOdd) {
    const before = prevOdd.find((o) => o.functionId === current.functionId)
    if (before && before.availableAssistanceLevel !== current.availableAssistanceLevel) {
      pushAudit({
        kind: 'assistance_level_change',
        event: `${current.functionLabel}: available assistance level changed from ${before.availableAssistanceLevel} to ${current.availableAssistanceLevel}.${current.assistanceLimitingReason ? ` ${current.assistanceLimitingReason}` : ''}`,
        outcome: current.availableAssistanceLevel,
      })
    }
  }

  // --- alarms ---
  const desiredAlarms = buildDesiredAlarms(prev.activeScenario, severity, reeferExcursionRef, collisionHighRisk)
  const { alarms: rawAlarms, newlyRaised } = mergeAlarms(prev.rawAlarms, desiredAlarms, simTimeIso, () => nextId('ALM'))
  for (const alarm of newlyRaised) {
    pushAudit({ kind: 'alarm', event: `Alarm raised: ${alarm.description} (${alarm.area.replace(/_/g, ' ')}).`, outcome: alarm.severity })
  }

  // --- recommendations (guarded by trigger flags so each scenario run fires once per threshold) ---
  const recommendations: Recommendation[] = [...prev.recommendations]
  const scenarioTriggers = { ...prev.scenarioTriggers }

  const maybeFire = (key: string, condition: boolean, build: () => RecommendationContent) => {
    if (condition && !scenarioTriggers[key]) {
      scenarioTriggers[key] = true
      const { functionId, ...content } = build()
      // De-duplicate: an oscillating condition (a target passing while another closes) would
      // otherwise stack near-identical cards in the decision queue. A product whose stated value
      // is reducing crew workload through correlation must not flood its own decision channel.
      const alreadyPending = recommendations.some(
        (r) => r.status === 'awaiting_decision' && r.vesselFunction === content.vesselFunction && r.title === content.title,
      )
      if (alreadyPending) return
      const oddAssessment = currentOdd.find((o) => o.functionId === functionId)
      const safetyValidation = validateRecommendation({
        functionId,
        snapshot,
        riskLevel: content.riskLevel,
        requiredAuthority: content.requiredAuthority,
      })
      const rec: Recommendation = {
        ...content,
        id: nextId('REC'),
        timestampIso: simTimeIso,
        status: 'awaiting_decision',
        safetyValidation,
        oddAssessment,
        operationalMode: snapshot.operationalMode,
        oddStatus: oddAssessment?.status ?? 'inside',
        scenarioId: prev.activeScenario,
      }
      recommendations.unshift(rec)
      pushAudit({
        kind: 'recommendation_generated',
        event: `Recommendation generated: ${rec.title}`,
        recommendationId: rec.id,
        modelOrRuleId: `${rec.modelId} ${rec.modelVersion}`,
        confidencePercent: rec.confidencePercent,
        safetyValidationResult: rec.safetyValidation.verdict,
      })
      pushAudit({
        kind: 'safety_validation',
        event: `Safety validation ${rec.safetyValidation.verdict.toUpperCase()} for ${rec.title}.`,
        recommendationId: rec.id,
        safetyValidationResult: rec.safetyValidation.verdict,
      })
    } else if (!condition && scenarioTriggers[key]) {
      scenarioTriggers[key] = false
    }
  }

  maybeFire('engine_degradation_rec', prev.activeScenario === 'engine_degradation' && severity > 0.45, () => engineDegradationRecommendation(snapshot, machineryAnalysis, severity))

  // The scripted collision_risk target continuously re-aims at a point ahead of own ship rather
  // than holding a fixed collision course, so its CPA can close to near-zero for a long time
  // before its TCPA is ever simultaneously small (see targetRisk.test.ts and engine.scenarios.test
  // for the actual behaviour) — requiring classifyTargetRisk's joint CPA-and-TCPA "dangerous"/
  // "caution" tiers here would mean this recommendation never fires in the built-in demo. The gate
  // therefore stays CPA-only (anchored to the operator's single cpaLimitNm, not an independent
  // magic number) with only a closing-sign check on TCPA, same as before this changeset.
  const collisionCpaThresholdNm = prev.targetRiskLimits.cpaLimitNm * CAUTION_BAND_MULTIPLIER
  maybeFire(
    'collision_risk_rec',
    prev.activeScenario === 'collision_risk' && riskiestTarget !== undefined && riskiestTarget.cpaNm <= collisionCpaThresholdNm && riskiestTarget.tcpaMinutes > 0,
    () => collisionRiskRecommendation(riskiestTarget!.cpaNm, riskiestTarget!.tcpaMinutes, riskiestTarget!.label, prev.targetRiskLimits),
  )

  const excursionUnit = reeferUnits[REEFER_EXCURSION_INDEX]
  maybeFire(
    'reefer_excursion_rec',
    prev.activeScenario === 'reefer_excursion' && severity > 0.4 && excursionUnit !== undefined,
    () => reeferExcursionRecommendation(excursionUnit!.containerRef, excursionUnit!.actualTempC, excursionUnit!.setPointC, excursionUnit!.cargoCategory),
  )

  maybeFire('fuel_consumption_rec', prev.activeScenario === 'excessive_fuel_consumption' && severity > 0.5, () => fuelConsumptionRecommendation(snapshot))

  maybeFire('gnss_degradation_rec', prev.activeScenario === 'gnss_sensor_degradation' && severity > 0.45, () => gnssDegradationRecommendation(gnssConfidence))

  // --- hazards ---
  const hazards: Hazard[] = [...prev.hazards]
  if (prev.activeScenario === 'safety_event' && severity > 0.3 && !scenarioTriggers['safety_hazard']) {
    scenarioTriggers['safety_hazard'] = true
    const hazard: Hazard = {
      id: nextId('HAZ'),
      title: 'Bilge High-Level Alarm — Forward Compartment',
      category: 'personnel',
      riskLevel: 'high',
      likelihood: 'possible',
      severity: 'major',
      peopleExposed: 4,
      immediateMitigation: 'Compartment isolated, bilge pump engaged, crew mustered to standby.',
      recommendedCorrectiveAction: 'Investigate source of ingress, inspect compartment, and follow SMS emergency procedure.',
      responsibleRole: 'Chief Officer',
      residualRisk: 'medium',
      status: 'open',
      raisedAtIso: simTimeIso,
    }
    hazards.unshift(hazard)
    pushAudit({ kind: 'safety_validation', event: `Safety hazard raised: ${hazard.title}`, outcome: 'open' })
    maybeFire('safety_event_rec', true, () => safetyEventRecommendation(hazard.title))
  }
  if (prev.activeScenario !== 'safety_event') {
    scenarioTriggers['safety_hazard'] = false
    // `maybeFire('safety_event_rec', true, ...)` is only ever called with condition === true, so
    // its own reset branch can never run and the flag would latch for the whole session: a second
    // safety_event raised a hazard with no recommendation, no safety validation and no audit of
    // either — a silent gap in the exact chain this demonstrator exists to show.
    scenarioTriggers['safety_event_rec'] = false
  }

  // --- voyage plan derived fields ---
  const voyagePlan = {
    ...prev.voyagePlan,
    distanceRemainingNm,
    currentSpeedKn: speedOverGroundKn,
  }

  // --- fleet mirror for shore centre ---
  const fleet = prev.fleet.map((f) => (f.vesselId === 'own' ? { ...f, riskLevel: overallHealthToRisk(overallHealth), assistanceMode: overallHealth, position: { latitude: position.latitude, longitude: position.longitude }, communicationsOk: satelliteLinkUp } : f))

  // --- own-ship historical track (for the navigation operating picture) ---
  const ownTrack = [...prev.ownTrack, position].slice(-240)

  // --- store-and-forward: queue while the shore link is down, synchronise honestly on recovery ---
  const wasLinkUp = prev.snapshot.communications.satelliteLinkUp
  let syncQueueCount = prev.syncQueueCount
  if (!satelliteLinkUp) {
    // Count the records actually queued this tick. The previous `+ 1` per tick inflated the
    // figure into the hundreds while only a handful of events had been generated.
    syncQueueCount += newAuditEvents.length + newlyRaised.length
  } else if (!wasLinkUp && satelliteLinkUp && syncQueueCount > 0) {
    pushAudit({ kind: 'fallback_transition', event: `Ship-shore link restored. Store-and-forward synchronisation delivered ${syncQueueCount} queued record(s) to shore.`, outcome: 'synchronised' })
    syncQueueCount = 0
  }

  // --- demo voyage phase sequencing ---
  let activeScenario = prev.activeScenario
  let demoVoyage = prev.demoVoyage
  let finalScenarioElapsedMinutes = scenarioElapsedMinutes
  let finalScenarioTriggers = scenarioTriggers
  if (prev.demoVoyage.active) {
    const phaseElapsedMinutes = prev.demoVoyage.phaseElapsedMinutes + dtMinutes
    const currentPhase = DEMO_VOYAGE_PHASES[prev.demoVoyage.phaseIndex]
    if (currentPhase && phaseElapsedMinutes >= currentPhase.durationMinutes) {
      const nextIndex = prev.demoVoyage.phaseIndex + 1
      const nextPhase = DEMO_VOYAGE_PHASES[nextIndex]
      if (nextPhase) {
        activeScenario = nextPhase.scenario
        finalScenarioElapsedMinutes = 0
        finalScenarioTriggers = {}
        demoVoyage = { active: true, phaseIndex: nextIndex, phaseElapsedMinutes: 0 }
        pushAudit({ kind: 'scenario', event: `Demo Voyage phase advanced: "${nextPhase.title}" (scenario: ${nextPhase.scenario.replace(/_/g, ' ')}).`, outcome: 'phase_advanced' })
      } else {
        demoVoyage = { active: false, phaseIndex: prev.demoVoyage.phaseIndex, phaseElapsedMinutes }
        pushAudit({ kind: 'scenario', event: 'Demo Voyage complete. Review the audit trail and operational value for this session.', outcome: 'complete' })
      }
    } else {
      demoVoyage = { ...prev.demoVoyage, phaseElapsedMinutes }
    }
  }

  // --- re-validate undecided recommendations against the current state -----------------------
  // A safety verdict computed once at generation time goes stale silently: the vessel changes
  // mode, GNSS degrades, the envelope closes — and the card still shows the verdict and the
  // check-list from when it was raised. Re-validating each tick keeps the displayed verdict
  // truthful, and an audit event is written whenever a verdict actually changes.
  const nowMs = new Date(simTimeIso).getTime()
  const revalidated = recommendations.map((rec) => {
    if (rec.status !== 'awaiting_decision') return rec

    const ageMinutes = (nowMs - new Date(rec.timestampIso).getTime()) / 60_000
    if (ageMinutes > RECOMMENDATION_EXPIRY_MINUTES) {
      pushAudit({
        kind: 'human_decision',
        event: `Recommendation "${rec.title}" expired without a human decision after ${RECOMMENDATION_EXPIRY_MINUTES} simulated minutes.`,
        recommendationId: rec.id,
        outcome: 'expired',
      })
      return { ...rec, status: 'expired' as const, outcome: 'Expired without a human decision.' }
    }

    const fnId = rec.oddAssessment?.functionId
    if (!fnId) return rec
    const fresh = validateRecommendation({
      functionId: fnId,
      snapshot,
      riskLevel: rec.riskLevel,
      requiredAuthority: rec.requiredAuthority,
    })
    if (fresh.verdict === rec.safetyValidation.verdict) return rec

    pushAudit({
      kind: 'safety_validation',
      event: `Safety validation re-assessed for "${rec.title}": ${rec.safetyValidation.verdict.toUpperCase()} -> ${fresh.verdict.toUpperCase()} as operating conditions changed.`,
      recommendationId: rec.id,
      safetyValidationResult: fresh.verdict,
    })
    const freshOdd = currentOdd.find((o) => o.functionId === fnId)
    return { ...rec, safetyValidation: fresh, oddAssessment: freshOdd, oddStatus: freshOdd?.status ?? rec.oddStatus }
  })

  return {
    ...prev,
    snapshot,
    targets: targetVessels,
    hazards,
    rawAlarms,
    recommendations: revalidated.slice(0, MAX_RECOMMENDATIONS),
    // toReversed() rather than reverse(): the latter mutates newAuditEvents in place, which is
    // surprising for any code reading it after this point. Capped to bound session memory.
    auditEvents: [...[...newAuditEvents].reverse(), ...prev.auditEvents].slice(0, MAX_AUDIT_EVENTS),
    fleet,
    voyagePlan,
    activeScenario,
    scenarioElapsedMinutes: finalScenarioElapsedMinutes,
    scenarioTriggers: finalScenarioTriggers,
    nextIdCounter: idCounter,
    tickCount,
    telemetryHistory,
    machineryAnalysis,
    ownTrack,
    syncQueueCount,
    demoVoyage,
  }
}

function overallHealthToRisk(health: HealthLevel): 'low' | 'medium' | 'high' | 'severe' {
  if (health === 'critical') return 'high'
  if (health === 'warning') return 'medium'
  return 'low'
}
