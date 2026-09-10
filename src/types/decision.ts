import type { DataProvenance, DataQuality, OddStatus, OperationalMode, RequiredAuthority, RiskLevel, VesselSystemArea } from './common'
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
  provenance: DataProvenance
}

/** Which layer of intelligence produced this recommendation's content. Generative AI may only
 * explain/summarise/retrieve — it can never itself decide PASSED/CONDITIONAL/BLOCKED. */
export type AnalyticalMethod = 'ml_anomaly_detection' | 'ml_trend_detection' | 'optimisation' | 'deterministic_rule' | 'generative_ai_explanation'

export const ANALYTICAL_METHOD_LABELS: Record<AnalyticalMethod, string> = {
  ml_anomaly_detection: 'ML — Anomaly Detection',
  ml_trend_detection: 'ML — Condition Trend Detection',
  optimisation: 'Optimisation',
  deterministic_rule: 'Deterministic Rule',
  generative_ai_explanation: 'Generative AI — Explanation',
}

export interface Recommendation {
  id: string
  timestampIso: string
  vesselFunction: VesselSystemArea | 'voyage' | 'safety'
  title: string
  detectedCondition: string
  sourceSystems: string[]
  evidence: EvidenceItem[]
  dataQuality: DataQuality
  analyticalMethod: AnalyticalMethod
  modelId: string
  modelVersion: string
  confidencePercent: number
  riskLevel: RiskLevel
  operationalMode: OperationalMode
  oddStatus: OddStatus
  safetyValidation: SafetyValidationResult
  oddAssessment?: OddAssessment
  expectedBenefit: string
  potentialConsequence: string
  requiredAuthority: RequiredAuthority
  recommendedResponse: string
  alternativeAction: string
  fallbackOption: string
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
  | 'assistance_level_change'
  | 'fallback_transition'

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
