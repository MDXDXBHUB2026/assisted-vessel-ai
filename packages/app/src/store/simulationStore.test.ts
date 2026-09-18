import { beforeEach, describe, expect, it } from 'vitest'
import { useSimulationStore } from './simulationStore'
import { activeIntolerableHazardCategories } from '@ave/decision-engine/hazardLifecycle'

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
    // Precondition: this only holds because the baseline hazard register's open, intolerable-band
    // example is categorised 'cargo' (reefer_monitoring only), never 'navigation', 'machinery' or
    // 'environmental' — all of which voyage_speed_optimisation is sensitive to. If a future edit
    // to `buildBaselineHazards()` opens an intolerable hazard in one of those categories, this
    // assertion fails here with a clear reason instead of `recommendationAccepted` failing opaquely.
    const heldCategories = activeIntolerableHazardCategories(state.hazards)
    expect(heldCategories.some((c) => c === 'navigation' || c === 'machinery' || c === 'environmental')).toBe(false)
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

  it('assigns audit `seq` uniquely and gaplessly across BOTH producers (the engine tick and store actions), including across a reset', () => {
    // Exercise the engine-tick producer (advance ticks audit events via pushAudit inside tick())
    // and several store-action producers (setScenario, decideRecommendation, transitionHazard,
    // createShoreCase) interleaved, then a reset, then more of both — this is exactly the
    // scenario constraint 3 exists for: two producers prepending to one array must still yield a
    // single, unambiguous, gap-free order.
    useSimulationStore.getState().setScenario('engine_degradation')
    advance(260)
    const rec = useSimulationStore.getState().recommendations.find((r) => r.vesselFunction === 'main_engine')
    if (rec) useSimulationStore.getState().decideRecommendation(rec.id, 'accepted', 'ok', 'chief_engineer')
    const hazard = useSimulationStore.getState().hazards[0]
    if (hazard) useSimulationStore.getState().transitionHazard(hazard.id, 'acknowledge', 'master')
    useSimulationStore.getState().createShoreCase({ vesselId: 'own', vesselName: 'Test', function: 'technical_support', priority: 'advisory', reason: 'test', requestedExpertise: 'test' })
    advance(50)
    useSimulationStore.getState().resetEnvironment()
    useSimulationStore.getState().setScenario('collision_risk')
    advance(50)

    const seqs = useSimulationStore
      .getState()
      .auditEvents.map((e) => e.seq)
      .sort((a, b) => a - b)

    expect(new Set(seqs).size).toBe(seqs.length) // unique
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBe(seqs[i - 1]! + 1) // gapless
    }
    expect(seqs[0]).toBe(1) // the very first seq issued, ever
  })

  it('sealAuditChain does not lose a record — or revert a decision — written during its own async await window', async () => {
    // sealAuditChain reads state, awaits real crypto.subtle.digest calls, then commits. If that
    // commit wrote back the pre-await snapshot wholesale (rather than merging into whatever the
    // CURRENT state is by the time the await resolves), anything written during the window —
    // another audit event, or a human decision — would be silently discarded. This test proves
    // the commit is a merge, not an overwrite; it deliberately does NOT assert that sealing has
    // fully caught up by the end (this store's own `advance()` test helper drives many ticks in a
    // tight synchronous loop with no yield point in between, which — across a whole test FILE's
    // cumulative ticks sharing one store instance — can itself starve the sealer far more than
    // any real session ever would; see docs/assumptions.md constraint 2's "expected to keep pace
    // in practice" note. That is a property of this synchronous test harness, not of the fix
    // below, so this test does not depend on it).
    useSimulationStore.getState().setScenario('engine_degradation')
    advance(260)
    const rec = useSimulationStore.getState().recommendations.find((r) => r.vesselFunction === 'main_engine')
    expect(rec).toBeDefined()

    const sealPromise = useSimulationStore.getState().sealAuditChain()
    // Synchronous, before any seal pass's own await resolves: a genuinely new audit event AND a
    // decision on an existing recommendation, exactly like a real interleaving would produce.
    useSimulationStore.getState().logAudit('Interleaved event written during an in-flight seal pass.', 'simulation')
    useSimulationStore.getState().decideRecommendation(rec!.id, 'accepted', 'Decided mid-seal', 'chief_engineer')
    const expectedSeqs = useSimulationStore
      .getState()
      .auditEvents.map((e) => e.seq)
      .sort((a, b) => a - b)

    await sealPromise
    // Give any other in-flight pass (e.g. one already running from the subscription, started
    // before this test's own writes) a few turns to settle too, without requiring it to finish.
    for (let i = 0; i < 5; i++) await useSimulationStore.getState().sealAuditChain()

    const after = useSimulationStore.getState()
    // The interleaved writes themselves were never discarded by any seal commit.
    expect(after.auditEvents.map((e) => e.seq).sort((a, b) => a - b)).toEqual(expectedSeqs)
    const decided = after.recommendations.find((r) => r.id === rec!.id)!
    expect(decided.status).toBe('accepted')
    expect(decided.decisionComment).toBe('Decided mid-seal')
  })

  it('a seal trigger arriving while a pass is already in flight is queued, not dropped', async () => {
    // A safety review found that the old guard ("if a pass is already running, just return")
    // silently DROPPED any trigger that arrived mid-pass, rather than queueing it — and because
    // `verifyChain` excludes pending records entirely, a dropped trigger for the LAST seq issued
    // in a session (nothing afterwards to re-trigger sealing) left that record permanently outside
    // the tamper-evidence envelope: forever pending, "Chain Verified" showing right next to it.
    //
    // The shore-support branch of decideRecommendation is a real, deterministic repro: it writes
    // TWO audit events synchronously (the decision, then the shore case it opens — see
    // decideRecommendation / createShoreCase), each bumping `nextAuditSeq` and so each notifying
    // the module-level `nextAuditSeq` subscription synchronously inside `set()`. The second
    // trigger therefore fires before the first seal pass's own first `await` has had any chance
    // to resolve — exactly the interleaving the bug was found under.
    useSimulationStore.getState().setScenario('engine_degradation')
    advance(260)
    const rec = useSimulationStore.getState().recommendations.find((r) => r.vesselFunction === 'main_engine')!

    useSimulationStore.getState().decideRecommendation(rec.id, 'shore_support_requested', 'Need technical superintendent input', 'chief_engineer')
    const headSeq = Math.max(...useSimulationStore.getState().auditEvents.map((e) => e.seq))

    // Poll rather than a fixed number of retries: real crypto.subtle digests take genuine,
    // variable async time under the test runner, and nothing else in this test will ever change
    // `nextAuditSeq` again to re-trigger sealing — with the bug, this would time out; with the
    // fix, the in-flight pass's own internal retry loop catches up on its own.
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline && useSimulationStore.getState().auditChainCheckpoint.sealedThroughSeq < headSeq) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    expect(useSimulationStore.getState().auditChainCheckpoint.sealedThroughSeq).toBe(headSeq)
    expect(useSimulationStore.getState().auditEvents.some((e) => e.hash === '')).toBe(false)
  }, 10_000)

  it('backfills decisionAuditHash once the sealer reaches the decision\'s seq', async () => {
    // decisionAuditHash is written exactly once, by sealAuditChain's backfill (simulationStore.ts)
    // — a safety review noted nothing else in the codebase reads it, so a regression here (the
    // backfill silently stops matching, or never fires) would go unnoticed without this test.
    useSimulationStore.getState().setScenario('engine_degradation')
    advance(260)
    const rec = useSimulationStore.getState().recommendations.find((r) => r.vesselFunction === 'main_engine')!

    useSimulationStore.getState().decideRecommendation(rec.id, 'accepted', 'Reviewed and accepted', 'chief_engineer')
    const decidedSeq = useSimulationStore.getState().recommendations.find((r) => r.id === rec.id)!.decisionAuditSeq
    expect(decidedSeq).toBeDefined()

    const deadline = Date.now() + 5_000
    while (Date.now() < deadline && useSimulationStore.getState().auditChainCheckpoint.sealedThroughSeq < decidedSeq!) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    const decided = useSimulationStore.getState().recommendations.find((r) => r.id === rec.id)!
    const capturedEvent = useSimulationStore.getState().auditEvents.find((e) => e.seq === decidedSeq)!
    expect(decided.decisionAuditHash).toBeDefined()
    expect(decided.decisionAuditHash).toBe(capturedEvent.hash)
  }, 10_000)

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
