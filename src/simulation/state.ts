import type {
  AdapterConnectionState,
  AuditEvent,
  DemoVoyageState,
  FleetVesselSummary,
  GeoPosition,
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
import { DEFAULT_TARGET_RISK_LIMITS, type TargetRiskLimits } from '@/decision-engine/targetRisk'

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
  /**
   * Monotonic tick counter, never reset. Used to seed the per-tick PRNG so that the noise term
   * is genuinely zero-mean over time. Seeding from `scenarioElapsedMinutes` alone meant that in
   * normal operations — where that value decays to exactly 0 and stays there — the same seed was
   * reused every tick, so every metric received an identical, near-maximal "random" nudge each
   * tick. That is a fixed bias, not a random walk, and it pushed steady-state values off target.
   */
  tickCount: number
  /**
   * Shore case numbering, carried across a RESET ENVIRONMENT. Deriving the number from
   * `shoreCases.length + 1` restarted at CASE-0001 after a reset and reused an ID already
   * referenced by retained audit records. A dedicated counter keeps the ID human-readable
   * (CASE-0001) while remaining unique for the whole session.
   */
  nextShoreCaseNumber: number

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

  /** Historical own-ship track for the navigation operating picture (most recent last). */
  ownTrack: GeoPosition[]
  /** Records "queued" while the shore link is down, illustrating store-and-forward recovery. */
  syncQueueCount: number
  demoVoyage: DemoVoyageState

  /**
   * The single operator-settable CPA/TCPA limit pair (MSC.192(79): "the preset CPA/TCPA limits
   * applied to targets from radar and AIS should be identical"). Every consumer of target risk —
   * the navigation canvas, the CPA alarm, the collision-risk recommendation gate, and the
   * navigation risk badge — reads this one value so they can never disagree with each other.
   * Store state rather than component state, so it survives a remount of the navigation panel and
   * can be recorded in the audit trail.
   */
  targetRiskLimits: TargetRiskLimits
}

/**
 * @param startIdCounter continue the monotonic ID sequence from an existing session. RESET
 * ENVIRONMENT deliberately retains the prior audit trail, so restarting the counter at 1 would
 * mint IDs that collide with records already in that trail — an audit trail with duplicate IDs
 * cannot be relied on as evidence.
 */
export function buildInitialSimulationState(startIdCounter = 1, startShoreCaseNumber = 1): SimulationState {
  const snapshot = buildBaselineSnapshot()
  const telemetryHistory = buildInitialTelemetryHistory()
  const initialAuditId = `AUD-${String(startIdCounter).padStart(6, '0')}`

  return {
    snapshot,
    targets: buildBaselineTargets(),
    maintenanceItems: buildBaselineMaintenance(),
    hazards: [],
    rawAlarms: [],
    recommendations: [],
    auditEvents: [
      {
        id: initialAuditId,
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
    // `nextIdCounter` is the LAST id number issued; the next mint is this + 1.
    nextIdCounter: startIdCounter,
    tickCount: 0,
    nextShoreCaseNumber: startShoreCaseNumber,
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
    ownTrack: [snapshot.navigation.position],
    syncQueueCount: 0,
    demoVoyage: { active: false, phaseIndex: 0, phaseElapsedMinutes: 0 },
    targetRiskLimits: DEFAULT_TARGET_RISK_LIMITS,
  }
}
