import type {
  AuditEvent,
  FleetVesselSummary,
  Hazard,
  MaintenanceItem,
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
}

export function buildInitialSimulationState(): SimulationState {
  return {
    snapshot: buildBaselineSnapshot(),
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
  }
}
