import type { OddAssessment, OddParameterStatus, VesselSnapshot } from '@/types'
import { ASSISTED_FUNCTIONS, getAssistedFunction } from './oddFunctions'
import { OPERATIONAL_MODE_LABELS } from '@/types'

function overallSensorConfidence(snapshot: VesselSnapshot): number {
  const values = [
    snapshot.navigation.gnssConfidence,
    snapshot.communications.satelliteConfidence,
    snapshot.systemHealth.find((s) => s.area === 'main_engine')?.confidence ?? 100,
  ]
  return Math.min(...values)
}

export function assessOdd(functionId: string, snapshot: VesselSnapshot): OddAssessment {
  const fn = getAssistedFunction(functionId)
  const sensorConfidence = overallSensorConfidence(snapshot)

  const parameters: OddParameterStatus[] = [
    {
      key: 'visibility',
      label: 'Visibility',
      value: `${snapshot.environment.visibilityNm.toFixed(1)} nm`,
      withinLimit: snapshot.environment.visibilityNm >= fn.minVisibilityNm,
      detail: `Requires ≥ ${fn.minVisibilityNm} nm`,
    },
    {
      key: 'waveHeight',
      label: 'Wave Height',
      value: `${snapshot.environment.waveHeightM.toFixed(1)} m`,
      withinLimit: snapshot.environment.waveHeightM <= fn.maxWaveHeightM,
      detail: `Requires ≤ ${fn.maxWaveHeightM} m`,
    },
    {
      key: 'gnssAvailability',
      label: 'GNSS Confidence',
      value: `${snapshot.navigation.gnssConfidence.toFixed(0)}%`,
      withinLimit: snapshot.navigation.gnssAvailable && snapshot.navigation.gnssConfidence >= fn.minGnssConfidence,
      detail: `Requires GNSS available and ≥ ${fn.minGnssConfidence}%`,
    },
    {
      key: 'radarAvailability',
      label: 'Radar',
      value: snapshot.navigation.radarAvailable ? 'Available' : 'Unavailable',
      withinLimit: !fn.requiresRadar || snapshot.navigation.radarAvailable,
      detail: fn.requiresRadar ? 'Required for this function' : 'Not required',
    },
    {
      key: 'aisAvailability',
      label: 'AIS',
      value: snapshot.navigation.aisAvailable ? 'Available' : 'Unavailable',
      withinLimit: !fn.requiresAis || snapshot.navigation.aisAvailable,
      detail: fn.requiresAis ? 'Required for this function' : 'Not required',
    },
    {
      key: 'chartDataValidity',
      label: 'Route / Chart Data',
      value: snapshot.navigation.chartDataValid ? 'Valid' : 'Invalid',
      withinLimit: !fn.requiresChartData || snapshot.navigation.chartDataValid,
      detail: fn.requiresChartData ? 'Valid chart data required' : 'Not required',
    },
    {
      key: 'communications',
      label: 'Ship-Shore Communications',
      value: snapshot.communications.satelliteLinkUp ? 'Up' : 'Down',
      withinLimit: !fn.requiresCommunications || snapshot.communications.satelliteLinkUp,
      detail: fn.requiresCommunications ? 'Shore link required for this function' : 'Not required',
    },
    {
      key: 'sensorConfidence',
      label: 'Sensor Confidence',
      value: `${sensorConfidence.toFixed(0)}%`,
      withinLimit: sensorConfidence >= fn.minSensorConfidence,
      detail: `Requires ≥ ${fn.minSensorConfidence}%`,
    },
    {
      key: 'trafficDensity',
      label: 'Traffic Density',
      value: snapshot.environment.trafficDensity,
      withinLimit: true,
      detail: 'Informational — affects recommendation priority, not envelope admission',
    },
    {
      key: 'machineryHealth',
      label: 'Machinery Health',
      value: snapshot.systemHealth.find((s) => s.area === 'main_engine')?.health ?? 'healthy',
      withinLimit: true,
      detail: 'Informational — considered separately by the safety validation layer',
    },
    {
      key: 'seaState',
      label: 'Sea State',
      value: `${snapshot.environment.seaState}`,
      withinLimit: true,
      detail: 'Informational',
    },
  ]

  const modeAllowed = fn.allowedModes.includes(snapshot.operationalMode)
  if (!modeAllowed) {
    parameters.unshift({
      key: 'trafficDensity',
      label: 'Operational Mode',
      value: OPERATIONAL_MODE_LABELS[snapshot.operationalMode],
      withinLimit: false,
      detail: `Function not enabled in this operational mode`,
    })
  }

  const limitingFactors = parameters.filter((p) => !p.withinLimit)
  const insideEnvelope = modeAllowed && limitingFactors.length === 0

  return {
    functionId: fn.id,
    functionLabel: fn.label,
    insideEnvelope,
    limitingFactors,
    parameters,
  }
}

export function assessAllOdd(snapshot: VesselSnapshot): OddAssessment[] {
  return ASSISTED_FUNCTIONS.map((fn) => assessOdd(fn.id, snapshot))
}
