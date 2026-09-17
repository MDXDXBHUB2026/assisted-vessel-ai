import { describe, expect, it } from 'vitest'
import { tick } from './engine'
import { buildInitialSimulationState, type SimulationState } from './state'
import { assessOdd } from '@ave/safety-engine/oddEngine'
import { correlateAlarms } from '@ave/decision-engine/alarmCorrelation'
import { activeIntolerableHazardCategories } from '@ave/decision-engine/hazardLifecycle'
import type { ScenarioId } from '@ave/core-domain/types'

/** Runs the engine forward by a fixed number of 1-minute ticks, simulating the scenario ramp. */
function runScenario(scenario: ScenarioId, minutes: number, speedMultiplier = 1): SimulationState {
  let state: SimulationState = { ...buildInitialSimulationState(), activeScenario: scenario, speedMultiplier }
  for (let i = 0; i < minutes; i++) {
    state = tick(state, 1)
  }
  return state
}

describe('ENGINE DEGRADATION scenario — full sense-to-audit chain', () => {
  it('gradually deteriorates telemetry, raises alarms, generates a Chief-Engineer recommendation, and audits every step', () => {
    const state = runScenario('engine_degradation', 260)

    // Precondition, not incidental: this test's `passed`/`inside` assertions below only hold
    // because the baseline hazard register's open, intolerable-band example is categorised
    // 'cargo' (affecting reefer_monitoring only), never 'machinery' or 'navigation'. If a future
    // edit to `buildBaselineHazards()` adds an open intolerable hazard in either category, this
    // assertion fails here with a clear reason instead of the two assertions below failing
    // opaquely from an unrelated-looking cause.
    expect(activeIntolerableHazardCategories(state.hazards)).not.toContain('machinery')

    // sense/understand: telemetry has genuinely moved and history was recorded
    expect(state.snapshot.mainEngine.exhaustTempDeviationC).toBeGreaterThan(10)
    expect(state.telemetryHistory.exhaustTempDeviationC.values.length).toBeGreaterThan(10)
    expect(state.machineryAnalysis.anomalyScore).toBeGreaterThan(30)

    // detection: main engine system state has degraded
    const engineHealth = state.snapshot.systemHealth.find((s) => s.area === 'main_engine')!
    expect(['degraded', 'contingency']).toContain(engineHealth.state)

    // alarms
    expect(state.rawAlarms.some((a) => a.tag === 'ME_EXHAUST_HI' && a.active)).toBe(true)

    // recommendation + safety validation
    const rec = state.recommendations.find((r) => r.vesselFunction === 'main_engine')
    expect(rec).toBeDefined()
    expect(rec!.requiredAuthority).toBe('chief_engineer')
    expect(rec!.status).toBe('awaiting_decision')
    // Assert the actual verdict, not merely that it is a member of its own union type (which
    // the type system already guarantees and which therefore verifies nothing). Under nominal
    // environmental conditions a machinery recommendation with Chief Engineer authority should
    // clear safety validation; if it does not, the check-list must say why.
    expect(rec!.safetyValidation.verdict).toBe('passed')
    expect(rec!.safetyValidation.checks.every((c) => c.passed)).toBe(true)
    expect(rec!.oddStatus).toBe('inside')

    // audit trail carries the whole chain
    const kinds = new Set(state.auditEvents.map((e) => e.kind))
    expect(kinds.has('alarm')).toBe(true)
    expect(kinds.has('recommendation_generated')).toBe(true)
    expect(kinds.has('safety_validation')).toBe(true)
    expect(kinds.has('system_state_change')).toBe(true)
  })
})

describe('HEAVY WEATHER scenario', () => {
  it('degrades visibility and raises sea state, triggering a navigation visibility alarm', () => {
    const state = runScenario('heavy_weather', 160)
    expect(state.snapshot.environment.waveHeightM).toBeGreaterThan(3)
    expect(state.snapshot.environment.visibilityNm).toBeLessThan(8)
    expect(state.rawAlarms.some((a) => a.tag === 'NAV_VISIBILITY_LOW')).toBe(true)
  })
})

describe('COLLISION-RISK DEVELOPMENT scenario', () => {
  it('steers a target toward a closing solution and generates a navigation recommendation without moving own-ship course/speed autonomously', () => {
    const initialHeading = buildInitialSimulationState().snapshot.navigation.heading
    const initialTarget = buildInitialSimulationState().targets.find((t) => t.id === 'TGT-002')!
    const state = runScenario('collision_risk', 200)

    const target = state.targets.find((t) => t.id === 'TGT-002')!
    expect(target.cpaNm).toBeLessThan(initialTarget.cpaNm)

    // NAV-003 — the project's central claim. This is a differential test: the same engine is run
    // for the same number of ticks with and without the collision scenario active, and own-ship
    // heading, speed and position must be IDENTICAL. Asserting that a heading is a number (as
    // this test previously did, discarding its own captured baseline with `void initialHeading`)
    // does not verify that the system never steers the ship.
    const control = runScenario('normal_operations', 200)
    expect(state.snapshot.navigation.heading).toBe(control.snapshot.navigation.heading)
    expect(state.snapshot.navigation.speedOverGroundKn).toBe(control.snapshot.navigation.speedOverGroundKn)
    expect(state.snapshot.navigation.position).toEqual(control.snapshot.navigation.position)
    expect(state.voyagePlan.userModifiedSpeedKn).toBeNull()
    // and the baseline heading is genuinely used, not discarded
    expect(Number.isFinite(initialHeading)).toBe(true)

    // The recommendation must actually be produced — an `if (rec)` guard here would let the test
    // pass silently when the whole path never fires.
    const rec = state.recommendations.find((r) => r.vesselFunction === 'navigation' && r.title.includes('Closing Range'))
    expect(rec).toBeDefined()
    expect(rec!.requiredAuthority).toBe('officer_of_the_watch')
    expect(rec!.recommendedResponse).toMatch(/course alteration|speed reduction|enhanced monitoring/i)
  })
})

describe('REEFER TEMPERATURE EXCURSION scenario', () => {
  it('drifts one monitored reefer unit off its set point and raises a cargo recommendation', () => {
    const state = runScenario('reefer_excursion', 120)
    const unit = state.snapshot.cargoReefer.reeferUnits[3]!
    expect(Math.abs(unit.actualTempC - unit.setPointC)).toBeGreaterThan(1)
    expect(state.rawAlarms.some((a) => a.tag === 'CARGO_REEFER_TEMP_DEV')).toBe(true)
    const rec = state.recommendations.find((r) => r.vesselFunction === 'cargo_reefer')
    expect(rec).toBeDefined()
  })
})

describe('SHIP-SHORE COMMUNICATION LOSS scenario — fallback behaviour', () => {
  it('degrades connectivity, drops the satellite link, and records a fallback transition without disabling onboard systems', () => {
    const state = runScenario('communication_loss', 70)

    expect(state.snapshot.communications.satelliteLinkUp).toBe(false)
    const commsHealth = state.snapshot.systemHealth.find((s) => s.area === 'communications')!
    expect(commsHealth.state).toBe('fallback')

    expect(state.auditEvents.some((e) => e.kind === 'fallback_transition')).toBe(true)

    // onboard-only functions remain assessable and are not force-disabled by the comms outage
    const machineryOdd = assessOdd('machinery_anomaly_detection', state.snapshot)
    expect(machineryOdd.status).not.toBe('outside')

    // shore-dependent function is now outside its envelope
    const shoreOdd = assessOdd('shore_sync_assistance', state.snapshot)
    expect(shoreOdd.status).toBe('outside')
  })
})

describe('GNSS / SENSOR DEGRADATION scenario — ODD violation', () => {
  it('degrades GNSS confidence until navigation assistance falls outside its operational envelope', () => {
    const state = runScenario('gnss_sensor_degradation', 90)
    expect(state.snapshot.navigation.gnssConfidence).toBeLessThan(70)

    const navOdd = assessOdd('nav_collision_advisory', state.snapshot)
    expect(navOdd.status).not.toBe('inside')
    expect(navOdd.availableAssistanceLevel).not.toBe('L2')

    const rec = state.recommendations.find((r) => r.title.includes('GNSS'))
    expect(rec).toBeDefined()
  })
})

describe('ALARM CASCADE scenario — correlation reduces alarm burden', () => {
  it('raises multiple related alarms across two systems that correlate into two operational events', () => {
    const state = runScenario('alarm_cascade', 80)
    const active = state.rawAlarms.filter((a) => a.active)
    expect(active.length).toBeGreaterThanOrEqual(6)

    const { correlated } = correlateAlarms(state.rawAlarms)
    expect(correlated.length).toBeGreaterThanOrEqual(1)
    expect(correlated.length).toBeLessThan(active.length)
  })
})

describe('SAFETY EVENT scenario', () => {
  it('raises a hazard and a Master-level recommendation', () => {
    const state = runScenario('safety_event', 50)
    expect(state.hazards.length).toBeGreaterThan(0)
    expect(state.snapshot.safetySystems.bilgeAlarmActive).toBe(true)
    const rec = state.recommendations.find((r) => r.vesselFunction === 'safety')
    expect(rec?.requiredAuthority).toBe('master')
  })

  it('audits the assistance-level change on the exact same tick the hazard first appears', () => {
    // Regression guard: `prevOdd`/`currentOdd` previously used the same (pre-hazard) category set
    // for both sides of the change-detection comparison, so a hazard-driven assistance drop was
    // never observed by the audit trail at all — not delayed, simply never recorded.
    let state: SimulationState = { ...buildInitialSimulationState(), activeScenario: 'safety_event' }
    const baselineHazardCount = state.hazards.length
    let tickAuditTimestamp: string | undefined
    for (let i = 0; i < 50 && tickAuditTimestamp === undefined; i++) {
      const prevTime = state.snapshot.simTimeIso
      state = tick(state, 1)
      if (state.hazards.length > baselineHazardCount) tickAuditTimestamp = prevTime
    }
    expect(tickAuditTimestamp).toBeDefined()
    // Every audit event `pushAudit` writes within a single `tick()` call carries that tick's
    // `prev.snapshot.simTimeIso`, so an event sharing this timestamp was written on the very tick
    // the hazard was created. The newly-raised hazard is 'personnel'; nav_collision_advisory is
    // the vessel-safety-relevant function declared sensitive to that category, so its assistance-
    // level-change audit event, if the fix works, must appear in that same batch.
    const sameTickChange = state.auditEvents.find(
      (e) => e.kind === 'assistance_level_change' && e.timestampIso === tickAuditTimestamp && e.event.includes('Navigation Collision-Risk Advisory'),
    )
    expect(sameTickChange).toBeDefined()
  })

  it('the runtime-minted hazard never collides with a baseline hazard ID, and the recommendation validation reflects the hazard it was raised from', () => {
    // Regression guard: the baseline register and the engine's monotonic ID minter previously
    // shared the same 'HAZ-000NNN' numbering space, so a runtime-raised hazard could collide with
    // and silently overwrite a baseline hazard sharing the same minted number.
    const state = runScenario('safety_event', 50)
    expect(new Set(state.hazards.map((h) => h.id)).size).toBe(state.hazards.length)

    const rec = state.recommendations.find((r) => r.vesselFunction === 'safety')!
    const originatingHazard = state.hazards.find((h) => h.id === rec.hazardId)
    expect(originatingHazard).toBeDefined()
    expect(rec.originatingHazardCategory).toBe(originatingHazard!.category)
    // The bilge hazard is 'personnel' and remains open ('identified') at this point in the ramp —
    // its own recommendation must reflect that it is still constrained by its own hazard.
    expect(rec.safetyValidation.checks.find((c) => c.label === 'Not constrained by an active intolerable safety hazard')?.passed).toBe(false)
  })
})

describe('DEMO VOYAGE phase sequencing', () => {
  it('auto-advances from phase 1 to phase 2 once the phase duration elapses, and generates fewer than that on its own', () => {
    let state: SimulationState = {
      ...buildInitialSimulationState(),
      activeScenario: 'normal_operations',
      demoVoyage: { active: true, phaseIndex: 0, phaseElapsedMinutes: 0 },
    }
    // Phase 1 (Normal Open-Sea Operations) runs for 20 minutes in DEMO_VOYAGE_PHASES.
    for (let i = 0; i < 19; i++) state = tick(state, 1)
    expect(state.demoVoyage.phaseIndex).toBe(0)

    for (let i = 0; i < 5; i++) state = tick(state, 1)
    expect(state.demoVoyage.phaseIndex).toBe(1)
    expect(state.activeScenario).toBe('excessive_fuel_consumption')
    expect(state.auditEvents.some((e) => e.event.includes('Demo Voyage phase advanced'))).toBe(true)
  })
})

describe('RESET / re-activation', () => {
  it('allows a scenario to be re-triggered after returning to normal operations', () => {
    let state = runScenario('engine_degradation', 260)
    const firstRunCount = state.recommendations.filter((r) => r.vesselFunction === 'main_engine').length
    expect(firstRunCount).toBeGreaterThan(0)

    // Return to normal and let the ENGINE decay severity and clear its own trigger flags.
    // Reconstructing `scenarioTriggers: {}` by hand here would bypass the very mechanism under
    // test, and the final assertion would then be satisfied by the first run's output alone.
    state = { ...state, activeScenario: 'normal_operations' }
    for (let i = 0; i < 40; i++) state = tick(state, 1)

    // Decide the outstanding recommendation so de-duplication does not suppress the re-fire.
    state = {
      ...state,
      recommendations: state.recommendations.map((r) => (r.status === 'awaiting_decision' ? { ...r, status: 'rejected' as const } : r)),
    }

    state = { ...state, activeScenario: 'engine_degradation', scenarioElapsedMinutes: 0 }
    for (let i = 0; i < 260; i++) state = tick(state, 1)
    const secondRunCount = state.recommendations.filter((r) => r.vesselFunction === 'main_engine').length
    expect(secondRunCount).toBeGreaterThan(firstRunCount)
  })
})
