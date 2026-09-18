import type { DataProvenance, DataQuality, OddStatus, OperationalMode, RequiredAuthority, RiskLevel, VesselSystemArea } from './common'
import type { HazardCategory, OddAssessment, SafetyValidationResult } from './safety'

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
  /** Closes the decision chain both ways: the hazard that generated this recommendation, if any. */
  hazardId?: string
  /** The category of the hazard named by `hazardId` — see `ValidationInput.originatingHazardCategory`. */
  originatingHazardCategory?: HazardCategory
  /**
   * The `seq` of the hash-chained audit event that recorded the human decision on this
   * recommendation (accept/reject/modify/etc). `seq` — not `id` — because it is the audit
   * trail's immutable ordering key; ties the decision to a specific, position-fixed entry in the
   * chain rather than to a string that exists purely for display. Set synchronously when the
   * decision is recorded, before that audit event has necessarily been sealed.
   */
  decisionAuditSeq?: number
  /**
   * The sealed hash of the audit event named by `decisionAuditSeq`, once the incremental sealer
   * has reached it — see packages/core-domain/src/auditChain.ts. Undefined until then; a reader
   * should not infer anything from its absence beyond "not sealed yet". This is what "carries the
   * hash of the audit record" (docs/production-architecture-assessment.md §7 Phase 1) means in
   * practice: the field is backfilled, never fabricated ahead of the real computation.
   */
  decisionAuditHash?: string
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
  | 'hazard_lifecycle'

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
  /** The hazard this audit entry belongs to, for the hazard's "reach its audit entries" linkage. */
  hazardId?: string

  /**
   * Monotonic, gap-free ordering key assigned once, at the single point an event is created
   * (see `createAuditEvent` in `auditChain.ts`) — regardless of which of the two producers
   * (the engine tick, or a store action) created it. This is the audit trail's real identity;
   * `id` is a display-oriented mint and carries no ordering guarantee across two producers.
   */
  seq: number
  /**
   * The hash of the immediately preceding record in the chain (by `seq`), or
   * `AUDIT_CHAIN_GENESIS_HASH` for the very first record ever sealed. `PENDING_HASH` (`''`) until
   * the incremental sealer reaches this record — hashing is async (crypto.subtle) and runs
   * outside the synchronous simulation tick, so a freshly created event is "pending" for a short
   * window before it is "sealed". See auditChain.ts.
   */
  prevHash: string
  /**
   * SHA-256 (hex) over this record's canonical serialisation (via `canonicaliseAuditEvent`,
   * which explicitly EXCLUDES `hash` and `prevHash` themselves — hashing a field that is part of
   * the hash's own definition is circular) concatenated with `prevHash`. `PENDING_HASH` (`''`)
   * until sealed.
   */
  hash: string
}
