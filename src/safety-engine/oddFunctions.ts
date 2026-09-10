import type { OperationalMode } from '@/types'

export interface AssistedFunctionDefinition {
  id: string
  label: string
  description: string
  allowedModes: OperationalMode[]
  minVisibilityNm: number
  maxWaveHeightM: number
  minGnssConfidence: number
  requiresRadar: boolean
  requiresAis: boolean
  requiresChartData: boolean
  requiresCommunications: boolean
  minSensorConfidence: number
}

export const ASSISTED_FUNCTIONS: AssistedFunctionDefinition[] = [
  {
    id: 'nav_collision_advisory',
    label: 'Navigation Collision-Risk Advisory',
    description: 'CPA/TCPA monitoring and course/speed evaluation suggestions for the bridge team.',
    allowedModes: ['open_sea', 'coastal', 'traffic_separation', 'congested_waters', 'port_approach'],
    minVisibilityNm: 2,
    maxWaveHeightM: 6,
    minGnssConfidence: 70,
    requiresRadar: true,
    requiresAis: true,
    requiresChartData: true,
    requiresCommunications: false,
    minSensorConfidence: 60,
  },
  {
    id: 'voyage_speed_optimisation',
    label: 'Voyage Speed & Energy Optimisation',
    description: 'Speed and routing recommendations balancing ETA window, fuel and weather exposure.',
    allowedModes: ['open_sea', 'coastal'],
    minVisibilityNm: 0,
    maxWaveHeightM: 5,
    minGnssConfidence: 60,
    requiresRadar: false,
    requiresAis: false,
    requiresChartData: true,
    requiresCommunications: false,
    minSensorConfidence: 50,
  },
  {
    id: 'machinery_anomaly_detection',
    label: 'Machinery Anomaly Detection',
    description: 'Condition monitoring and anomaly scoring across main engine and auxiliary machinery.',
    allowedModes: ['open_sea', 'coastal', 'traffic_separation', 'congested_waters', 'port_approach', 'manoeuvring', 'anchored', 'alongside'],
    minVisibilityNm: 0,
    maxWaveHeightM: 9,
    minGnssConfidence: 0,
    requiresRadar: false,
    requiresAis: false,
    requiresChartData: false,
    requiresCommunications: false,
    minSensorConfidence: 55,
  },
  {
    id: 'predictive_maintenance',
    label: 'Predictive Maintenance Planning',
    description: 'Remaining-useful-life and failure-probability estimation for monitored components.',
    allowedModes: ['open_sea', 'coastal', 'traffic_separation', 'congested_waters', 'port_approach', 'manoeuvring', 'anchored', 'alongside'],
    minVisibilityNm: 0,
    maxWaveHeightM: 9,
    minGnssConfidence: 0,
    requiresRadar: false,
    requiresAis: false,
    requiresChartData: false,
    requiresCommunications: false,
    minSensorConfidence: 50,
  },
  {
    id: 'reefer_monitoring',
    label: 'Reefer / Cargo Condition Monitoring',
    description: 'Temperature excursion detection and power-status monitoring for reefer containers.',
    allowedModes: ['open_sea', 'coastal', 'traffic_separation', 'congested_waters', 'port_approach', 'manoeuvring', 'anchored', 'alongside'],
    minVisibilityNm: 0,
    maxWaveHeightM: 9,
    minGnssConfidence: 0,
    requiresRadar: false,
    requiresAis: false,
    requiresChartData: false,
    requiresCommunications: false,
    minSensorConfidence: 55,
  },
  {
    id: 'shore_sync_assistance',
    label: 'Shore-Assisted Support Functions',
    description: 'Functions dependent on ship-shore synchronisation for specialist shore input.',
    allowedModes: ['open_sea', 'coastal', 'traffic_separation', 'congested_waters', 'port_approach', 'manoeuvring', 'anchored', 'alongside'],
    minVisibilityNm: 0,
    maxWaveHeightM: 9,
    minGnssConfidence: 0,
    requiresRadar: false,
    requiresAis: false,
    requiresChartData: false,
    requiresCommunications: true,
    minSensorConfidence: 0,
  },
]

export function getAssistedFunction(id: string): AssistedFunctionDefinition {
  const found = ASSISTED_FUNCTIONS.find((f) => f.id === id)
  if (!found) throw new Error(`Unknown assisted function: ${id}`)
  return found
}
