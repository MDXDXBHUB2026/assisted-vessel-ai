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
  | 'shore_technical'
  | 'shore_marine_ops'
  | 'shore_safety'

export const AUTHORITY_LABELS: Record<RequiredAuthority, string> = {
  officer_of_the_watch: 'Officer of the Watch',
  master: 'Master',
  chief_engineer: 'Chief Engineer',
  shore_technical: 'Shore Technical Support',
  shore_marine_ops: 'Shore Marine Operations',
  shore_safety: 'Shore Safety Support',
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
