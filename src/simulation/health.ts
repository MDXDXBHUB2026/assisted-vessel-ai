import type { HealthLevel, SystemHealthSummary, SystemState, VesselSnapshot } from '@/types'
import { worstHealth } from '@/types'
import type { MachineryAnalysis } from '@/decision-engine/machineryAnalytics'

function levelFromScore(score: number): HealthLevel {
  if (score >= 85) return 'healthy'
  if (score >= 65) return 'advisory'
  if (score >= 40) return 'warning'
  return 'critical'
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

  const systemHealth: SystemHealthSummary[] = [
    {
      area: 'navigation',
      health: navHealth,
      state: navState,
      headline: gnssDegraded ? `GNSS confidence reduced to ${navConfidence.toFixed(0)}%` : 'All navigation sensors nominal',
      confidence: Math.round(navConfidence),
    },
    {
      area: 'main_engine',
      health: engineHealth,
      state: engineState,
      headline: machineryAnalysis.probableCondition,
      confidence: machineryAnalysis.confidencePercent,
    },
    {
      area: 'auxiliary_machinery',
      health: 'healthy',
      state: 'normal',
      headline: 'Auxiliary machinery nominal',
      confidence: snapshot.auxMachinery.auxEngineHealthScore,
    },
    {
      area: 'electrical_power',
      health: electricalHealth,
      state: electricalHealth === 'critical' ? 'contingency' : electricalHealth === 'warning' ? 'degraded' : 'normal',
      headline: electricalHealth === 'healthy' ? 'Power generation stable, healthy reserve' : `Elevated blackout risk score (${snapshot.electricalPower.blackoutRiskScore.toFixed(0)})`,
      confidence: 95,
    },
    {
      area: 'fuel_energy',
      health: fuelHealth,
      state: fuelHealth === 'warning' ? 'degraded' : 'normal',
      headline: fuelHealth === 'healthy' ? 'Fuel consumption tracking baseline' : `Consumption ${fuelExcess.toFixed(0)}% above baseline`,
      confidence: 92,
    },
    {
      area: 'cargo_reefer',
      health: cargoHealth,
      state: cargoState,
      headline: cargoHealth === 'healthy' ? 'All reefer units within set point' : 'One or more reefer units outside set point',
      confidence: 96,
    },
    {
      area: 'safety',
      health: safetyHealth,
      state: safetyHealth === 'critical' ? 'contingency' : 'normal',
      headline: safetyHealth === 'healthy' ? 'Safety systems ready' : 'Active safety condition requires attention',
      confidence: 98,
    },
    {
      area: 'communications',
      health: commsHealth,
      state: commsState,
      headline: commsDegraded ? 'Ship-shore link degraded — fallback mode active' : 'Satellite and VHF links nominal',
      confidence: Math.round(snapshot.communications.satelliteConfidence),
    },
  ]

  const overallHealth = worstHealth(systemHealth.map((s) => s.health))
  return { systemHealth, overallHealth }
}
