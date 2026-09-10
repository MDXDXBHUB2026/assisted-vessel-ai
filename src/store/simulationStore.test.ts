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
