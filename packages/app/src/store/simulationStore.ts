import { create } from 'zustand'
import type { AuditEvent, AuditEventKind, Hazard, OperationalMode, PocExecutionMode, RequiredAuthority, ScenarioId, ShoreCase, ShoreFunction } from '@/types'
import type { TargetRiskLimits } from '@ave/decision-engine/targetRisk'
import { assistanceLevelRank, OPERATIONAL_MODE_LABELS } from '@/types'
import { activeIntolerableHazardCategories, canTransition, HAZARD_ACTION_LABELS, HAZARD_ACTION_PAST_TENSE, HAZARD_STATUS_LABELS, type HazardAction } from '@ave/decision-engine/hazardLifecycle'
import { buildRiskAssessment, FREQUENCY_INDEX_MIN } from '@ave/decision-engine/riskMatrix'
import { buildInitialSimulationState, type AdapterStatuses, type SimulationState } from '@ave/simulator/simulation/state'
import { tick } from '@ave/simulator/simulation/engine'
import { toRelativeRisk } from '@ave/simulator/simulation/navigation'
import { validateRecommendation } from '@ave/safety-engine/validate'
import { assessOdd } from '@ave/safety-engine/oddEngine'
import { DEMO_VOYAGE_PHASES } from '@ave/simulator/simulation/demoVoyage'
import { createAuditEvent, sealPending, PENDING_HASH } from '@ave/core-domain/auditChain'
import { readStoredPocMode, writeStoredPocMode } from '@/services/pocMode'
import { resolveTelemetryAdapter } from '@/services/adapters/telemetryAdapter'
import { resolveWeatherAdapter } from '@/services/adapters/weatherAdapter'
import { resolveSystemHealthAdapter } from '@/services/adapters/systemHealthAdapter'
import { resolveDocumentSearchAdapter } from '@/services/adapters/documentSearchAdapter'
import { connectedAuditAdapter } from '@/services/adapters/auditAdapter'
import { connectedShoreCaseAdapter } from '@/services/adapters/shoreCaseAdapter'

export const BASE_DT_MINUTES_PER_SECOND = 0.5

/**
 * One ID authority for the whole application. Store actions previously minted audit IDs from
 * `Date.now()` while the engine used a monotonic counter — two schemes and two clocks in a
 * single supposedly-immutable ledger, with `AUD-CASE-` shared between two different actions so
 * a create and an update in the same millisecond collided outright.
 */
let probeGeneration = 0

function mintId(prefix: string, counter: number): string {
  return `${prefix}-${String(counter).padStart(6, '0')}`
}

/**
 * The store's half of the single audit `seq` sequencing point (the engine tick is the other —
 * see engine.ts and docs/assumptions.md constraint 3). Every store action that writes an audit
 * event goes through this, so `seq` allocation and the boilerplate fields (id/timestamp/mode)
 * are written exactly once rather than at every one of the dozen-plus call sites below.
 * `scenarioId` must be passed explicitly — most call sites want the ACTIVE scenario at the time
 * of the event, but a few (a reset, a POC mode change) deliberately want `null`, and a couple
 * (setScenario, skipToPhase) want the scenario being switched TO, not the one being left — no
 * single default is correct for all of them.
 */
function buildStoreAuditEvent(
  state: SimulationState,
  auditId: string,
  fields: Omit<AuditEvent, 'id' | 'seq' | 'hash' | 'prevHash' | 'timestampIso' | 'operatingMode'> & { operatingMode?: string },
): AuditEvent {
  return createAuditEvent(state.nextAuditSeq + 1, {
    id: auditId,
    timestampIso: state.snapshot.simTimeIso,
    operatingMode: fields.operatingMode ?? OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
    ...fields,
  })
}

interface SimulationStore extends SimulationState {
  stepIfPlaying: (elapsedSeconds: number) => void
  play: () => void
  pause: () => void
  setSpeed: (multiplier: number) => void
  resetEnvironment: () => void
  setScenario: (scenario: ScenarioId) => void
  setOperationalMode: (mode: OperationalMode) => void
  setVoyageSpeed: (speedKn: number | null) => void
  acceptVoyageRecommendation: (role?: RequiredAuthority) => void

  setPocMode: (mode: PocExecutionMode) => void
  probeConnectedAdapters: () => Promise<void>

  startDemoVoyage: () => void
  skipToPhase: (index: number) => void
  resetDemoVoyage: () => void

  decideRecommendation: (
    id: string,
    decision: 'accepted' | 'modified' | 'rejected' | 'info_requested' | 'shore_support_requested',
    comment: string,
    role: RequiredAuthority,
  ) => void

  transitionHazard: (
    id: string,
    action: HazardAction,
    actorRole: RequiredAuthority,
    details?: {
      note?: string
      ownerRole?: RequiredAuthority
      correctiveActionDescription?: string
      verificationNote?: string
      escalatedToRole?: RequiredAuthority
    },
  ) => void

  setTargetRiskLimits: (limits: TargetRiskLimits) => void

  createShoreCase: (input: { vesselId: string; vesselName: string; function: ShoreFunction; priority: 'healthy' | 'advisory' | 'warning' | 'critical'; reason: string; requestedExpertise: string; recommendationId?: string }) => void
  updateShoreCase: (id: string, status: ShoreCase['status'], guidanceNotes?: string) => void

  logAudit: (event: string, kind?: AuditEventKind) => void

  /**
   * The incremental sealer's entry point (docs/assumptions.md constraint 2). Genuinely async —
   * hashes with crypto.subtle — and deliberately never called from inside a synchronous tick.
   * Also backfills `decisionAuditHash` on any recommendation whose `decisionAuditSeq` this pass
   * just sealed. Safe to call repeatedly; a call while one is already in flight is a no-op.
   */
  sealAuditChain: () => Promise<void>
}

export const useSimulationStore = create<SimulationStore>((set, get) => {
  // Local to this store instance (not module-global), so a fresh store — a fresh `create()` call,
  // as every test file's `beforeEach` triggers via `resetEnvironment` — never inherits another
  // instance's in-flight state.
  let sealInFlight = false
  // Set when a seal trigger arrives WHILE a pass is already in flight. A plain "if in flight,
  // return" guard would silently DROP that trigger — if the record it was for stays pending
  // forever (nothing else ever changes `nextAuditSeq` again, e.g. the session is paused right
  // after), it falls permanently outside `verifyChain`'s reach, since verification excludes
  // pending records entirely. Setting this flag instead makes the in-flight pass loop once more
  // after it finishes, so no trigger is ever lost — see `sealAuditChain` below.
  let sealDirty = false

  return {
  ...buildInitialSimulationState(),
  pocMode: readStoredPocMode(),

  stepIfPlaying: (elapsedSeconds) => {
    const state = get()
    if (!state.isPlaying) return
    set(tick(state, BASE_DT_MINUTES_PER_SECOND * elapsedSeconds))
    // Sealing itself is triggered by the `nextAuditSeq` subscription below, not from here — that
    // covers every producer (this tick AND every store action, including ones fired while
    // paused) from one place, rather than needing a call at every audit-writing site.
  },

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  setSpeed: (multiplier) => set({ speedMultiplier: multiplier }),

  resetEnvironment: () => {
    // Continue the ID sequence. RESET ENVIRONMENT deliberately retains the prior audit trail, so
    // restarting the counter would mint IDs colliding with records already in it. Same for the
    // audit chain's `seq` counter and its sealed-prefix checkpoint — see docs/assumptions.md.
    const carried = get().nextIdCounter
    const carriedAuditSeq = get().nextAuditSeq
    const carriedChainCheckpoint = get().auditChainCheckpoint
    const carriedEvictedThroughSeq = get().evictedThroughSeq
    const fresh = buildInitialSimulationState(carried + 1, get().nextShoreCaseNumber, carriedAuditSeq)
    const prevAudit = get().auditEvents
    const pocMode = get().pocMode
    const targetRiskLimits = get().targetRiskLimits
    // Reuses the seq/hash/prevHash slot `fresh` already minted for its own baseline event
    // (discarded below in favour of this one) rather than also minting a second, unused seq —
    // unlike `id`, the audit chain's `seq` sequence must never have a gap.
    const resetEvent: AuditEvent = {
      ...fresh.auditEvents[0]!,
      id: mintId('AUD', fresh.nextIdCounter + 1),
      scenarioId: null,
      kind: 'simulation',
      event: 'Environment reset to baseline synthetic operating condition by operator.',
      outcome: 'Normal',
    }
    set({
      ...fresh,
      pocMode,
      targetRiskLimits,
      auditChainCheckpoint: carriedChainCheckpoint,
      evictedThroughSeq: carriedEvictedThroughSeq,
      nextIdCounter: fresh.nextIdCounter + 1,
      auditEvents: [resetEvent, ...prevAudit],
    })
    void get().probeConnectedAdapters()
  },

  startDemoVoyage: () => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    const first = DEMO_VOYAGE_PHASES[0]!
    const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
      scenarioId: first.scenario,
      kind: 'scenario',
      event: `Demo Voyage started: "${first.title}".`,
      outcome: 'started',
    })
    set({
      nextIdCounter: auditId,
      nextAuditSeq: auditEvent.seq,
      activeScenario: first.scenario,
      scenarioElapsedMinutes: 0,
      scenarioTriggers: {},
      demoVoyage: { active: true, phaseIndex: 0, phaseElapsedMinutes: 0 },
      isPlaying: true,
      auditEvents: [auditEvent, ...state.auditEvents],
    })
  },

  skipToPhase: (index) => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    const phase = DEMO_VOYAGE_PHASES[index]
    if (!phase) return
    const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
      scenarioId: phase.scenario,
      kind: 'scenario',
      event: `Demo Voyage skipped to phase: "${phase.title}".`,
      outcome: 'phase_skipped',
    })
    set({
      nextIdCounter: auditId,
      nextAuditSeq: auditEvent.seq,
      activeScenario: phase.scenario,
      scenarioElapsedMinutes: 0,
      scenarioTriggers: {},
      demoVoyage: { active: true, phaseIndex: index, phaseElapsedMinutes: 0 },
      auditEvents: [auditEvent, ...state.auditEvents],
    })
  },

  resetDemoVoyage: () => {
    set({ demoVoyage: { active: false, phaseIndex: 0, phaseElapsedMinutes: 0 } })
    get().resetEnvironment()
  },

  setScenario: (scenario) => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
      scenarioId: scenario === 'normal_operations' ? null : scenario,
      kind: 'scenario',
      event: `Scenario activated: ${scenario.replace(/_/g, ' ')}.`,
      outcome: 'Activated',
    })
    set({
      nextIdCounter: auditId,
      nextAuditSeq: auditEvent.seq,
      activeScenario: scenario,
      scenarioElapsedMinutes: 0,
      scenarioTriggers: {},
      demoVoyage: { ...state.demoVoyage, active: false },
      auditEvents: [auditEvent, ...state.auditEvents],
    })
  },

  setOperationalMode: (mode) => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
      operatingMode: OPERATIONAL_MODE_LABELS[mode],
      scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
      kind: 'mode_change',
      event: `Operational mode changed to ${OPERATIONAL_MODE_LABELS[mode]}.`,
      outcome: OPERATIONAL_MODE_LABELS[mode],
    })
    set({
      nextIdCounter: auditId,
      nextAuditSeq: auditEvent.seq,
      snapshot: { ...state.snapshot, operationalMode: mode },
      auditEvents: [auditEvent, ...state.auditEvents],
    })
  },

  setVoyageSpeed: (speedKn) => {
    const state = get()
    const recommendedSpeedKn = state.voyagePlan.recommendedSpeedKn
    const effectiveSpeed = speedKn ?? recommendedSpeedKn
    const distanceRemainingNm = state.voyagePlan.distanceRemainingNm
    const hoursRemaining = distanceRemainingNm / effectiveSpeed
    const etaIso = new Date(new Date(state.snapshot.simTimeIso).getTime() + hoursRemaining * 3_600_000).toISOString()
    const fuelEstimate = state.snapshot.fuelEnergy.baselineConsumptionRateTonPerDay * (effectiveSpeed / recommendedSpeedKn) ** 2.4 * (hoursRemaining / 24)

    set({
      voyagePlan: {
        ...state.voyagePlan,
        userModifiedSpeedKn: speedKn,
        etaCurrentIso: etaIso,
        fuelEstimateCurrentTons: fuelEstimate,
        fuelSavingTons: state.voyagePlan.fuelEstimateRecommendedTons - fuelEstimate,
      },
    })
  },

  /**
   * The ONLY action in the application that actually changes vessel behaviour: the adopted speed
   * becomes the commanded speed in the simulation engine. It must therefore pass the same safety
   * validation as any other recommendation — previously it called neither `validateRecommendation`
   * nor `assessOdd`, did not check operational mode, and wrote an audit event hardcoding
   * "Master accepted ... L3 supervised execution" regardless of conditions or of who clicked.
   */
  acceptVoyageRecommendation: (role = 'master') => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    const functionId = 'voyage_speed_optimisation'
    const activeHazardCategories = activeIntolerableHazardCategories(state.hazards)
    const odd = assessOdd(functionId, state.snapshot, activeHazardCategories)
    const validation = validateRecommendation({
      functionId,
      snapshot: state.snapshot,
      riskLevel: 'medium',
      requiredAuthority: role,
      activeHazardCategories,
    })

    const belowL3 = assistanceLevelRank(odd.availableAssistanceLevel) < assistanceLevelRank('L3')
    const refusedReason =
      validation.verdict === 'blocked'
        ? validation.reason ?? 'Safety validation blocked this action.'
        : belowL3
          ? `Supervised execution requires L3; only ${odd.availableAssistanceLevel} is available (${odd.assistanceLimitingReason ?? 'conditions outside the operational envelope'}).`
          : undefined

    if (refusedReason) {
      const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
        scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
        kind: 'safety_validation',
        event: `Voyage speed adoption REFUSED by the safety layer: ${refusedReason}`,
        humanDecision: 'rejected',
        responsibleRole: role,
        safetyValidationResult: validation.verdict,
        outcome: 'Refused — speed profile not applied',
      })
      set({
        nextIdCounter: auditId,
        nextAuditSeq: auditEvent.seq,
        auditEvents: [auditEvent, ...state.auditEvents],
      })
      return
    }

    const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
      scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
      kind: 'human_decision',
      event: `${role.replace(/_/g, ' ')} authorised the recommended voyage speed profile — L3 supervised execution (safety validation ${validation.verdict.toUpperCase()}, assistance level ${odd.availableAssistanceLevel}).`,
      humanDecision: 'accepted',
      responsibleRole: role,
      safetyValidationResult: validation.verdict,
      outcome: 'Recommended speed adopted',
    })
    set({
      nextIdCounter: auditId,
      nextAuditSeq: auditEvent.seq,
      voyagePlan: { ...state.voyagePlan, recommendationAccepted: true, userModifiedSpeedKn: state.voyagePlan.recommendedSpeedKn },
      auditEvents: [auditEvent, ...state.auditEvents],
    })
  },

  setPocMode: (mode) => {
    writeStoredPocMode(mode)
    const state = get()
    const auditId = state.nextIdCounter + 1
    const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
      scenarioId: null,
      kind: 'simulation',
      event: `POC execution mode set to ${mode.toUpperCase()}.`,
      outcome: mode,
    })
    set({
      nextIdCounter: auditId,
      nextAuditSeq: auditEvent.seq,
      pocMode: mode,
      adapterStatuses: mode === 'offline'
        ? { telemetry: 'simulated', weather: 'simulated', copilot: 'simulated', documents: 'simulated', systemHealthApi: 'simulated', audit: 'simulated', shoreCases: 'simulated' }
        : { ...state.adapterStatuses, telemetry: 'connecting', weather: 'connecting', copilot: 'connecting', documents: 'connecting', systemHealthApi: 'connecting', audit: 'connecting', shoreCases: 'connecting' },
      auditEvents: [auditEvent, ...state.auditEvents],
    })
    if (mode === 'connected') void get().probeConnectedAdapters()
  },

  probeConnectedAdapters: async () => {
    const state = get()
    if (state.pocMode !== 'connected') return
    // Two probes can be in flight at once (setPocMode then resetEnvironment). Without a
    // generation guard, whichever resolves LAST wins — and with a 2.5s adapter timeout that is
    // frequently the older, slower one, so a stale result silently overwrites a newer one.
    probeGeneration += 1
    const generation = probeGeneration
    const [telemetry, weather, systemHealthApi, documents] = await Promise.all([
      resolveTelemetryAdapter('connected').checkStatus(),
      resolveWeatherAdapter('connected').checkStatus(),
      resolveSystemHealthAdapter('connected').checkStatus(),
      resolveDocumentSearchAdapter('connected').checkStatus(),
    ])
    const next: AdapterStatuses = {
      telemetry,
      weather,
      copilot: telemetry === 'connected' ? 'connected' : 'unavailable_fallback',
      documents,
      systemHealthApi,
      audit: systemHealthApi === 'connected' ? 'connected' : 'unavailable_fallback',
      shoreCases: systemHealthApi === 'connected' ? 'connected' : 'unavailable_fallback',
    }
    // Apply only if still in connected mode AND this is still the newest probe.
    if (get().pocMode === 'connected' && generation === probeGeneration) set({ adapterStatuses: next })
  },

  decideRecommendation: (id, decision, comment, role) => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    const rec = state.recommendations.find((r) => r.id === id)
    if (!rec) return

    // SAFE-003: a BLOCKED recommendation is never executable. Rejecting it, asking for more
    // information, or escalating to shore all remain available — only acting on it does not.
    // The refused attempt is itself recorded: an operator trying to action a blocked
    // recommendation is exactly the event an audit trail exists to capture.
    if (rec.safetyValidation.verdict === 'blocked' && (decision === 'accepted' || decision === 'modified')) {
      const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
        scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
        kind: 'safety_validation',
        event: `Attempt to ${decision === 'accepted' ? 'accept' : 'modify'} a BLOCKED recommendation "${rec.title}" was refused by the safety layer.`,
        recommendationId: id,
        responsibleRole: role,
        safetyValidationResult: 'blocked',
        outcome: 'Refused — recommendation is not executable',
      })
      set({
        nextIdCounter: auditId,
        nextAuditSeq: auditEvent.seq,
        auditEvents: [auditEvent, ...state.auditEvents],
      })
      return
    }

    const outcome =
      decision === 'accepted'
        ? 'Recommendation accepted and actioned by human authority.'
        : decision === 'modified'
          ? 'Recommendation modified by human authority before action.'
          : decision === 'rejected'
            ? 'Recommendation rejected by human authority.'
            : decision === 'info_requested'
              ? 'Additional information requested before decision.'
              : 'Shore support requested for this recommendation.'

    const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
      scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
      kind: 'human_decision',
      event: `Decision recorded for "${rec.title}": ${decision.replace(/_/g, ' ')}.`,
      recommendationId: id,
      humanDecision: decision,
      decisionComment: comment,
      responsibleRole: role,
      outcome,
    })

    set({
      nextIdCounter: auditId,
      nextAuditSeq: auditEvent.seq,
      recommendations: state.recommendations.map((r) =>
        r.id === id
          ? {
              ...r,
              status: decision,
              decisionComment: comment,
              decidedByRole: role,
              decidedAtIso: state.snapshot.simTimeIso,
              outcome,
              // Ties the decision to the immutable, hash-chained audit record that captured it
              // (docs/production-architecture-assessment.md §7 Phase 1) rather than to a mutable
              // id. `decisionAuditHash` is backfilled once the sealer reaches this seq — see
              // `sealAuditChain` below.
              decisionAuditSeq: auditEvent.seq,
            }
          : r,
      ),
      auditEvents: [auditEvent, ...state.auditEvents],
    })

    if (state.pocMode === 'connected') {
      // This mirror is a copy sent across a separate system boundary (connectedAuditAdapter) —
      // it is NOT a record in this store's own hash chain. Overriding `id`/`scenarioId` below
      // means `auditEvent.hash`/`prevHash` no longer describe this record's actual content, so
      // they are reset to PENDING rather than carried over looking like a valid chain link this
      // mirror does not have: it is never covered by `verifyChain` and makes no tamper-evidence
      // claim. (In this demonstrator, `connected` mode always falls back — see docs/assumptions.md.)
      void connectedAuditAdapter.append({ ...auditEvent, id: `mirror-${id}-${Date.now()}`, scenarioId: state.activeScenario, hash: PENDING_HASH, prevHash: PENDING_HASH })
    }

    if (decision === 'shore_support_requested') {
      get().createShoreCase({
        vesselId: 'own',
        vesselName: state.snapshot.identity.name,
        function: rec.vesselFunction === 'main_engine' || rec.vesselFunction === 'auxiliary_machinery' ? 'technical_support' : rec.vesselFunction === 'safety' ? 'safety_support' : rec.vesselFunction === 'voyage' ? 'fleet_performance' : 'marine_operations',
        priority: rec.riskLevel === 'severe' || rec.riskLevel === 'high' ? 'critical' : rec.riskLevel === 'medium' ? 'warning' : 'advisory',
        reason: rec.detectedCondition,
        requestedExpertise: rec.requiredAuthority.replace(/_/g, ' '),
        recommendationId: rec.id,
      })
    }
  },

  /**
   * The single entry point for every hazard-lifecycle change. It asks `canTransition` — it never
   * decides legality itself — and always writes an audit event, whether the transition succeeds
   * or is refused, with the actor's role, a timestamp and any note (ISM 9.1/9.2).
   */
  transitionHazard: (id, action, actorRole, details) => {
    const state = get()
    const hazard = state.hazards.find((h) => h.id === id)
    if (!hazard) return
    const check = canTransition(hazard, action, actorRole)
    const auditId = state.nextIdCounter + 1
    const timestampIso = state.snapshot.simTimeIso
    const operatingMode = OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode]
    const scenarioId = state.activeScenario === 'normal_operations' ? null : state.activeScenario

    if (!check.allowed) {
      const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
        operatingMode,
        scenarioId,
        kind: 'hazard_lifecycle',
        event: `${actorRole.replace(/_/g, ' ')} attempted to ${HAZARD_ACTION_LABELS[action]} hazard "${hazard.title}" — refused: ${check.reason}`,
        hazardId: hazard.id,
        responsibleRole: actorRole,
        outcome: 'refused',
      })
      set({
        nextIdCounter: auditId,
        nextAuditSeq: auditEvent.seq,
        auditEvents: [auditEvent, ...state.auditEvents],
      })
      return
    }

    let updated: Hazard = { ...hazard, status: check.targetStatus }
    if (action === 'assign') {
      updated = { ...updated, owner: { role: details?.ownerRole ?? actorRole, assignedAtIso: timestampIso } }
    } else if (action === 'record_corrective_action') {
      // Mitigation credit is earned only once a corrective action is actually recorded — reduce
      // frequency (not severity: a crew action changes how often it recurs, not the worst-case
      // outcome) by two index steps, bounded at the FSA minimum.
      const residualFrequencyIndex = Math.max(FREQUENCY_INDEX_MIN, hazard.initialRisk.frequencyIndex - 2)
      updated = {
        ...updated,
        correctiveAction: { description: details?.correctiveActionDescription?.trim() || 'Corrective action recorded.', recordedAtIso: timestampIso, recordedByRole: actorRole },
        residualRisk: buildRiskAssessment(residualFrequencyIndex, hazard.initialRisk.severityIndex),
      }
    } else if (action === 'verify_effectiveness') {
      updated = { ...updated, verification: { note: details?.verificationNote?.trim() || 'Effectiveness verified; no recurrence observed.', verifiedAtIso: timestampIso, verifiedByRole: actorRole } }
    } else if (action === 'escalate') {
      updated = { ...updated, escalation: { escalatedToRole: details?.escalatedToRole ?? 'master', escalatedAtIso: timestampIso, note: details?.note?.trim() || 'Reported to the Company.', preEscalationStatus: hazard.status } }
    } else if (action === 'resume') {
      updated = { ...updated, escalation: undefined }
    }

    const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
      operatingMode,
      scenarioId,
      kind: 'hazard_lifecycle',
      event: `${actorRole.replace(/_/g, ' ')} ${HAZARD_ACTION_PAST_TENSE[action]} hazard "${hazard.title}": ${HAZARD_STATUS_LABELS[hazard.status]} -> ${HAZARD_STATUS_LABELS[updated.status]}.${details?.note ? ` Note: ${details.note}` : ''}`,
      hazardId: hazard.id,
      responsibleRole: actorRole,
      outcome: updated.status,
    })
    set({
      nextIdCounter: auditId,
      nextAuditSeq: auditEvent.seq,
      hazards: state.hazards.map((h) => (h.id === id ? updated : h)),
      auditEvents: [auditEvent, ...state.auditEvents],
    })
  },

  createShoreCase: (input) => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    // Counter-derived, not `shoreCases.length + 1`, which restarts at CASE-0001 after a reset
    // and silently reuses an ID already referenced by retained audit records.
    const caseNumber = state.nextShoreCaseNumber
    const id = `CASE-${String(caseNumber).padStart(4, '0')}`
    const newCase: ShoreCase = {
      id,
      vesselId: input.vesselId,
      vesselName: input.vesselName,
      function: input.function,
      priority: input.priority,
      reason: input.reason,
      requestedExpertise: input.requestedExpertise,
      status: 'requested',
      createdAtIso: state.snapshot.simTimeIso,
      recommendationId: input.recommendationId,
    }
    const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
      scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
      kind: 'shore_case',
      event: `Shore assistance request created: ${id} (${input.function.replace(/_/g, ' ')}, priority ${input.priority}).`,
      outcome: 'Case opened',
    })
    set({
      nextIdCounter: auditId,
      nextAuditSeq: auditEvent.seq,
      nextShoreCaseNumber: caseNumber + 1,
      shoreCases: [newCase, ...state.shoreCases],
      auditEvents: [auditEvent, ...state.auditEvents],
    })
    if (state.pocMode === 'connected') void connectedShoreCaseAdapter.sync(newCase)
  },

  updateShoreCase: (id, status, guidanceNotes) => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    const shoreCase = state.shoreCases.find((c) => c.id === id)
    if (!shoreCase) return
    const updated = { ...shoreCase, status, guidanceNotes: guidanceNotes ?? shoreCase.guidanceNotes }
    const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
      scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
      kind: 'shore_case',
      event: `Shore case ${id} updated to ${status.replace(/_/g, ' ')}.${guidanceNotes ? ` Guidance: ${guidanceNotes}` : ''}`,
      outcome: status,
    })
    set({
      nextIdCounter: auditId,
      nextAuditSeq: auditEvent.seq,
      shoreCases: state.shoreCases.map((c) => (c.id === id ? updated : c)),
      auditEvents: [auditEvent, ...state.auditEvents],
    })
    if (state.pocMode === 'connected') void connectedShoreCaseAdapter.sync(updated)
  },

  setTargetRiskLimits: (limits) => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
      scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
      kind: 'mode_change',
      event: `CPA/TCPA limit pair set to ${limits.cpaLimitNm.toFixed(2)} nm / ${limits.tcpaLimitMinutes} min by operator.`,
      outcome: 'Limits updated',
    })
    set({
      nextIdCounter: auditId,
      nextAuditSeq: auditEvent.seq,
      targetRiskLimits: limits,
      // Re-classify every target's relativeRisk against the new limits immediately, rather than
      // waiting for the next engine tick — while the simulation is paused no further tick runs,
      // which would otherwise leave the navigation badge and CPA alarm showing the old limits'
      // classification indefinitely even though the canvas (which reads targetRiskLimits directly)
      // repaints instantly.
      targets: state.targets.map((t) => ({ ...t, relativeRisk: toRelativeRisk(t.cpaNm, t.tcpaMinutes, limits) })),
      auditEvents: [auditEvent, ...state.auditEvents],
    })
  },

  logAudit: (event, kind = 'mode_change') => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    const auditEvent = buildStoreAuditEvent(state, mintId('AUD', auditId), {
      scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
      kind,
      event,
    })
    set({
      nextIdCounter: auditId,
      nextAuditSeq: auditEvent.seq,
      auditEvents: [auditEvent, ...state.auditEvents],
    })
  },

  sealAuditChain: async () => {
    if (sealInFlight) {
      sealDirty = true // don't drop this trigger — the in-flight pass will loop again for it
      return
    }
    sealInFlight = true
    try {
      // Loop rather than a single pass: a trigger that arrives during the `await` below (another
      // producer allocating a new seq) sets `sealDirty` instead of starting a second overlapping
      // pass. Looping here — after this pass has already committed — picks that trigger back up
      // deterministically, instead of relying on some future unrelated change to `nextAuditSeq` to
      // ever re-trigger sealing.
      do {
        sealDirty = false
        const before = get()
        const { events, checkpoint, sealedAny } = await sealPending(before.auditEvents, before.auditChainCheckpoint)
        if (sealedAny) {
          // The seq range THIS pass newly sealed (as opposed to whatever was already sealed before
          // it started). Used to merge into whatever the CURRENT state is when the commit below
          // actually runs — never write back `events`/`recommendations` themselves: crypto.subtle is
          // async, and the engine tick (or another store action) can append new pending events, or a
          // human can record a decision, during the await. Committing the pre-await snapshot
          // wholesale would silently discard whatever arrived during that window — a record lost
          // with no chain break to show it, or a just-recorded decision reverted to undecided.
          const newlySealed = new Map(events.filter((e) => e.seq > before.auditChainCheckpoint.sealedThroughSeq && e.seq <= checkpoint.sealedThroughSeq).map((e) => [e.seq, e]))
          set((current) => ({
            auditEvents: current.auditEvents.map((e) => newlySealed.get(e.seq) ?? e),
            auditChainCheckpoint: checkpoint,
            recommendations: current.recommendations.map((r) =>
              r.decisionAuditSeq !== undefined && r.decisionAuditHash === undefined && newlySealed.has(r.decisionAuditSeq) ? { ...r, decisionAuditHash: newlySealed.get(r.decisionAuditSeq)!.hash } : r,
            ),
          }))
        }
      } while (sealDirty)
    } finally {
      sealInFlight = false
    }
  },
  }
})

// Triggers a seal pass whenever EITHER producer allocates a new seq — the engine tick (via
// stepIfPlaying) and every store action that writes an audit event all advance `nextAuditSeq`
// exactly once, from the single sequencing point (see buildStoreAuditEvent / engine.ts). A single
// subscription here means a safety-relevant decision recorded while the simulation is PAUSED
// still gets sealed — pausing stops the tick, not audit-writing actions like decideRecommendation
// or transitionHazard, and those are exactly the events most likely to be recorded while paused.
useSimulationStore.subscribe((state, previous) => {
  if (state.nextAuditSeq !== previous.nextAuditSeq) void state.sealAuditChain()
})
// The subscription above only fires on a CHANGE to `nextAuditSeq` — it has no way to know that
// `buildInitialSimulationState` already minted one pending event (seq 1) before this module
// finished loading, let alone before anything else has had a reason to change that counter. In a
// scenario that produces no audit events on its own (e.g. sitting in normal_operations), nothing
// would ever change and that first event would stay pending forever. One explicit kick-off call
// covers it.
void useSimulationStore.getState().sealAuditChain()
