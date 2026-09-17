import type { Hazard, HazardCategory, HazardStatus, RequiredAuthority } from '@ave/core-domain/types'
import { isIntolerable, targetResponseMinutes } from './riskMatrix'

/**
 * ISM Code 9.1/9.2 hazard lifecycle:
 *
 *   IDENTIFIED -> ACKNOWLEDGED -> ASSIGNED -> UNDER_INVESTIGATION -> CORRECTIVE_ACTION -> CLOSED
 *   any open state -> ESCALATED -> (resume) -> ASSIGNED or CORRECTIVE_ACTION
 *
 * This module is the ONLY place that knows which transitions are legal. The UI (SafetyPage,
 * hazard cards) asks `canTransition` and renders exactly what it returns — it must never encode
 * "if status is X, show button Y" itself, which is the defect this module replaces (five buttons
 * always enabled regardless of state).
 */

export type HazardAction = 'acknowledge' | 'assign' | 'begin_investigation' | 'record_corrective_action' | 'verify_effectiveness' | 'escalate' | 'resume'

export const HAZARD_ACTION_LABELS: Record<HazardAction, string> = {
  acknowledge: 'Acknowledge',
  assign: 'Assign',
  begin_investigation: 'Begin Investigation',
  record_corrective_action: 'Record Corrective Action',
  verify_effectiveness: 'Verify Effectiveness & Close',
  escalate: 'Escalate to Company',
  resume: 'Resume Handling',
}

/** Past tense for audit-event prose — separate from `HAZARD_ACTION_LABELS` because English past
 * tense isn't a mechanical suffix (e.g. "Escalate to Company" -> "escalated it to the Company"). */
export const HAZARD_ACTION_PAST_TENSE: Record<HazardAction, string> = {
  acknowledge: 'acknowledged',
  assign: 'assigned',
  begin_investigation: 'began investigating',
  record_corrective_action: 'recorded a corrective action for',
  verify_effectiveness: 'verified effectiveness and closed',
  escalate: 'escalated to the Company',
  resume: 'resumed handling of',
}

export const HAZARD_STATUS_LABELS: Record<HazardStatus, string> = {
  identified: 'Identified',
  acknowledged: 'Acknowledged',
  assigned: 'Assigned',
  under_investigation: 'Under Investigation',
  corrective_action: 'Corrective Action Recorded',
  escalated: 'Escalated to Company',
  closed: 'Closed',
}

/** The linear ISM 9.1/9.2 lifecycle. Every entry names the ONE action that legally advances that
 * state; `null` means the state has no forward linear action of its own (ESCALATED resumes via a
 * dedicated action instead, and CLOSED is terminal). */
const LINEAR_TRANSITIONS: Record<HazardStatus, { action: HazardAction; to: HazardStatus } | null> = {
  identified: { action: 'acknowledge', to: 'acknowledged' },
  acknowledged: { action: 'assign', to: 'assigned' },
  assigned: { action: 'begin_investigation', to: 'under_investigation' },
  under_investigation: { action: 'record_corrective_action', to: 'corrective_action' },
  corrective_action: { action: 'verify_effectiveness', to: 'closed' },
  escalated: null,
  closed: null,
}

export function isOpenStatus(status: HazardStatus): boolean {
  return status !== 'closed'
}

export interface TransitionCheck {
  action: HazardAction
  allowed: boolean
  /** Always populated — for a disabled action this is the reason SHOWN to the operator, not a
   * hidden control. "The operator should see that CLOSE exists and why it is not yet available." */
  reason: string
  targetStatus: HazardStatus
}

type HazardForTransition = Pick<Hazard, 'status' | 'correctiveAction' | 'residualRisk' | 'escalation'>

/**
 * ISM 5.2 gives the Master overriding authority. An intolerable-band (RI 8-11) hazard must
 * surface a Master decision before it can be escalated or closed — the same senior-authority
 * gating pattern `safety-engine/validate.ts` already applies to severe-risk recommendations.
 */
function masterGateSatisfied(hazard: HazardForTransition, actorRole: RequiredAuthority): boolean {
  if (!isIntolerable(hazard.residualRisk.riskIndex)) return true
  return actorRole === 'master'
}

/**
 * The single source of truth for what may happen next to a hazard. Returns one result per
 * possible action so a caller can render every button, not just the legal one, with the illegal
 * ones disabled and their reason visible (ISM 9.1/9.2 requires the operator to see the whole
 * procedure, not just its next step).
 */
export function canTransition(hazard: HazardForTransition, action: HazardAction, actorRole: RequiredAuthority): TransitionCheck {
  const linear = LINEAR_TRANSITIONS[hazard.status]

  switch (action) {
    case 'acknowledge':
    case 'assign':
    case 'begin_investigation': {
      const to = action === 'acknowledge' ? 'acknowledged' : action === 'assign' ? 'assigned' : 'under_investigation'
      if (linear?.action === action) return { action, allowed: true, targetStatus: to, reason: `Legal from ${HAZARD_STATUS_LABELS[hazard.status]}.` }
      return { action, allowed: false, targetStatus: to, reason: describeWhyNotLinear(hazard.status, action) }
    }
    case 'record_corrective_action': {
      if (linear?.action === 'record_corrective_action') {
        return { action, allowed: true, targetStatus: 'corrective_action', reason: 'Records the corrective action taken, including measures to prevent recurrence (ISM 9.2).' }
      }
      return { action, allowed: false, targetStatus: 'corrective_action', reason: describeWhyNotLinear(hazard.status, action) }
    }
    case 'verify_effectiveness': {
      if (hazard.status !== 'corrective_action') {
        return { action, allowed: false, targetStatus: 'closed', reason: 'A corrective action must be recorded and in effect before its effectiveness can be verified — a hazard cannot go straight from acknowledged to closed.' }
      }
      if (!hazard.correctiveAction) {
        return { action, allowed: false, targetStatus: 'closed', reason: 'No corrective action has been recorded yet.' }
      }
      if (!masterGateSatisfied(hazard, actorRole)) {
        return { action, allowed: false, targetStatus: 'closed', reason: `Residual risk is in the intolerable band (RI ${hazard.residualRisk.riskIndex}) — ISM 5.2 requires the Master's decision to close it.` }
      }
      return { action, allowed: true, targetStatus: 'closed', reason: 'Verifies the corrective action actually prevented recurrence, then closes the hazard (ISM 9.2).' }
    }
    case 'escalate': {
      if (hazard.status === 'closed') return { action, allowed: false, targetStatus: 'escalated', reason: 'A closed hazard cannot be escalated.' }
      if (hazard.status === 'escalated') return { action, allowed: false, targetStatus: 'escalated', reason: 'Already escalated to the Company; awaiting response.' }
      if (!masterGateSatisfied(hazard, actorRole)) {
        return { action, allowed: false, targetStatus: 'escalated', reason: `Residual risk is in the intolerable band (RI ${hazard.residualRisk.riskIndex}) — ISM 5.2 requires the Master's decision to escalate it.` }
      }
      return { action, allowed: true, targetStatus: 'escalated', reason: 'Reports this hazard to the Company (ISM 9.1) without losing its place in the lifecycle — it resumes afterwards.' }
    }
    case 'resume': {
      const to = hazard.escalation?.preEscalationStatus ?? 'assigned'
      if (hazard.status !== 'escalated') return { action, allowed: false, targetStatus: to, reason: 'Only an escalated hazard can resume handling.' }
      return { action, allowed: true, targetStatus: to, reason: 'Resumes handling at the state it was in when escalated, following the Company response.' }
    }
  }
}

function describeWhyNotLinear(status: HazardStatus, action: HazardAction): string {
  if (status === 'closed') return 'This hazard is closed.'
  if (status === 'escalated') return 'Escalated to the Company — resume handling before continuing the lifecycle.'
  const order: HazardAction[] = ['acknowledge', 'assign', 'begin_investigation', 'record_corrective_action', 'verify_effectiveness']
  const currentIndex = LINEAR_TRANSITIONS[status] ? order.indexOf(LINEAR_TRANSITIONS[status]!.action) : order.length
  const actionIndex = order.indexOf(action)
  if (actionIndex < currentIndex) return `Already past this step — currently ${HAZARD_STATUS_LABELS[status]}.`
  return `Not yet available — currently ${HAZARD_STATUS_LABELS[status]}. Complete the intervening steps first.`
}

/** Every action, with its legality against this hazard — what a hazard card renders as its
 * five-to-seven buttons, each individually enabled or disabled-with-reason. */
export function allTransitions(hazard: HazardForTransition, actorRole: RequiredAuthority): TransitionCheck[] {
  const actions: HazardAction[] = ['acknowledge', 'assign', 'begin_investigation', 'record_corrective_action', 'verify_effectiveness', 'escalate', 'resume']
  return actions.map((action) => canTransition(hazard, action, actorRole))
}

export interface NextRequiredAction {
  imperative: string
  ownerRole: RequiredAuthority | 'unassigned'
  dueAtIso: string
  overdue: boolean
}

/** The "future steps" the current card is entirely missing, derived from the state machine —
 * never hand-written per hazard. */
export function nextRequiredAction(hazard: Pick<Hazard, 'status' | 'owner' | 'raisedAtIso' | 'residualRisk' | 'escalation'>, nowIso: string): NextRequiredAction | null {
  if (hazard.status === 'closed') return null

  const dueAtIso = addMinutesIso(hazard.raisedAtIso, targetResponseMinutes(hazard.residualRisk.riskIndex))
  const overdue = new Date(nowIso).getTime() > new Date(dueAtIso).getTime()
  const ownerRole = hazard.owner?.role ?? 'unassigned'

  const imperative: Record<HazardStatus, string> = {
    identified: 'Acknowledge this hazard.',
    acknowledged: 'Assign an owner.',
    assigned: 'Begin the investigation.',
    under_investigation: 'Record the corrective action, including measures to prevent recurrence.',
    corrective_action: 'Verify the corrective action was effective, then close.',
    escalated: 'Awaiting Company response before handling resumes.',
    closed: '',
  }

  return { imperative: imperative[hazard.status], ownerRole, dueAtIso, overdue }
}

/** Who this hazard escalates to next if the current owner does not resolve it — the escalation
 * path required alongside age/overdue/owner (spec §5). */
export function escalationPath(hazard: Pick<Hazard, 'owner' | 'residualRisk'>): RequiredAuthority {
  if (isIntolerable(hazard.residualRisk.riskIndex)) return 'master'
  if (hazard.owner?.role === 'officer_of_the_watch') return 'master'
  if (hazard.owner?.role === 'chief_engineer') return 'technical_superintendent'
  return 'master'
}

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

export function ageMinutes(raisedAtIso: string, nowIso: string): number {
  return Math.max(0, (new Date(nowIso).getTime() - new Date(raisedAtIso).getTime()) / 60_000)
}

/**
 * §6's ODD gap: every hazard category with at least one currently OPEN, intolerable-band
 * (RI 8-11) hazard. Feeds `assessOdd`/`assessAllOdd` so an active critical safety hazard can
 * actually constrain the operational envelope — previously there was no hazard input to the ODD
 * at all.
 */
export function activeIntolerableHazardCategories(hazards: Pick<Hazard, 'category' | 'status' | 'residualRisk'>[]): HazardCategory[] {
  const categories = new Set<HazardCategory>()
  for (const h of hazards) {
    if (isOpenStatus(h.status) && isIntolerable(h.residualRisk.riskIndex)) categories.add(h.category)
  }
  // Sorted rather than left in hazard-array insertion order, so any future consumer that renders
  // or joins this list (not just `.includes()`s it) is not silently order-dependent.
  return [...categories].sort()
}
