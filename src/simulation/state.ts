import type {
  AdapterConnectionState,
  AuditEvent,
  FleetVesselSummary,
  Hazard,
  MaintenanceItem,
  PocExecutionMode,
  RawAlarm,
  Recommendation,
  ScenarioId,
  ShoreCase,
  TargetVessel,
  VesselSnapshot,
  VoyagePlan,
} from '@/types'
import { buildBaselineMaintenance, buildBaselineSnapshot, buildBaselineTargets, SIM_START_ISO } from './baseline'
import { buildBaselineVoyagePlan } from '@/data/voyagePlan'
import { buildBaselineFleet } from '@/data/fleet'
import { buildInitialTelemetryHistory, type TelemetryHistoryState } from './telemetryHistory'
import { analyseMainEngine, type MachineryAnalysis } from '@/decision-engine/machineryAnalytics'

export interface AdapterStatuses {
  telemetry: AdapterConnectionState
  weather: AdapterConnectionState
  copilot: AdapterConnectionState
  documents: AdapterConnectionState
  systemHealthApi: AdapterConnectionState
  audit: AdapterConnectionState
  shoreCases: AdapterConnectionState
}

export interface SimulationState {
  snapshot: VesselSnapshot
  targets: TargetVessel[]
  maintenanceItems: MaintenanceItem[]
  hazards: Hazard[]
  rawAlarms: RawAlarm[]
  recommendations: Recommendation[]
  auditEvents: AuditEvent[]
  fleet: FleetVesselSummary[]
  shoreCases: ShoreCase[]
  voyagePlan: VoyagePlan
  activeScenario: ScenarioId
  scenarioElapsedMinutes: number
  scenarioTriggers: Record<string, boolean>
  isPlaying: boolean
  speedMultiplier: number
  seed: number
  nextIdCounter: number

  /** V2: genuine time-series history backing the trend/anomaly analytics. */
  telemetryHistory: TelemetryHistoryState
  /** V2: the single canonical machinery analysis for this tick — every surface reads this
   * instead of recomputing it, so the console, digital twin and copilot can never disagree. */
  machineryAnalysis: MachineryAnalysis

  /** V2: which POC execution mode is selected, and the live (or last-known) status of each
   * connected-service adapter. Offline mode never attempts a network call. Connected mode
   * attempts one and falls back to the simulated/local implementation on failure. */
  pocMode: PocExecutionMode
  adapterStatuses: AdapterStatuses
}

export function buildInitialSimulationState(): SimulationState {
  const snapshot = buildBaselineSnapshot()
  const telemetryHistory = buildInitialTelemetryHistory()

  return {
    snapshot,
    targets: buildBaselineTargets(),
    maintenanceItems: buildBaselineMaintenance(),
    hazards: [],
    rawAlarms: [],
    recommendations: [],
    auditEvents: [
      {
        id: 'AUD-000001',
        timestampIso: SIM_START_ISO,
        operatingMode: 'Open Sea',
        scenarioId: null,
        kind: 'simulation',
        event: 'Simulation initialised. Baseline synthetic operating condition established.',
        outcome: 'Normal',
      },
    ],
    fleet: buildBaselineFleet(),
    shoreCases: [],
    voyagePlan: buildBaselineVoyagePlan(),
    activeScenario: 'normal_operations',
    scenarioElapsedMinutes: 0,
    scenarioTriggers: {},
    isPlaying: true,
    speedMultiplier: 1,
    seed: 42,
    nextIdCounter: 1,
    telemetryHistory,
    machineryAnalysis: analyseMainEngine(snapshot),
    pocMode: 'offline',
    adapterStatuses: {
      telemetry: 'simulated',
      weather: 'simulated',
      copilot: 'simulated',
      documents: 'simulated',
      systemHealthApi: 'simulated',
      audit: 'simulated',
      shoreCases: 'simulated',
    },
  }
}
