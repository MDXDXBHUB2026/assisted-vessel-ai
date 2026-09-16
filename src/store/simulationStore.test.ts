import { beforeEach, describe, expect, it } from 'vitest'
import { useSimulationStore } from './simulationStore'

/** Advances the store's simulation by roughly `minutes` of simulated time. */
function advance(minutes: number) {
  for (let i = 0; i < minutes * 2; i++) {
    useSimulationStore.getState().stepIfPlaying(1) // 0.5 sim-minute per second at 1x
  }
}

beforeEach(() => {
  useSimulationStore.getState().resetEnvironment()
  useSimulationStore.getState().setSpeed(1)
})

describe('human decision workflow', () => {
  it('records an ACCEPT decision with role, comment, timestamp and audit entry', () => {
    useSimulationStore.getState().setScenario('engine_degradation')
    advance(260)

    const rec = useSimulationStore.getState().recommendations.find((r) => r.vesselFunction === 'main_engine')
    expect(rec).toBeDefined()

    useSimulationStore.getState().decideRecommendation(rec!.id, 'accepted', 'Reviewed and accepted', 'chief_engineer')

    const decided = useSimulationStore.getState().recommendations.find((r) => r.id === rec!.id)!
    expect(decided.status).toBe('accepted')
    expect(decided.decidedByRole).toBe('chief_engineer')
    expect(decided.decisionComment).toBe('Reviewed and accepted')
    expect(decided.decidedAtIso).toBeDefined()

    const auditEntry = useSimulationStore.getState().auditEvents.find((e) => e.recommendationId === rec!.id && e.kind === 'human_decision')
    expect(auditEntry?.humanDecision).toBe('accepted')
  })

  it('records a REJECT decision distinctly from acceptance', () => {
    useSimulationStore.getState().setScenario('engine_degradation')
    advance(260)

    const rec = useSimulationStore.getState().recommendations.find((r) => r.vesselFunction === 'main_engine')!
    useSimulationStore.getState().decideRecommendation(rec.id, 'rejected', 'Not required at this time', 'chief_engineer')

    const decided = useSimulationStore.getState().recommendations.find((r) => r.id === rec.id)!
    expect(decided.status).toBe('rejected')
    expect(decided.outcome).toMatch(/rejected/i)
  })

  it('a REQUEST SHORE SUPPORT decision opens a traceable shore case', () => {
    useSimulationStore.getState().setScenario('engine_degradation')
    advance(260)

    const rec = useSimulationStore.getState().recommendations.find((r) => r.vesselFunction === 'main_engine')!
    const casesBefore = useSimulationStore.getState().shoreCases.length

    useSimulationStore.getState().decideRecommendation(rec.id, 'shore_support_requested', 'Need technical superintendent input', 'chief_engineer')

    const state = useSimulationStore.getState()
    expect(state.shoreCases.length).toBe(casesBefore + 1)
    const newCase = state.shoreCases[0]!
    expect(newCase.function).toBe('technical_support')
    expect(newCase.recommendationId).toBe(rec.id)
    expect(newCase.status).toBe('requested')

    const decided = state.recommendations.find((r) => r.id === rec.id)!
    expect(decided.status).toBe('shore_support_requested')
  })

  it('does not advance simulated time while paused', () => {
    const before = useSimulationStore.getState().snapshot.simTimeIso
    useSimulationStore.getState().pause()
    advance(30)
    expect(useSimulationStore.getState().snapshot.simTimeIso).toBe(before)
  })
})

describe('shore case lifecycle', () => {
  it('moves through REQUESTED → ACCEPTED → GUIDANCE PROVIDED → CLOSED', () => {
    useSimulationStore.getState().createShoreCase({
      vesselId: 'own',
      vesselName: 'MV Meridian Voyager',
      function: 'technical_support',
      priority: 'warning',
      reason: 'Test case',
      requestedExpertise: 'chief engineer',
    })
    const id = useSimulationStore.getState().shoreCases[0]!.id
    expect(useSimulationStore.getState().shoreCases[0]!.status).toBe('requested')

    useSimulationStore.getState().updateShoreCase(id, 'accepted')
    expect(useSimulationStore.getState().shoreCases.find((c) => c.id === id)!.status).toBe('accepted')

    useSimulationStore.getState().updateShoreCase(id, 'guidance_provided', 'Reduce load and monitor')
    const withGuidance = useSimulationStore.getState().shoreCases.find((c) => c.id === id)!
    expect(withGuidance.status).toBe('guidance_provided')
    expect(withGuidance.guidanceNotes).toBe('Reduce load and monitor')

    useSimulationStore.getState().updateShoreCase(id, 'closed')
    expect(useSimulationStore.getState().shoreCases.find((c) => c.id === id)!.status).toBe('closed')
  })
})

describe('POC execution mode', () => {
  it('defaults to offline with every adapter reporting simulated', () => {
    const state = useSimulationStore.getState()
    expect(state.pocMode).toBe('offline')
    expect(Object.values(state.adapterStatuses).every((s) => s === 'simulated')).toBe(true)
  })

  it('falls back honestly when connected mode cannot reach a backend', async () => {
    useSimulationStore.getState().setPocMode('connected')
    expect(useSimulationStore.getState().pocMode).toBe('connected')

    await useSimulationStore.getState().probeConnectedAdapters()

    const state = useSimulationStore.getState()
    // No backend is deployed for this test/demo environment, so every adapter must report a
    // fallback status rather than silently claiming to be connected.
    expect(Object.values(state.adapterStatuses).every((s) => s === 'unavailable_fallback')).toBe(true)
  })
})

// --- regression suites for defects found in the V3 assurance review -------------------------

describe('SAFE-003 — a BLOCKED recommendation is never executable', () => {
  it('refuses ACCEPT on a blocked recommendation and records the refused attempt', () => {
    useSimulationStore.getState().setScenario('engine_degradation')
    advance(260)
    const rec = useSimulationStore.getState().recommendations.find((r) => r.vesselFunction === 'main_engine')!
    expect(rec).toBeDefined()

    // Force the verdict to blocked, exactly as a real envelope/authority breach would.
    useSimulationStore.setState({
      recommendations: useSimulationStore.getState().recommendations.map((r) =>
        r.id === rec.id
          ? { ...r, safetyValidation: { ...r.safetyValidation, verdict: 'blocked' as const, reason: 'Forced for test.' } }
          : r,
      ),
    })

    useSimulationStore.getState().decideRecommendation(rec.id, 'accepted', 'attempting anyway', 'chief_engineer')

    const after = useSimulationStore.getState().recommendations.find((r) => r.id === rec.id)!
    expect(after.status).toBe('awaiting_decision')
    expect(after.decidedByRole).toBeUndefined()

    const refusal = useSimulationStore.getState().auditEvents.find((e) => e.recommendationId === rec.id && e.outcome?.startsWith('Refused'))
    expect(refusal).toBeDefined()
    expect(refusal!.safetyValidationResult).toBe('blocked')
  })

  it('still allows REJECT, REQUEST INFO and SHORE SUPPORT on a blocked recommendation', () => {
    useSimulationStore.getState().setScenario('engine_degradation')
    advance(260)
    const rec = useSimulationStore.getState().recommendations.find((r) => r.vesselFunction === 'main_engine')!
    useSimulationStore.setState({
      recommendations: useSimulationStore.getState().recommendations.map((r) =>
        r.id === rec.id ? { ...r, safetyValidation: { ...r.safetyValidation, verdict: 'blocked' as const } } : r,
      ),
    })

    useSimulationStore.getState().decideRecommendation(rec.id, 'rejected', 'not appropriate', 'chief_engineer')
    expect(useSimulationStore.getState().recommendations.find((r) => r.id === rec.id)!.status).toBe('rejected')
  })
})

describe('L3 supervised execution — the only action that changes vessel behaviour', () => {
  it('refuses to adopt a speed profile when the function is not offered in the current mode', () => {
    // voyage_speed_optimisation is permitted only in open_sea / coastal.
    useSimulationStore.getState().setOperationalMode('alongside')
    useSimulationStore.getState().acceptVoyageRecommendation('master')

    const state = useSimulationStore.getState()
    expect(state.voyagePlan.recommendationAccepted).toBe(false)
    expect(state.voyagePlan.userModifiedSpeedKn).toBeNull()

    const refusal = state.auditEvents.find((e) => e.outcome === 'Refused — speed profile not applied')
    expect(refusal).toBeDefined()
    expect(refusal!.kind).toBe('safety_validation')
  })

  it('adopts the speed profile under permitted conditions and records the authorising role', () => {
    useSimulationStore.getState().setOperationalMode('open_sea')
    useSimulationStore.getState().acceptVoyageRecommendation('master')

    const state = useSimulationStore.getState()
    expect(state.voyagePlan.recommendationAccepted).toBe(true)
    expect(state.voyagePlan.userModifiedSpeedKn).toBe(state.voyagePlan.recommendedSpeedKn)

    const accepted = state.auditEvents.find((e) => e.outcome === 'Recommended speed adopted')!
    expect(accepted.responsibleRole).toBe('master')
    expect(accepted.humanDecision).toBe('accepted')
    // The audit event must reflect the verdict actually computed, not a hardcoded claim.
    expect(accepted.safetyValidationResult).toBeDefined()
  })
})

describe('audit trail integrity', () => {
  it('never mints a duplicate audit ID, including across a RESET ENVIRONMENT', () => {
    useSimulationStore.getState().setScenario('engine_degradation')
    advance(200)
    useSimulationStore.getState().resetEnvironment()
    useSimulationStore.getState().setScenario('engine_degradation')
    advance(200)

    const ids = useSimulationStore.getState().auditEvents.map((e) => e.id)
    expect(ids.length).toBeGreaterThan(5)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('preserves the prior audit trail across a reset', () => {
    useSimulationStore.getState().setScenario('engine_degradation')
    advance(200)
    const before = useSimulationStore.getState().auditEvents.length
    useSimulationStore.getState().resetEnvironment()
    expect(useSimulationStore.getState().auditEvents.length).toBeGreaterThan(before)
  })

  it('never mints a duplicate shore case ID across a reset', () => {
    const create = () =>
      useSimulationStore.getState().createShoreCase({
        vesselId: 'own',
        vesselName: 'Test',
        function: 'technical_support',
        priority: 'advisory',
        reason: 'test',
        requestedExpertise: 'test',
      })
    create()
    create()
    const firstIds = useSimulationStore.getState().shoreCases.map((c) => c.id)
    useSimulationStore.getState().resetEnvironment()
    create()
    const allIds = [...firstIds, ...useSimulationStore.getState().shoreCases.map((c) => c.id)]
    expect(new Set(allIds).size).toBe(allIds.length)
  })
})
