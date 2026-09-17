import type { ScenarioId } from '@ave/core-domain/types'

export const SCENARIO_RAMP_MINUTES: Record<ScenarioId, number> = {
  normal_operations: 1,
  engine_degradation: 240,
  heavy_weather: 180,
  collision_risk: 150,
  reefer_excursion: 120,
  excessive_fuel_consumption: 200,
  alarm_cascade: 90,
  communication_loss: 60,
  gnss_sensor_degradation: 90,
  safety_event: 60,
}

export interface ScenarioTargets {
  exhaustTempDeviationC: number
  lubOilPressureBar: number
  windSpeedKn: number
  waveHeightM: number
  seaState: number
  visibilityNm: number
  gnssConfidence: number
  satelliteConfidence: number
  fuelConsumptionMultiplier: number
  blackoutRiskScore: number
  reeferDeviationC: number
}

const BASELINE_TARGETS: ScenarioTargets = {
  exhaustTempDeviationC: 3,
  lubOilPressureBar: 4.2,
  windSpeedKn: 12,
  waveHeightM: 1.2,
  seaState: 3,
  visibilityNm: 10,
  gnssConfidence: 99,
  satelliteConfidence: 98,
  fuelConsumptionMultiplier: 1,
  blackoutRiskScore: 3,
  reeferDeviationC: 0,
}

export function computeScenarioTargets(scenario: ScenarioId, severity: number): ScenarioTargets {
  const t = { ...BASELINE_TARGETS }

  switch (scenario) {
    case 'engine_degradation':
      t.exhaustTempDeviationC = BASELINE_TARGETS.exhaustTempDeviationC + severity * 46
      t.lubOilPressureBar = BASELINE_TARGETS.lubOilPressureBar - severity * 1.15
      t.fuelConsumptionMultiplier = 1 + severity * 0.12
      break
    case 'heavy_weather':
      t.windSpeedKn = BASELINE_TARGETS.windSpeedKn + severity * 40
      t.waveHeightM = BASELINE_TARGETS.waveHeightM + severity * 5.6
      t.seaState = BASELINE_TARGETS.seaState + severity * 5.4
      t.visibilityNm = BASELINE_TARGETS.visibilityNm - severity * 6.5
      t.fuelConsumptionMultiplier = 1 + severity * 0.22
      break
    case 'excessive_fuel_consumption':
      t.fuelConsumptionMultiplier = 1 + severity * 0.34
      break
    case 'gnss_sensor_degradation':
      t.gnssConfidence = BASELINE_TARGETS.gnssConfidence - severity * 74
      break
    case 'communication_loss':
      t.satelliteConfidence = BASELINE_TARGETS.satelliteConfidence - severity * 90
      break
    case 'alarm_cascade':
      t.exhaustTempDeviationC = BASELINE_TARGETS.exhaustTempDeviationC + severity * 30
      t.blackoutRiskScore = BASELINE_TARGETS.blackoutRiskScore + severity * 68
      t.lubOilPressureBar = BASELINE_TARGETS.lubOilPressureBar - severity * 0.6
      break
    case 'reefer_excursion':
      t.reeferDeviationC = severity * 6.4
      break
    case 'safety_event':
      t.blackoutRiskScore = BASELINE_TARGETS.blackoutRiskScore + severity * 20
      break
    case 'collision_risk':
    case 'normal_operations':
      break
  }

  return t
}
