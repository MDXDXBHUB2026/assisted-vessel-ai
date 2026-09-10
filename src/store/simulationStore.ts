import { create } from 'zustand'
import type { OperationalMode, PocExecutionMode, RequiredAuthority, ScenarioId, ShoreCase, ShoreFunction } from '@/types'
import { OPERATIONAL_MODE_LABELS } from '@/types'
import { buildInitialSimulationState, type AdapterStatuses, type SimulationState } from '@/simulation/state'
import { tick } from '@/simulation/engine'
import { readStoredPocMode, writeStoredPocMode } from '@/services/pocMode'
import { resolveTelemetryAdapter } from '@/services/adapters/telemetryAdapter'
import { resolveWeatherAdapter } from '@/services/adapters/weatherAdapter'
import { resolveSystemHealthAdapter } from '@/services/adapters/systemHealthAdapter'
import { resolveDocumentSearchAdapter } from '@/services/adapters/documentSearchAdapter'
import { connectedAuditAdapter } from '@/services/adapters/auditAdapter'
import { connectedShoreCaseAdapter } from '@/services/adapters/shoreCaseAdapter'

export const BASE_DT_MINUTES_PER_SECOND = 0.5

interface SimulationStore extends SimulationState {
  stepIfPlaying: (elapsedSeconds: number) => void
  play: () => void
  pause: () => void
  setSpeed: (multiplier: number) => void
  resetEnvironment: () => void
  setScenario: (scenario: ScenarioId) => void
  setOperationalMode: (mode: OperationalMode) => void
  setVoyageSpeed: (speedKn: number | null) => void
  acceptVoyageRecommendation: () => void

  setPocMode: (mode: PocExecutionMode) => void
  probeConnectedAdapters: () => Promise<void>

  decideRecommendation: (
    id: string,
    decision: 'accepted' | 'modified' | 'rejected' | 'info_requested' | 'shore_support_requested',
    comment: string,
    role: RequiredAuthority,
  ) => void

  updateHazardStatus: (id: string, status: 'acknowledged' | 'assigned' | 'investigating' | 'escalated' | 'closed', note?: string) => void

  createShoreCase: (input: { vesselId: string; vesselName: string; function: ShoreFunction; priority: 'healthy' | 'advisory' | 'warning' | 'critical'; reason: string; requestedExpertise: string; recommendationId?: string }) => void
  updateShoreCase: (id: string, status: ShoreCase['status'], guidanceNotes?: string) => void

  logAudit: (event: string, kind?: 'mode_change' | 'shore_case') => void
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
    const fresh = buildInitialSimulationState()
    const prevAudit = get().auditEvents
    const pocMode = get().pocMode
    set({
      ...fresh,
      pocMode,
      auditEvents: [
        {
          id: `AUD-RESET-${Date.now()}`,
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

  setScenario: (scenario) => {
    const state = get()
    set({
      activeScenario: scenario,
      scenarioElapsedMinutes: 0,
      scenarioTriggers: {},
      auditEvents: [
        {
          id: `AUD-SCN-${Date.now()}`,
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
    set({
      snapshot: { ...state.snapshot, operationalMode: mode },
      auditEvents: [
        {
          id: `AUD-MODE-${Date.now()}`,
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

  acceptVoyageRecommendation: () => {
    const state = get()
    set({
      voyagePlan: { ...state.voyagePlan, recommendationAccepted: true, userModifiedSpeedKn: state.voyagePlan.recommendedSpeedKn },
      auditEvents: [
        {
          id: `AUD-VOY-${Date.now()}`,
          timestampIso: state.snapshot.simTimeIso,
          operatingMode: OPERATIONAL_MODE_LABELS[state.snapshot.operationalMode],
          scenarioId: state.activeScenario === 'normal_operations' ? null : state.activeScenario,
          kind: 'human_decision',
          event: 'Master accepted recommended voyage speed profile — L3 supervised execution: speed profile applied following explicit authorisation.',
          humanDecision: 'accepted',
          responsibleRole: 'master',
          outcome: 'Recommended speed adopted',
        },
        ...state.auditEvents,
      ],
    })
  },

  setPocMode: (mode) => {
    writeStoredPocMode(mode)
    const state = get()
    set({
      pocMode: mode,
      adapterStatuses: mode === 'offline'
        ? { telemetry: 'simulated', weather: 'simulated', copilot: 'simulated', documents: 'simulated', systemHealthApi: 'simulated', audit: 'simulated', shoreCases: 'simulated' }
        : { ...state.adapterStatuses, telemetry: 'connecting', weather: 'connecting', copilot: 'connecting', documents: 'connecting', systemHealthApi: 'connecting', audit: 'connecting', shoreCases: 'connecting' },
      auditEvents: [
        {
          id: `AUD-POC-${Date.now()}`,
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
    // Only apply if still in connected mode (user may have switched back to offline meanwhile).
    if (get().pocMode === 'connected') set({ adapterStatuses: next })
  },

  decideRecommendation: (id, decision, comment, role) => {
    const state = get()
    const rec = state.recommendations.find((r) => r.id === id)
    if (!rec) return
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
          id: `AUD-DEC-${Date.now()}`,
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
    const hazard = state.hazards.find((h) => h.id === id)
    if (!hazard) return
    set({
      hazards: state.hazards.map((h) => (h.id === id ? { ...h, status } : h)),
      auditEvents: [
        {
          id: `AUD-HAZ-${Date.now()}`,
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
    const id = `CASE-${String(state.shoreCases.length + 1).padStart(4, '0')}`
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
      shoreCases: [newCase, ...state.shoreCases],
      auditEvents: [
        {
          id: `AUD-CASE-${Date.now()}`,
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
    const shoreCase = state.shoreCases.find((c) => c.id === id)
    if (!shoreCase) return
    const updated = { ...shoreCase, status, guidanceNotes: guidanceNotes ?? shoreCase.guidanceNotes }
    set({
      shoreCases: state.shoreCases.map((c) => (c.id === id ? updated : c)),
      auditEvents: [
        {
          id: `AUD-CASE-${Date.now()}`,
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

  logAudit: (event, kind = 'mode_change') => {
    const state = get()
    set({
      auditEvents: [
        {
          id: `AUD-LOG-${Date.now()}`,
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
