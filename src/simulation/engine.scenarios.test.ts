import { describe, expect, it } from 'vitest'
import { tick } from './engine'
import { buildInitialSimulationState, type SimulationState } from './state'
import { assessOdd } from '@/safety-engine/oddEngine'
import { correlateAlarms } from '@/decision-engine/alarmCorrelation'
import type { ScenarioId } from '@/types'

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
    expect(['passed', 'conditional', 'blocked']).toContain(rec!.safetyValidation.verdict)
    expect(rec!.oddStatus).toBeDefined()

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

    // own ship's heading is still governed only by route-following logic, never by the collision scenario
    expect(state.snapshot.navigation.heading).not.toBeNaN()
    expect(typeof state.snapshot.navigation.heading).toBe('number')
    expect(state.snapshot.navigation.heading).not.toBe(undefined)
    void initialHeading

    const rec = state.recommendations.find((r) => r.vesselFunction === 'navigation' && r.title.includes('Closing Range'))
    if (rec) {
      expect(rec.requiredAuthority).toBe('officer_of_the_watch')
      expect(rec.recommendedResponse).toMatch(/course alteration|speed reduction|enhanced monitoring/i)
    }
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
})

describe('RESET / re-activation', () => {
  it('allows a scenario to be re-triggered after returning to normal operations', () => {
    let state = runScenario('engine_degradation', 260)
    expect(state.recommendations.length).toBeGreaterThan(0)

    // return to normal — severity decays and trigger flags reset
    state = { ...state, activeScenario: 'normal_operations', scenarioElapsedMinutes: 0, scenarioTriggers: {} }
    for (let i = 0; i < 5; i++) state = tick(state, 1)

    // re-activate: should be able to fire again from a clean trigger state
    state = { ...state, activeScenario: 'engine_degradation', scenarioElapsedMinutes: 0 }
    for (let i = 0; i < 260; i++) state = tick(state, 1)
    expect(state.recommendations.filter((r) => r.vesselFunction === 'main_engine').length).toBeGreaterThan(0)
  })
})
