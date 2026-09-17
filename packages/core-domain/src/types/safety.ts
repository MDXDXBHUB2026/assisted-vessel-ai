import type { AssistanceLevel, OddStatus, RequiredAuthority, SafetyVerdict, VesselSystemArea } from './common'

export type OddParameterKey =
  | 'visibility'
  | 'wind'
  | 'waveHeight'
  | 'seaState'
  | 'trafficDensity'
  | 'gnssAvailability'
  | 'radarAvailability'
  | 'aisAvailability'
  | 'chartDataValidity'
  | 'machineryHealth'
  | 'communications'
  | 'sensorConfidence'
  | 'dataLatency'
  | 'dataQuality'
  | 'operationalMode'
  | 'safetyHazard'

export interface OddParameterStatus {
  key: OddParameterKey
  label: string
  value: string
  status: OddStatus
  /** 0 = at the limit, 1 = full margin. Used to render proximity to a limit, not just a boolean. */
  marginFraction: number
  detail: string
}

export interface OddAssessment {
  functionId: string
  functionLabel: string
  status: OddStatus
  limitingFactors: OddParameterStatus[]
  nearLimitFactors: OddParameterStatus[]
  parameters: OddParameterStatus[]
  /** Assistance level actually available right now given the envelope/system state, vs. the level configured for this function. */
  availableAssistanceLevel: AssistanceLevel
  configuredAssistanceLevel: AssistanceLevel
  /** Hard ceiling declared for this function — enforced, never merely documented. */
  maxAssistanceLevel: AssistanceLevel
  /** Vessel system areas whose source-data availability this function actually depends on. */
  requiredSourceAreas: VesselSystemArea[]
  assistanceLimitingReason?: string
}

export interface SafetyValidationResult {
  verdict: SafetyVerdict
  checks: {
    label: string
    passed: boolean
    detail: string
  }[]
  reason?: string
}

/**
 * IMO Formal Safety Assessment (MSC-MEPC.2/Circ.12/Rev.2) risk indices. FI and SI are logarithmic
 * and additive (log(Risk) = log(Probability) + log(Consequence)), so RI = FI + SI is the quantity
 * that actually carries meaning — never averaged, never displayed as a bare "likelihood x severity"
 * word pair. See src/decision-engine/riskMatrix.ts for the index definitions and band thresholds,
 * which are this project's own explicit FSA acceptance criteria (docs/assumptions.md).
 */
export interface HazardRiskAssessment {
  /** 1 (Extremely Remote) .. 7 (Frequent); 2/4/6 are interpolated intermediate values. */
  frequencyIndex: number
  /** 1 (Minor) .. 4 (Catastrophic). */
  severityIndex: number
  /** FI + SI, range 2-11. */
  riskIndex: number
}

export type HazardCategory = 'navigation' | 'machinery' | 'cargo' | 'personnel' | 'environmental' | 'security'

/**
 * ISM Code 9.1/9.2 hazard lifecycle. The legal transition graph and every rule below live in
 * src/decision-engine/hazardLifecycle.ts as a pure, unit-tested module — this type only names the
 * possible states; it must not itself encode which transitions are legal.
 */
export type HazardStatus = 'identified' | 'acknowledged' | 'assigned' | 'under_investigation' | 'corrective_action' | 'escalated' | 'closed'

export interface HazardOwner {
  role: RequiredAuthority
  assignedAtIso: string
}

export interface HazardCorrectiveAction {
  description: string
  recordedAtIso: string
  recordedByRole: RequiredAuthority
}

export interface HazardVerification {
  note: string
  verifiedAtIso: string
  verifiedByRole: RequiredAuthority
}

/** ISM 9.1's "reported to the Company" step. `preEscalationStatus` is what a `resume` action
 * returns the hazard to once the Company has responded. */
export interface HazardEscalation {
  escalatedToRole: RequiredAuthority
  escalatedAtIso: string
  note: string
  preEscalationStatus: HazardStatus
}

export interface Hazard {
  id: string
  title: string
  category: HazardCategory
  peopleExposed: number
  immediateMitigation: string
  recommendedCorrectiveAction: string
  /** Inherent risk before any mitigation. */
  initialRisk: HazardRiskAssessment
  /** Current risk given whatever mitigation/corrective action is in place. Equal to initialRisk
   * until a corrective action is recorded — a hazard cannot show mitigation credit it hasn't
   * earned. */
  residualRisk: HazardRiskAssessment
  status: HazardStatus
  raisedAtIso: string
  owner?: HazardOwner
  correctiveAction?: HazardCorrectiveAction
  verification?: HazardVerification
  escalation?: HazardEscalation
  /** Closes the decision chain both ways: the recommendation this hazard generated. */
  recommendationId?: string
  /** Alarm tags correlated to this hazard, for the "reach the correlated alarms" linkage. */
  correlatedAlarmTags?: string[]
}
