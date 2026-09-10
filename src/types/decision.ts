import type { RequiredAuthority, RiskLevel, VesselSystemArea } from './common'
import type { OddAssessment, SafetyValidationResult } from './safety'

export type DecisionStatus =
  | 'awaiting_decision'
  | 'accepted'
  | 'modified'
  | 'rejected'
  | 'info_requested'
  | 'shore_support_requested'
  | 'expired'

export interface EvidenceItem {
  label: string
  value: string
  sourceSystem: string
}

export interface Recommendation {
  id: string
  timestampIso: string
  vesselFunction: VesselSystemArea | 'voyage' | 'safety'
  title: string
  detectedCondition: string
  sourceData: string[]
  confidencePercent: number
  riskLevel: RiskLevel
  recommendedResponse: string
  expectedBenefit: string
  safetyValidation: SafetyValidationResult
  oddAssessment?: OddAssessment
  requiredAuthority: RequiredAuthority
  evidence: EvidenceItem[]
  modelId: string
  status: DecisionStatus
  decisionComment?: string
  decidedByRole?: RequiredAuthority
  decidedAtIso?: string
  outcome?: string
  scenarioId?: string
}

export type AuditEventKind =
  | 'scenario'
  | 'mode_change'
  | 'recommendation_generated'
  | 'safety_validation'
  | 'human_decision'
  | 'alarm'
  | 'system_state_change'
  | 'shore_case'
  | 'simulation'

export interface AuditEvent {
  id: string
  timestampIso: string
  operatingMode: string
  scenarioId: string | null
  kind: AuditEventKind
  event: string
  recommendationId?: string
  modelOrRuleId?: string
  confidencePercent?: number
  safetyValidationResult?: string
  humanDecision?: string
  decisionComment?: string
  responsibleRole?: string
  outcome?: string
}
