import { create } from 'zustand'
import type { AuditEventKind, OperationalMode, PocExecutionMode, RequiredAuthority, ScenarioId, ShoreCase, ShoreFunction } from '@/types'
import type { TargetRiskLimits } from '@/decision-engine/targetRisk'
import { assistanceLevelRank, OPERATIONAL_MODE_LABELS } from '@/types'
import { buildInitialSimulationState, type AdapterStatuses, type SimulationState } from '@/simulation/state'
import { tick } from '@/simulation/engine'
import { toRelativeRisk } from '@/simulation/navigation'
import { validateRecommendation } from '@/safety-engine/validate'
import { assessOdd } from '@/safety-engine/oddEngine'
import { DEMO_VOYAGE_PHASES } from '@/simulation/demoVoyage'
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

  updateHazardStatus: (id: string, status: 'acknowledged' | 'assigned' | 'investigating' | 'escalated' | 'closed', note?: string) => void

  setTargetRiskLimits: (limits: TargetRiskLimits) => void

  createShoreCase: (input: { vesselId: string; vesselName: string; function: ShoreFunction; priority: 'healthy' | 'advisory' | 'warning' | 'critical'; reason: string; requestedExpertise: string; recommendationId?: string }) => void
  updateShoreCase: (id: string, status: ShoreCase['status'], guidanceNotes?: string) => void

  logAudit: (event: string, kind?: AuditEventKind) => void
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  ...buildInitialSimulationState(),
  pocMode: readStoredPocMode(),

  stepIfPlaying: (elapsedSeconds) => {
    const state = get()
    if (!state.isPlaying) return
    set(tick(state, BASE_DT_MINUTES_PER_SECOND * elapsedSeconds))
  },

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  setSpeed: (multiplier) => set({ speedMultiplier: multiplier }),

  resetEnvironment: () => {
    // Continue the ID sequence. RESET ENVIRONMENT deliberately retains the prior audit trail, so
    // restarting the counter would mint IDs colliding with records already in it.
    const carried = get().nextIdCounter
    const fresh = buildInitialSimulationState(carried + 1, get().nextShoreCaseNumber)
    const prevAudit = get().auditEvents
    const pocMode = get().pocMode
    const targetRiskLimits = get().targetRiskLimits
    set({
      ...fresh,
      pocMode,
      targetRiskLimits,
      nextIdCounter: fresh.nextIdCounter + 1,
      auditEvents: [
        {
          id: mintId('AUD', fresh.nextIdCounter + 1),
          timestampIso: fresh.snapshot.simTimeIso,
          operatingMode: OPERATIONAL_MODE_LABELS[fresh.snapshot.operationalMode],
          scenarioId: null,
          kind: 'simulation',
          event: 'Environment reset to baseline synthetic operating condition by operator.',
          outcome: 'Normal',
        },
        ...prevAudit,
      ],
    })
    void get().probeConnectedAdapters()
  },

  startDemoVoyage: () => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    const first = DEMO_VOYAGE_PHASES[0]!
    set({
      nextIdCounter: auditId,
      activeScenario: first.scenario,
      scenarioElapsedMinutes: 0,
      scenarioTriggers: {},
      demoVoyage: { active: true, phaseIndex: 0, phaseElapsedMinutes: 0 },
      isPlaying: true,
      auditEvents: [
        {
          id: mintId('AUD', auditId),
          timestampIso: state.snapshot.simTimeIso,
          operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
          scenarioId: first.scenario,
          kind: 'scenario',
          event: `Demo Voyage started: "${first.title}".`,
          outcome: 'started',
        },
        ...state.auditEvents,
      ],
    })
  },

  skipToPhase: (index) => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    const phase = DEMO_VOYAGE_PHASES[index]
    if (!phase) return
    set({
      nextIdCounter: auditId,
      activeScenario: phase.scenario,
      scenarioElapsedMinutes: 0,
      scenarioTriggers: {},
      demoVoyage: { active: true, phaseIndex: index, phaseElapsedMinutes: 0 },
      auditEvents: [
        {
          id: mintId('AUD', auditId),
          timestampIso: state.snapshot.simTimeIso,
          operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
          scenarioId: phase.scenario,
          kind: 'scenario',
          event: `Demo Voyage skipped to phase: "${phase.title}".`,
          outcome: 'phase_skipped',
        },
        ...state.auditEvents,
      ],
    })
  },

  resetDemoVoyage: () => {
    set({ demoVoyage: { active: false, phaseIndex: 0, phaseElapsedMinutes: 0 } })
    get().resetEnvironment()
  },

  setScenario: (scenario) => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    set({
      nextIdCounter: auditId,
      activeScenario: scenario,
      scenarioElapsedMinutes: 0,
      scenarioTriggers: {},
      demoVoyage: { ...state.demoVoyage, active: false },
      auditEvents: [
        {
          id: mintId('AUD', auditId),
          timestampIso: state.snapshot.simTimeIso,
          operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
          scenarioId: scenario === 'normal_operations' ? null : scenario,
          kind: 'scenario',
          event: `Scenario activated: ${scenario.replace(/_/g, ' ')}.`,
          outcome: 'Activated',
        },
        ...state.auditEvents,
      ],
    })
  },

  setOperationalMode: (mode) => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    set({
      nextIdCounter: auditId,
      snapshot: { ...state.snapshot, operationalMode: mode },
      auditEvents: [
        {
          id: mintId('AUD', auditId),
          timestampIso: state.snapshot.simTimeIso,
          operatingMode: OPERATIONAL_MODE_LABELS[mode],
          scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
          kind: 'mode_change',
          event: `Operational mode changed to ${OPERATIONAL_MODE_LABELS[mode]}.`,
          outcome: OPERATIONAL_MODE_LABELS[mode],
        },
        ...state.auditEvents,
      ],
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
    const odd = assessOdd(functionId, state.snapshot)
    const validation = validateRecommendation({
      functionId,
      snapshot: state.snapshot,
      riskLevel: 'medium',
      requiredAuthority: role,
    })

    const belowL3 = assistanceLevelRank(odd.availableAssistanceLevel) < assistanceLevelRank('L3')
    const refusedReason =
      validation.verdict === 'blocked'
        ? validation.reason ?? 'Safety validation blocked this action.'
        : belowL3
          ? `Supervised execution requires L3; only ${odd.availableAssistanceLevel} is available (${odd.assistanceLimitingReason ?? 'conditions outside the operational envelope'}).`
          : undefined

    if (refusedReason) {
      set({
        nextIdCounter: auditId,
        auditEvents: [
          {
            id: mintId('AUD', auditId),
            timestampIso: state.snapshot.simTimeIso,
            operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
            scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
            kind: 'safety_validation',
            event: `Voyage speed adoption REFUSED by the safety layer: ${refusedReason}`,
            humanDecision: 'rejected',
            responsibleRole: role,
            safetyValidationResult: validation.verdict,
            outcome: 'Refused — speed profile not applied',
          },
          ...state.auditEvents,
        ],
      })
      return
    }

    set({
      nextIdCounter: auditId,
      voyagePlan: { ...state.voyagePlan, recommendationAccepted: true, userModifiedSpeedKn: state.voyagePlan.recommendedSpeedKn },
      auditEvents: [
        {
          id: mintId('AUD', auditId),
          timestampIso: state.snapshot.simTimeIso,
          operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
          scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
          kind: 'human_decision',
          event: `${role.replace(/_/g, ' ')} authorised the recommended voyage speed profile — L3 supervised execution (safety validation ${validation.verdict.toUpperCase()}, assistance level ${odd.availableAssistanceLevel}).`,
          humanDecision: 'accepted',
          responsibleRole: role,
          safetyValidationResult: validation.verdict,
          outcome: 'Recommended speed adopted',
        },
        ...state.auditEvents,
      ],
    })
  },

  setPocMode: (mode) => {
    writeStoredPocMode(mode)
    const state = get()
    const auditId = state.nextIdCounter + 1
    set({
      nextIdCounter: auditId,
      pocMode: mode,
      adapterStatuses: mode === 'offline'
        ? { telemetry: 'simulated', weather: 'simulated', copilot: 'simulated', documents: 'simulated', systemHealthApi: 'simulated', audit: 'simulated', shoreCases: 'simulated' }
        : { ...state.adapterStatuses, telemetry: 'connecting', weather: 'connecting', copilot: 'connecting', documents: 'connecting', systemHealthApi: 'connecting', audit: 'connecting', shoreCases: 'connecting' },
      auditEvents: [
        {
          id: mintId('AUD', auditId),
          timestampIso: state.snapshot.simTimeIso,
          operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
          scenarioId: null,
          kind: 'simulation',
          event: `POC execution mode set to ${mode.toUpperCase()}.`,
          outcome: mode,
        },
        ...state.auditEvents,
      ],
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
      set({
        nextIdCounter: auditId,
        auditEvents: [
          {
            id: mintId('AUD', auditId),
            timestampIso: state.snapshot.simTimeIso,
            operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
            scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
            kind: 'safety_validation',
            event: `Attempt to ${decision === 'accepted' ? 'accept' : 'modify'} a BLOCKED recommendation "${rec.title}" was refused by the safety layer.`,
            recommendationId: id,
            responsibleRole: role,
            safetyValidationResult: 'blocked',
            outcome: 'Refused — recommendation is not executable',
          },
          ...state.auditEvents,
        ],
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

    set({
      nextIdCounter: auditId,
      recommendations: state.recommendations.map((r) =>
        r.id === id
          ? {
              ...r,
              status: decision,
              decisionComment: comment,
              decidedByRole: role,
              decidedAtIso: state.snapshot.simTimeIso,
              outcome,
            }
          : r,
      ),
      auditEvents: [
        {
          id: mintId('AUD', auditId),
          timestampIso: state.snapshot.simTimeIso,
          operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
          scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
          kind: 'human_decision',
          event: `Decision recorded for "${rec.title}": ${decision.replace(/_/g, ' ')}.`,
          recommendationId: id,
          humanDecision: decision,
          decisionComment: comment,
          responsibleRole: role,
          outcome,
        },
        ...state.auditEvents,
      ],
    })

    if (state.pocMode === 'connected') {
      void connectedAuditAdapter.append({
        id: `mirror-${id}-${Date.now()}`,
        timestampIso: state.snapshot.simTimeIso,
        operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
        scenarioId: state.activeScenario,
        kind: 'human_decision',
        event: `Decision recorded for "${rec.title}": ${decision.replace(/_/g, ' ')}.`,
        recommendationId: id,
        humanDecision: decision,
        outcome,
      })
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

  updateHazardStatus: (id, status, note) => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    const hazard = state.hazards.find((h) => h.id === id)
    if (!hazard) return
    set({
      nextIdCounter: auditId,
      hazards: state.hazards.map((h) => (h.id === id ? { ...h, status } : h)),
      auditEvents: [
        {
          id: mintId('AUD', auditId),
          timestampIso: state.snapshot.simTimeIso,
          operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
          scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
          kind: 'human_decision',
          event: `Hazard "${hazard.title}" status set to ${status}.${note ? ` Note: ${note}` : ''}`,
          outcome: status,
        },
        ...state.auditEvents,
      ],
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
    set({
      nextIdCounter: auditId,
      nextShoreCaseNumber: caseNumber + 1,
      shoreCases: [newCase, ...state.shoreCases],
      auditEvents: [
        {
          id: mintId('AUD', auditId),
          timestampIso: state.snapshot.simTimeIso,
          operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
          scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
          kind: 'shore_case',
          event: `Shore assistance request created: ${id} (${input.function.replace(/_/g, ' ')}, priority ${input.priority}).`,
          outcome: 'Case opened',
        },
        ...state.auditEvents,
      ],
    })
    if (state.pocMode === 'connected') void connectedShoreCaseAdapter.sync(newCase)
  },

  updateShoreCase: (id, status, guidanceNotes) => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    const shoreCase = state.shoreCases.find((c) => c.id === id)
    if (!shoreCase) return
    const updated = { ...shoreCase, status, guidanceNotes: guidanceNotes ?? shoreCase.guidanceNotes }
    set({
      nextIdCounter: auditId,
      shoreCases: state.shoreCases.map((c) => (c.id === id ? updated : c)),
      auditEvents: [
        {
          id: mintId('AUD', auditId),
          timestampIso: state.snapshot.simTimeIso,
          operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
          scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
          kind: 'shore_case',
          event: `Shore case ${id} updated to ${status.replace(/_/g, ' ')}.${guidanceNotes ? ` Guidance: ${guidanceNotes}` : ''}`,
          outcome: status,
        },
        ...state.auditEvents,
      ],
    })
    if (state.pocMode === 'connected') void connectedShoreCaseAdapter.sync(updated)
  },

  setTargetRiskLimits: (limits) => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    set({
      nextIdCounter: auditId,
      targetRiskLimits: limits,
      // Re-classify every target's relativeRisk against the new limits immediately, rather than
      // waiting for the next engine tick — while the simulation is paused no further tick runs,
      // which would otherwise leave the navigation badge and CPA alarm showing the old limits'
      // classification indefinitely even though the canvas (which reads targetRiskLimits directly)
      // repaints instantly.
      targets: state.targets.map((t) => ({ ...t, relativeRisk: toRelativeRisk(t.cpaNm, t.tcpaMinutes, limits) })),
      auditEvents: [
        {
          id: mintId('AUD', auditId),
          timestampIso: state.snapshot.simTimeIso,
          operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
          scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
          kind: 'mode_change',
          event: `CPA/TCPA limit pair set to ${limits.cpaLimitNm.toFixed(2)} nm / ${limits.tcpaLimitMinutes} min by operator.`,
          outcome: 'Limits updated',
        },
        ...state.auditEvents,
      ],
    })
  },

  logAudit: (event, kind = 'mode_change') => {
    const state = get()
    const auditId = state.nextIdCounter + 1
    set({
      nextIdCounter: auditId,
      auditEvents: [
        {
          id: mintId('AUD', auditId),
          timestampIso: state.snapshot.simTimeIso,
          operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
          scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
          kind,
          event,
        },
        ...state.auditEvents,
      ],
    })
  },
}))
