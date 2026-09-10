import type { AuditEvent, HealthLevel, Hazard, Recommendation } from '@/types'
import { OPERATIONAL_MODE_LABELS } from '@/types'
import type { SimulationState } from './state'
import { clamp, mulberry32, stepTowards } from '@/utils/random'
import { advanceOwnPosition, courseToNextWaypoint, updateTargets } from './navigation'
import { computeScenarioTargets, SCENARIO_RAMP_MINUTES } from './scenarioEffects'
import { recomputeSystemHealth } from './health'
import { buildDesiredAlarms, mergeAlarms } from './alarms'
import { validateRecommendation } from '@/safety-engine/validate'
import {
  collisionRiskRecommendation,
  engineDegradationRecommendation,
  fuelConsumptionRecommendation,
  gnssDegradationRecommendation,
  reeferExcursionRecommendation,
  safetyEventRecommendation,
  type RecommendationContent,
} from '@/decision-engine/builders'

const REEFER_EXCURSION_INDEX = 3

export function tick(prev: SimulationState, dtMinutesBase: number): SimulationState {
  const dtMinutes = dtMinutesBase * prev.speedMultiplier
  const rng = mulberry32(Math.floor(prev.seed + prev.scenarioElapsedMinutes * 1000 + 1))

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
  const commandedSpeed = prev.voyagePlan.userModifiedSpeedKn ?? prev.voyagePlan.currentSpeedKn
  const speedOverGroundKn = stepTowards(prev.snapshot.navigation.speedOverGroundKn, commandedSpeed, 0.05, 0.2, rng)
  const position = advanceOwnPosition(prev.snapshot.navigation.position, heading, speedOverGroundKn, dtMinutes)

  const gnssConfidence = clamp(stepTowards(prev.snapshot.navigation.gnssConfidence, targets.gnssConfidence, 0.6, 0.08, rng), 0, 100)
  const gnssAvailable = gnssConfidence > 22
  const gnssDegraded = prev.activeScenario === 'gnss_sensor_degradation' && severity > 0.15

  // --- main engine ---
  const exhaustTempDeviationC = Math.max(0, stepTowards(prev.snapshot.mainEngine.exhaustTempDeviationC, targets.exhaustTempDeviationC, 0.5, 0.06, rng))
  const lubOilPressureBar = clamp(stepTowards(prev.snapshot.mainEngine.lubOilPressureBar, targets.lubOilPressureBar, 0.03, 0.06, rng), 1.5, 5)

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
      return {
        ...unit,
        actualTempC,
        trend: actualTempC > unit.setPointC + 0.3 ? ('rising' as const) : actualTempC < unit.setPointC - 0.3 ? ('falling' as const) : ('stable' as const),
        powerStatus: deviation > 3 ? ('power_fluctuation' as const) : ('on_power' as const),
        alarmCount: deviation > 0.8 ? unit.alarmCount + (rng() > 0.7 ? 1 : 0) : unit.alarmCount,
        risk,
      }
    }
    const actualTempC = stepTowards(unit.actualTempC, unit.setPointC, 0.05, 0.15, rng)
    return { ...unit, actualTempC, trend: 'stable' as const, risk: 'healthy' as const }
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
  })
  const collisionHighRisk = targetVessels.some((t) => t.relativeRisk === 'high')
  const riskiestTarget = [...targetVessels].sort((a, b) => a.cpaNm - b.cpaNm)[0]

  // --- assemble snapshot ---
  const simTimeIso = new Date(new Date(prev.snapshot.simTimeIso).getTime() + dtMinutes * 60_000).toISOString()

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
      exhaustTempDeviationC,
      exhaustTempAvgC: 369 + exhaustTempDeviationC,
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

  const { systemHealth, overallHealth } = recomputeSystemHealth(snapshotDraft, commsDegraded, gnssDegraded)
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
        scenarioId: prev.activeScenario,
      }
      recommendations.unshift(rec)
      pushAudit({
        kind: 'recommendation_generated',
        event: `Recommendation generated: ${rec.title}`,
        recommendationId: rec.id,
        modelOrRuleId: rec.modelId,
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

  maybeFire('engine_degradation_rec', prev.activeScenario === 'engine_degradation' && severity > 0.45, () => engineDegradationRecommendation(snapshot, severity))

  maybeFire(
    'collision_risk_rec',
    prev.activeScenario === 'collision_risk' && riskiestTarget !== undefined && riskiestTarget.cpaNm < 2.2 && riskiestTarget.tcpaMinutes > 0,
    () => collisionRiskRecommendation(riskiestTarget!.cpaNm, riskiestTarget!.tcpaMinutes, riskiestTarget!.label),
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
  }

  // --- voyage plan derived fields ---
  const voyagePlan = {
    ...prev.voyagePlan,
    distanceRemainingNm,
    currentSpeedKn: speedOverGroundKn,
  }

  // --- fleet mirror for shore centre ---
  const fleet = prev.fleet.map((f) => (f.vesselId === 'own' ? { ...f, riskLevel: overallHealthToRisk(overallHealth), assistanceMode: overallHealth, position: { latitude: position.latitude, longitude: position.longitude }, communicationsOk: satelliteLinkUp } : f))

  return {
    ...prev,
    snapshot,
    targets: targetVessels,
    hazards,
    rawAlarms,
    recommendations,
    auditEvents: [...newAuditEvents.reverse(), ...prev.auditEvents],
    fleet,
    voyagePlan,
    scenarioElapsedMinutes,
    scenarioTriggers,
    nextIdCounter: idCounter,
  }
}

function overallHealthToRisk(health: HealthLevel): 'low' | 'medium' | 'high' | 'severe' {
  if (health === 'critical') return 'high'
  if (health === 'warning') return 'medium'
  return 'low'
}
