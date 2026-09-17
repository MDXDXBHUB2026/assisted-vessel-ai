import { describe, expect, it } from 'vitest'
import {
  activeIntolerableHazardCategories,
  ageMinutes,
  allTransitions,
  canTransition,
  escalationPath,
  isOpenStatus,
  nextRequiredAction,
  type HazardAction,
} from './hazardLifecycle'
import type { Hazard, HazardStatus } from '@/types'
import { buildRiskAssessment } from './riskMatrix'

const ALL_STATUSES: HazardStatus[] = ['identified', 'acknowledged', 'assigned', 'under_investigation', 'corrective_action', 'escalated', 'closed']
const ALL_ACTIONS: HazardAction[] = ['acknowledge', 'assign', 'begin_investigation', 'record_corrective_action', 'verify_effectiveness', 'escalate', 'resume']

function hazardAt(status: HazardStatus, overrides: Partial<Pick<Hazard, 'correctiveAction' | 'residualRisk' | 'escalation'>> = {}): Pick<Hazard, 'status' | 'correctiveAction' | 'residualRisk' | 'escalation'> {
  return {
    status,
    residualRisk: buildRiskAssessment(3, 2), // RI 5, ALARP — not intolerable, so the Master gate never blocks these baseline cases
    correctiveAction: undefined,
    escalation: undefined,
    ...overrides,
  }
}

/** The complete legal-transition table this module must implement, expressed independently of
 * the implementation so the exhaustive test below is a real specification, not a mirror of the
 * code it checks. */
const LEGAL: Record<HazardStatus, HazardAction[]> = {
  identified: ['acknowledge', 'escalate'],
  acknowledged: ['assign', 'escalate'],
  assigned: ['begin_investigation', 'escalate'],
  under_investigation: ['record_corrective_action', 'escalate'],
  corrective_action: ['verify_effectiveness', 'escalate'],
  escalated: ['resume'],
  closed: [],
}

describe('hazard lifecycle — exhaustive legality table (every illegal transition is asserted disallowed)', () => {
  for (const status of ALL_STATUSES) {
    for (const action of ALL_ACTIONS) {
      const shouldBeLegal = LEGAL[status].includes(action)
      // corrective_action -> verify_effectiveness additionally requires a recorded corrective
      // action; a bare hazardAt(status) never has one, so this specific pair is illegal at the
      // "no recorded action" precondition even though it is otherwise the linear next step.
      const expectAllowed = shouldBeLegal && !(status === 'corrective_action' && action === 'verify_effectiveness')

      it(`${status} -> ${action} is ${expectAllowed ? 'LEGAL' : 'ILLEGAL'}`, () => {
        const result = canTransition(hazardAt(status), action, 'officer_of_the_watch')
        expect(result.allowed).toBe(expectAllowed)
        expect(result.reason.length).toBeGreaterThan(0)
        if (!result.allowed) {
          // A disabled transition must still be explained, not merely hidden.
          expect(result.reason).not.toBe('')
        }
      })
    }
  }
})

describe('named illegal transitions (documentation-level cases)', () => {
  it('cannot acknowledge an already-acknowledged hazard', () => {
    expect(canTransition(hazardAt('acknowledged'), 'acknowledge', 'officer_of_the_watch').allowed).toBe(false)
  })

  it('cannot go straight from acknowledged to closed', () => {
    expect(canTransition(hazardAt('acknowledged'), 'verify_effectiveness', 'master').allowed).toBe(false)
  })

  it('cannot close a hazard with no corrective action recorded, even from corrective_action status', () => {
    const result = canTransition(hazardAt('corrective_action', { correctiveAction: undefined }), 'verify_effectiveness', 'master')
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/no corrective action/i)
  })

  it('CAN close once a corrective action is recorded', () => {
    const hazard = hazardAt('corrective_action', { correctiveAction: { description: 'x', recordedAtIso: '2026-01-01T00:00:00Z', recordedByRole: 'officer_of_the_watch' } })
    expect(canTransition(hazard, 'verify_effectiveness', 'master').allowed).toBe(true)
  })

  it('cannot escalate a closed hazard', () => {
    expect(canTransition(hazardAt('closed'), 'escalate', 'master').allowed).toBe(false)
  })

  it('cannot escalate an already-escalated hazard', () => {
    expect(canTransition(hazardAt('escalated'), 'escalate', 'master').allowed).toBe(false)
  })

  it('cannot resume a hazard that was never escalated', () => {
    expect(canTransition(hazardAt('assigned'), 'resume', 'master').allowed).toBe(false)
  })

  it('an intolerable-band hazard cannot be closed without the Master (ISM 5.2)', () => {
    const hazard = hazardAt('corrective_action', {
      residualRisk: buildRiskAssessment(6, 4), // RI 10, intolerable
      correctiveAction: { description: 'x', recordedAtIso: '2026-01-01T00:00:00Z', recordedByRole: 'officer_of_the_watch' },
    })
    expect(canTransition(hazard, 'verify_effectiveness', 'officer_of_the_watch').allowed).toBe(false)
    expect(canTransition(hazard, 'verify_effectiveness', 'master').allowed).toBe(true)
  })

  it('an intolerable-band hazard cannot be escalated without the Master either', () => {
    const hazard = hazardAt('assigned', { residualRisk: buildRiskAssessment(7, 4) }) // RI 11
    expect(canTransition(hazard, 'escalate', 'officer_of_the_watch').allowed).toBe(false)
    expect(canTransition(hazard, 'escalate', 'master').allowed).toBe(true)
  })

  it('resume returns the hazard to its pre-escalation status', () => {
    const hazard = hazardAt('escalated', { escalation: { escalatedToRole: 'master', escalatedAtIso: '2026-01-01T00:00:00Z', note: 'x', preEscalationStatus: 'under_investigation' } })
    const result = canTransition(hazard, 'resume', 'master')
    expect(result.allowed).toBe(true)
    expect(result.targetStatus).toBe('under_investigation')
  })
})

describe('allTransitions', () => {
  it('returns one result per action, always with a non-empty reason', () => {
    const results = allTransitions(hazardAt('under_investigation'), 'officer_of_the_watch')
    expect(results).toHaveLength(ALL_ACTIONS.length)
    for (const r of results) expect(r.reason.length).toBeGreaterThan(0)
  })
})

describe('isOpenStatus', () => {
  it('every status except closed is open', () => {
    for (const status of ALL_STATUSES) {
      expect(isOpenStatus(status)).toBe(status !== 'closed')
    }
  })
})

describe('nextRequiredAction', () => {
  it('is null once closed — there is nothing further to do', () => {
    expect(nextRequiredAction({ status: 'closed', owner: undefined, raisedAtIso: '2026-01-01T00:00:00Z', residualRisk: buildRiskAssessment(3, 2), escalation: undefined }, '2026-01-01T01:00:00Z')).toBeNull()
  })

  it('names the imperative that matches the current state, not a hand-written sentence', () => {
    const na = nextRequiredAction({ status: 'identified', owner: undefined, raisedAtIso: '2026-01-01T00:00:00Z', residualRisk: buildRiskAssessment(3, 2), escalation: undefined }, '2026-01-01T00:05:00Z')
    expect(na?.imperative).toMatch(/acknowledge/i)
  })

  it('flags overdue once the target response time (by RI band) has elapsed', () => {
    const raised = '2026-01-01T00:00:00Z'
    const intolerable = buildRiskAssessment(7, 4) // RI 11, immediate response required
    const naImmediate = nextRequiredAction({ status: 'identified', owner: undefined, raisedAtIso: raised, residualRisk: intolerable, escalation: undefined }, '2026-01-01T00:00:01Z')
    expect(naImmediate?.overdue).toBe(true)

    const alarp = buildRiskAssessment(3, 2) // RI 5, ALARP — hours-scale window
    const naAlarp = nextRequiredAction({ status: 'identified', owner: undefined, raisedAtIso: raised, residualRisk: alarp, escalation: undefined }, '2026-01-01T00:05:00Z')
    expect(naAlarp?.overdue).toBe(false)
  })
})

describe('escalationPath', () => {
  it('an intolerable hazard escalates to the Master', () => {
    expect(escalationPath({ owner: undefined, residualRisk: buildRiskAssessment(6, 4) })).toBe('master')
  })
})

describe('ageMinutes', () => {
  it('computes elapsed minutes since raised', () => {
    expect(ageMinutes('2026-01-01T00:00:00Z', '2026-01-01T02:00:00Z')).toBe(120)
  })

  it('never goes negative even if clocks disagree', () => {
    expect(ageMinutes('2026-01-01T02:00:00Z', '2026-01-01T00:00:00Z')).toBe(0)
  })
})

describe('activeIntolerableHazardCategories', () => {
  it('is empty when no hazard is both open and intolerable', () => {
    const hazards = [
      { category: 'navigation' as const, status: 'closed' as const, residualRisk: buildRiskAssessment(7, 4) },
      { category: 'machinery' as const, status: 'identified' as const, residualRisk: buildRiskAssessment(3, 2) },
    ]
    expect(activeIntolerableHazardCategories(hazards)).toEqual([])
  })

  it('includes the category of an open, intolerable hazard', () => {
    const hazards = [{ category: 'navigation' as const, status: 'assigned' as const, residualRisk: buildRiskAssessment(6, 4) }]
    expect(activeIntolerableHazardCategories(hazards)).toEqual(['navigation'])
  })

  it('de-duplicates categories shared by multiple intolerable hazards', () => {
    const hazards = [
      { category: 'machinery' as const, status: 'identified' as const, residualRisk: buildRiskAssessment(7, 4) },
      { category: 'machinery' as const, status: 'assigned' as const, residualRisk: buildRiskAssessment(6, 3) },
    ]
    expect(activeIntolerableHazardCategories(hazards)).toEqual(['machinery'])
  })
})
