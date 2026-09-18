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
} from '@ave/core-domain/types'
import { buildBaselineHazards, buildBaselineMaintenance, buildBaselineSnapshot, buildBaselineTargets, SIM_START_ISO } from './baseline'
import { buildBaselineVoyagePlan } from '../data/voyagePlan'
import { buildBaselineFleet } from '../data/fleet'
import { buildInitialTelemetryHistory, type TelemetryHistoryState } from '@ave/core-domain/telemetryHistory'
import { createAuditEvent, INITIAL_AUDIT_CHAIN_CHECKPOINT, type AuditChainCheckpoint } from '@ave/core-domain/auditChain'
import { analyseMainEngine, type MachineryAnalysis } from '@ave/decision-engine/machineryAnalytics'
import { DEFAULT_TARGET_RISK_LIMITS, type TargetRiskLimits } from '@ave/decision-engine/targetRisk'

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

  /**
   * The single sequencing point for the audit hash chain (see @ave/core-domain/auditChain and
   * docs/assumptions.md constraint 3): the LAST `seq` issued to any audit event by either
   * producer (the engine tick, or a simulationStore action). The next event mints `+ 1`. Carried
   * across a RESET ENVIRONMENT exactly like `nextIdCounter`, for the same reason: restarting it
   * would re-issue a seq already used by a retained record.
   */
  nextAuditSeq: number
  /**
   * The incremental sealer's resume point and the audit trail's retention-boundary figure. Never
   * reset by RESET ENVIRONMENT (the prior audit trail — and therefore its sealed history — is
   * deliberately retained). Advanced only by `sealAuditChain` in the store, never by the engine
   * tick: hashing is asynchronous and the tick is not (constraint 2).
   */
  auditChainCheckpoint: AuditChainCheckpoint
  /**
   * The highest audit `seq` ever evicted from the live `auditEvents` buffer by the engine's
   * `MAX_AUDIT_EVENTS` truncation (0 if nothing has been evicted yet) — the symmetric counterpart
   * of `auditChainCheckpoint` at the OLDEST end of the chain rather than the newest. Advanced only
   * by the one place that legitimately drops records (`engine.ts`'s tick), never by the sealer or
   * the store, and never reset by RESET ENVIRONMENT (the prior trail's eviction history is part of
   * what is retained). `verifyChain` requires the oldest VISIBLE sealed record's `seq` to equal
   * this plus one — without it, deleting any number of the oldest records (including before any
   * legitimate eviction has ever happened) was indistinguishable from genuine retention-boundary
   * eviction, since nothing else recorded where that boundary actually was.
   */
  evictedThroughSeq: number

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
 * @param startAuditSeq continue the audit chain's `seq` sequence from an existing session, for
 * the same reason as `startIdCounter` — see `nextAuditSeq`. The initial event mints at
 * `startAuditSeq + 1`; a caller carrying a session forward (RESET ENVIRONMENT) also has to
 * re-apply its OWN prior `auditChainCheckpoint` afterwards, since this function always starts a
 * fresh one — see simulationStore.ts.
 */
export function buildInitialSimulationState(startIdCounter = 1, startShoreCaseNumber = 1, startAuditSeq = 0): SimulationState {
  const snapshot = buildBaselineSnapshot()
  const telemetryHistory = buildInitialTelemetryHistory(snapshot)
  const initialAuditId = `AUD-${String(startIdCounter).padStart(6, '0')}`
  const initialAuditSeq = startAuditSeq + 1

  return {
    snapshot,
    targets: buildBaselineTargets(),
    maintenanceItems: buildBaselineMaintenance(),
    hazards: buildBaselineHazards(),
    rawAlarms: [],
    recommendations: [],
    auditEvents: [
      createAuditEvent(initialAuditSeq, {
        id: initialAuditId,
        timestampIso: SIM_START_ISO,
        operatingMode: 'Open Sea',
        scenarioId: null,
        kind: 'simulation',
        event: 'Simulation initialised. Baseline synthetic operating condition established.',
        outcome: 'Normal',
      }),
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
    // `nextAuditSeq` is likewise the LAST seq issued — the initial event above just minted one.
    nextAuditSeq: initialAuditSeq,
    auditChainCheckpoint: INITIAL_AUDIT_CHAIN_CHECKPOINT,
    evictedThroughSeq: 0,
    telemetryHistory,
    machineryAnalysis: analyseMainEngine(snapshot, telemetryHistory),
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
