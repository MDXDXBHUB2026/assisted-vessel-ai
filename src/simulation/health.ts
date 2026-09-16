import type { HealthLevel, MeasuredStatus, SystemHealthSummary, SystemState, VesselSnapshot } from '@/types'
import { worstHealth } from '@/types'
import { clamp } from '@/utils/random'
import type { MachineryAnalysis } from '@/decision-engine/machineryAnalytics'

function levelFromScore(score: number): HealthLevel {
  if (score >= 85) return 'healthy'
  if (score >= 65) return 'advisory'
  if (score >= 40) return 'warning'
  return 'critical'
}

/**
 * Availability describes whether an area's *source data* is usable, independent of what that
 * data says. It is deliberately NOT derived from any analytical confidence or health score: a
 * condition-monitoring model becomes more confident as a fault develops, so using model
 * confidence as an availability signal inverts the meaning and lets a badly degraded system
 * report maximum "availability" precisely when it is worst. The safety engine gates on this.
 */
function availabilityStatusFrom(percent: number): MeasuredStatus {
  if (percent >= 85) return 'ok'
  if (percent >= 50) return 'degraded'
  if (percent > 0) return 'stale'
  return 'unavailable'
}

export function recomputeSystemHealth(
  snapshot: VesselSnapshot,
  machineryAnalysis: MachineryAnalysis,
  commsDegraded: boolean,
  gnssDegraded: boolean,
): { systemHealth: SystemHealthSummary[]; overallHealth: HealthLevel } {
  const engineHealth = levelFromScore(machineryAnalysis.healthScore)
  const engineState: SystemState = machineryAnalysis.anomalyScore > 65 ? 'contingency' : machineryAnalysis.anomalyScore > 35 ? 'degraded' : 'normal'

  const navConfidence = snapshot.navigation.gnssConfidence
  const navHealth: HealthLevel = gnssDegraded ? (navConfidence < 40 ? 'critical' : navConfidence < 65 ? 'warning' : 'advisory') : 'healthy'
  const navState: SystemState = gnssDegraded ? (navConfidence < 40 ? 'fallback' : 'degraded') : 'normal'

  const reeferRisks = snapshot.cargoReefer.reeferUnits.map((u) => u.risk)
  const cargoHealth = worstHealth(reeferRisks)
  const cargoState: SystemState = cargoHealth === 'critical' ? 'contingency' : cargoHealth === 'warning' ? 'degraded' : 'normal'

  const commsHealth: HealthLevel = commsDegraded ? (snapshot.communications.satelliteConfidence < 30 ? 'critical' : 'warning') : 'healthy'
  const commsState: SystemState = commsDegraded ? (snapshot.communications.satelliteLinkUp ? 'degraded' : 'fallback') : 'normal'

  const electricalHealth: HealthLevel = snapshot.electricalPower.blackoutRiskScore > 60 ? 'critical' : snapshot.electricalPower.blackoutRiskScore > 30 ? 'warning' : snapshot.electricalPower.blackoutRiskScore > 15 ? 'advisory' : 'healthy'

  const fuelExcess = ((snapshot.fuelEnergy.fuelConsumptionRateTonPerDay - snapshot.fuelEnergy.baselineConsumptionRateTonPerDay) / snapshot.fuelEnergy.baselineConsumptionRateTonPerDay) * 100
  const fuelHealth: HealthLevel = fuelExcess > 25 ? 'warning' : fuelExcess > 12 ? 'advisory' : 'healthy'

  const safetyHealth: HealthLevel = !snapshot.safetySystems.watertightIntegrityOk || snapshot.safetySystems.bilgeAlarmActive ? 'critical' : 'healthy'

  // Auxiliary machinery health is derived from its own health score rather than hardcoded, so a
  // degraded auxiliary plant can actually be reported (and can reach `overallHealth`).
  const auxHealth = levelFromScore(snapshot.auxMachinery.auxEngineHealthScore)
  const auxState: SystemState = auxHealth === 'critical' ? 'contingency' : auxHealth === 'warning' ? 'degraded' : 'normal'

  // --- source-data availability, derived from sensor/feed liveness only ---------------------

  // Navigation: how many of the three position/traffic feeds are up, scaled by GNSS integrity.
  const navFeedsUp = [snapshot.navigation.gnssAvailable, snapshot.navigation.radarAvailable, snapshot.navigation.aisAvailable].filter(Boolean).length
  const navAvailability = clamp((navFeedsUp / 3) * 100 * (snapshot.navigation.gnssAvailable ? clamp(navConfidence / 100, 0.4, 1) : 0.5), 0, 100)

  // Machinery: telemetry channels reporting plausible values. A reading that is out of physical
  // range is treated as an unusable sensor, not as an extreme-but-valid measurement.
  const cylinderReadings = snapshot.mainEngine.cylinderExhaustDeviationsC
  const cylindersPlausible = cylinderReadings.filter((v) => Number.isFinite(v) && v >= 0 && v < 200).length
  const lubOilPlausible = Number.isFinite(snapshot.mainEngine.lubOilPressureBar) && snapshot.mainEngine.lubOilPressureBar > 0
  const engineAvailability = cylinderReadings.length === 0
    ? 0
    : clamp((cylindersPlausible / cylinderReadings.length) * 100 * (lubOilPlausible ? 1 : 0.5), 0, 100)

  // Communications: the shore link itself.
  const commsAvailability = snapshot.communications.satelliteLinkUp ? clamp(snapshot.communications.satelliteConfidence, 0, 100) : 0

  // Reefers: units still reporting on power. A unit in power fluctuation is a degraded feed.
  const reeferUnits = snapshot.cargoReefer.reeferUnits
  const reefersReporting = reeferUnits.filter((u) => u.powerStatus === 'on_power').length
  const cargoAvailability = reeferUnits.length === 0 ? 0 : clamp((reefersReporting / reeferUnits.length) * 100, 0, 100)

  const auxAvailability = Number.isFinite(snapshot.auxMachinery.auxEngineHealthScore) ? 98 : 0
  const electricalAvailability = Number.isFinite(snapshot.electricalPower.blackoutRiskScore) ? 97 : 0
  const fuelAvailability = Number.isFinite(snapshot.fuelEnergy.fuelConsumptionRateTonPerDay) ? 96 : 0
  const safetyAvailability = 99

  const systemHealth: SystemHealthSummary[] = [
    {
      area: 'navigation',
      health: navHealth,
      state: navState,
      headline: gnssDegraded ? `GNSS confidence reduced to ${navConfidence.toFixed(0)}%` : 'All navigation sensors nominal',
      confidence: Math.round(navConfidence),
      dataAvailabilityPercent: Math.round(navAvailability),
      availabilityStatus: availabilityStatusFrom(navAvailability),
    },
    {
      area: 'main_engine',
      health: engineHealth,
      state: engineState,
      headline: machineryAnalysis.probableCondition,
      confidence: machineryAnalysis.confidencePercent,
      dataAvailabilityPercent: Math.round(engineAvailability),
      availabilityStatus: availabilityStatusFrom(engineAvailability),
    },
    {
      area: 'auxiliary_machinery',
      health: auxHealth,
      state: auxState,
      headline: auxHealth === 'healthy' ? 'Auxiliary machinery nominal' : `Auxiliary plant health score ${snapshot.auxMachinery.auxEngineHealthScore.toFixed(0)}`,
      confidence: snapshot.auxMachinery.auxEngineHealthScore,
      dataAvailabilityPercent: Math.round(auxAvailability),
      availabilityStatus: availabilityStatusFrom(auxAvailability),
    },
    {
      area: 'electrical_power',
      health: electricalHealth,
      state: electricalHealth === 'critical' ? 'contingency' : electricalHealth === 'warning' ? 'degraded' : 'normal',
      headline: electricalHealth === 'healthy' ? 'Power generation stable, healthy reserve' : `Elevated blackout risk score (${snapshot.electricalPower.blackoutRiskScore.toFixed(0)})`,
      confidence: 95,
      dataAvailabilityPercent: Math.round(electricalAvailability),
      availabilityStatus: availabilityStatusFrom(electricalAvailability),
    },
    {
      area: 'fuel_energy',
      health: fuelHealth,
      state: fuelHealth === 'warning' ? 'degraded' : 'normal',
      headline: fuelHealth === 'healthy' ? 'Fuel consumption tracking baseline' : `Consumption ${fuelExcess.toFixed(0)}% above baseline`,
      confidence: 92,
      dataAvailabilityPercent: Math.round(fuelAvailability),
      availabilityStatus: availabilityStatusFrom(fuelAvailability),
    },
    {
      area: 'cargo_reefer',
      health: cargoHealth,
      state: cargoState,
      headline: cargoHealth === 'healthy' ? 'All reefer units within set point' : 'One or more reefer units outside set point',
      confidence: 96,
      dataAvailabilityPercent: Math.round(cargoAvailability),
      availabilityStatus: availabilityStatusFrom(cargoAvailability),
    },
    {
      area: 'safety',
      health: safetyHealth,
      state: safetyHealth === 'critical' ? 'contingency' : 'normal',
      headline: safetyHealth === 'healthy' ? 'Safety systems ready' : 'Active safety condition requires attention',
      confidence: 98,
      dataAvailabilityPercent: safetyAvailability,
      availabilityStatus: availabilityStatusFrom(safetyAvailability),
    },
    {
      area: 'communications',
      health: commsHealth,
      state: commsState,
      headline: commsDegraded ? 'Ship-shore link degraded — fallback mode active' : 'Satellite and VHF links nominal',
      confidence: Math.round(snapshot.communications.satelliteConfidence),
      dataAvailabilityPercent: Math.round(commsAvailability),
      availabilityStatus: availabilityStatusFrom(commsAvailability),
    },
  ]

  const overallHealth = worstHealth(systemHealth.map((s) => s.health))
  return { systemHealth, overallHealth }
}
