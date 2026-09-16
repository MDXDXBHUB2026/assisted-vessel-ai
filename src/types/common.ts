export type HealthLevel = 'healthy' | 'advisory' | 'warning' | 'critical'

export type RiskLevel = 'low' | 'medium' | 'high' | 'severe'

export type SystemState = 'normal' | 'degraded' | 'fallback' | 'contingency'

export type SafetyVerdict = 'passed' | 'conditional' | 'blocked'

export type OperationalMode =
  | 'open_sea'
  | 'coastal'
  | 'traffic_separation'
  | 'congested_waters'
  | 'port_approach'
  | 'manoeuvring'
  | 'anchored'
  | 'alongside'

export const OPERATIONAL_MODE_LABELS: Record<OperationalMode, string> = {
  open_sea: 'Open Sea',
  coastal: 'Coastal',
  traffic_separation: 'Traffic Separation',
  congested_waters: 'Congested Waters',
  port_approach: 'Port Approach',
  manoeuvring: 'Manoeuvring',
  anchored: 'Anchored',
  alongside: 'Alongside',
}

export type VesselSystemArea =
  | 'navigation'
  | 'main_engine'
  | 'auxiliary_machinery'
  | 'electrical_power'
  | 'fuel_energy'
  | 'cargo_reefer'
  | 'safety'
  | 'communications'

export const SYSTEM_AREA_LABELS: Record<VesselSystemArea, string> = {
  navigation: 'Navigation',
  main_engine: 'Main Engine',
  auxiliary_machinery: 'Auxiliary Machinery',
  electrical_power: 'Electrical / Power',
  fuel_energy: 'Fuel / Energy',
  cargo_reefer: 'Cargo / Reefer',
  safety: 'Safety',
  communications: 'Communications',
}

export type RequiredAuthority =
  | 'officer_of_the_watch'
  | 'master'
  | 'chief_engineer'
  | 'technical_superintendent'
  | 'marine_superintendent'
  | 'safety_specialist'
  | 'shore_technical'
  | 'shore_marine_ops'
  | 'shore_safety'

export const AUTHORITY_LABELS: Record<RequiredAuthority, string> = {
  officer_of_the_watch: 'Officer of the Watch',
  master: 'Master',
  chief_engineer: 'Chief Engineer',
  technical_superintendent: 'Technical Superintendent',
  marine_superintendent: 'Marine Superintendent',
  safety_specialist: 'Safety Specialist',
  shore_technical: 'Shore Technical Support',
  shore_marine_ops: 'Shore Marine Operations',
  shore_safety: 'Shore Safety Support',
}

/** Every valid RequiredAuthority value, for runtime validation at untyped boundaries. */
export const REQUIRED_AUTHORITIES: readonly RequiredAuthority[] = [
  'officer_of_the_watch',
  'master',
  'chief_engineer',
  'technical_superintendent',
  'marine_superintendent',
  'safety_specialist',
  'shore_technical',
  'shore_marine_ops',
  'shore_safety',
] as const

/**
 * Runtime guard. The type system makes `requiredAuthority` non-optional, so a `Boolean(...)`
 * check on it is vacuous — it can never fail in typed code and therefore validates nothing.
 * This guard is the real check: it catches an absent or unrecognised value arriving from an
 * untyped boundary (adapter JSON, persisted state, a future API), which is the only way the
 * field can actually be wrong.
 */
export function isRequiredAuthority(value: unknown): value is RequiredAuthority {
  return typeof value === 'string' && (REQUIRED_AUTHORITIES as readonly string[]).includes(value)
}

/**
 * Onboard authorities that can authorise an action affecting the vessel. Shore roles are
 * advisory by design: SHORE-003 requires that shore guidance never removes operational
 * authority from the vessel, so a shore role can never be the authorising party for a
 * high-consequence onboard action.
 */
const VESSEL_AUTHORITIES: readonly RequiredAuthority[] = ['officer_of_the_watch', 'master', 'chief_engineer'] as const

export function isVesselAuthority(authority: RequiredAuthority): boolean {
  return (VESSEL_AUTHORITIES as readonly string[]).includes(authority)
}

/** Seniority ordering used for risk-appropriate authority gating. Shore roles rank 0 — advisory only. */
export function authorityRank(authority: RequiredAuthority): number {
  return {
    shore_technical: 0,
    shore_marine_ops: 0,
    shore_safety: 0,
    technical_superintendent: 0,
    marine_superintendent: 0,
    safety_specialist: 0,
    officer_of_the_watch: 1,
    chief_engineer: 2,
    master: 3,
  }[authority]
}

export interface Trend {
  /** Chronological samples, oldest first. */
  samples: { t: number; v: number }[]
  unit: string
}

export function healthLevelRank(level: HealthLevel): number {
  return { healthy: 0, advisory: 1, warning: 2, critical: 3 }[level]
}

export function riskLevelRank(level: RiskLevel): number {
  return { low: 0, medium: 1, high: 2, severe: 3 }[level]
}

export function worstHealth(levels: HealthLevel[]): HealthLevel {
  if (levels.length === 0) return 'healthy'
  return levels.reduce((a, b) => (healthLevelRank(b) > healthLevelRank(a) ? b : a))
}

// --- V2: formal data provenance & measured-value model ---------------------------------

/** Where a displayed value actually came from — never allowed to be ambiguous in the UI. */
export type DataProvenance = 'live' | 'simulated' | 'calculated' | 'ai_generated' | 'rule_validated' | 'human_approved'

export const PROVENANCE_LABELS: Record<DataProvenance, string> = {
  live: 'LIVE',
  simulated: 'SIMULATED',
  calculated: 'CALCULATED',
  ai_generated: 'AI GENERATED',
  rule_validated: 'RULE VALIDATED',
  human_approved: 'HUMAN APPROVED',
}

/** Fitness of a measurement for decision-making — independent of whether the reading itself looks "normal". */
export type DataQuality = 'high' | 'medium' | 'low' | 'unavailable'

export type MeasuredStatus = 'ok' | 'degraded' | 'stale' | 'unavailable'

/**
 * A single formalised input value. Every material reading surfaced by the Vessel Operational
 * State carries its own unit, timestamp, source system, quality, confidence and status — the
 * UI never presents a bare number without this context being available on demand.
 */
export interface MeasuredValue<T> {
  value: T
  unit: string
  timestampIso: string
  source: string
  quality: DataQuality
  confidencePercent: number
  status: MeasuredStatus
  provenance: DataProvenance
}

// --- V2: assistance-level framework -----------------------------------------------------

export type AssistanceLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4'

export const ASSISTANCE_LEVEL_LABELS: Record<AssistanceLevel, string> = {
  L0: 'Conventional',
  L1: 'Monitoring',
  L2: 'Decision Support',
  L3: 'Supervised Execution',
  L4: 'High Automation',
}

export const ASSISTANCE_LEVEL_DESCRIPTIONS: Record<AssistanceLevel, string> = {
  L0: 'Crew performs the operational function without system assistance.',
  L1: 'System observes, correlates and alerts. No recommendation is generated.',
  L2: 'System analyses and recommends; a human decides.',
  L3: 'A permitted low-risk action may proceed only after explicit human authorisation.',
  L4: 'Future conceptual capability only — not implemented for safety-critical functions in this POC.',
}

export function assistanceLevelRank(level: AssistanceLevel): number {
  return { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 }[level]
}

// --- V2: POC execution mode --------------------------------------------------------------

export type PocExecutionMode = 'offline' | 'connected'

export type AdapterConnectionState = 'simulated' | 'connected' | 'connecting' | 'unavailable_fallback'

// --- V2: operational envelope status ------------------------------------------------------

export type OddStatus = 'inside' | 'near_limit' | 'outside'

export const ODD_STATUS_LABELS: Record<OddStatus, string> = {
  inside: 'INSIDE ODD',
  near_limit: 'NEAR LIMIT',
  outside: 'OUTSIDE ODD',
}

// --- V2: system assurance -------------------------------------------------------------

export type AssuranceAvailability = 'available' | 'degraded' | 'unavailable'
