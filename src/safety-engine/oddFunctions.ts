import type { AssistanceLevel, OperationalMode, VesselSystemArea } from '@/types'

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
  maxDataLatencySec: number
  /** Assistance level this function is configured to operate at in this POC when fully inside its envelope. */
  configuredAssistanceLevel: AssistanceLevel
  /** Ceiling this function may never exceed, regardless of conditions — L4 is never reached for any function in this POC. */
  maxAssistanceLevel: AssistanceLevel
  /**
   * The vessel system areas this function actually depends on for its source data. The safety
   * engine checks availability against THESE areas. Previously every non-machinery function was
   * checked against `navigation`, so (for example) a shore-sync recommendation reported
   * "source system availability confirmed — all navigation sensors nominal" while the satellite
   * link was down.
   */
  requiredSourceAreas: VesselSystemArea[]
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
    maxDataLatencySec: 5,
    configuredAssistanceLevel: 'L2',
    maxAssistanceLevel: 'L2',
    requiredSourceAreas: ['navigation'],
  },
  {
    id: 'voyage_speed_optimisation',
    label: 'Voyage Speed & Energy Optimisation',
    description: 'Speed and routing recommendations balancing ETA window, fuel and weather exposure. A recommended speed only takes effect once explicitly authorised.',
    allowedModes: ['open_sea', 'coastal'],
    minVisibilityNm: 0,
    maxWaveHeightM: 5,
    minGnssConfidence: 60,
    requiresRadar: false,
    requiresAis: false,
    requiresChartData: true,
    requiresCommunications: false,
    minSensorConfidence: 50,
    maxDataLatencySec: 30,
    configuredAssistanceLevel: 'L3',
    maxAssistanceLevel: 'L3',
    requiredSourceAreas: ['navigation', 'fuel_energy', 'main_engine'],
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
    maxDataLatencySec: 15,
    configuredAssistanceLevel: 'L2',
    maxAssistanceLevel: 'L2',
    requiredSourceAreas: ['main_engine'],
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
    maxDataLatencySec: 3600,
    configuredAssistanceLevel: 'L2',
    maxAssistanceLevel: 'L2',
    requiredSourceAreas: ['main_engine', 'auxiliary_machinery'],
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
    maxDataLatencySec: 60,
    configuredAssistanceLevel: 'L2',
    maxAssistanceLevel: 'L2',
    requiredSourceAreas: ['cargo_reefer', 'electrical_power'],
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
    maxDataLatencySec: 10,
    configuredAssistanceLevel: 'L1',
    maxAssistanceLevel: 'L2',
    requiredSourceAreas: ['communications'],
  },
]

export function getAssistedFunction(id: string): AssistedFunctionDefinition {
  const found = ASSISTED_FUNCTIONS.find((f) => f.id === id)
  if (!found) throw new Error(`Unknown assisted function: ${id}`)
  return found
}
