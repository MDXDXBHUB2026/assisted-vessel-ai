import type { AssuranceAvailability, HealthLevel, OddStatus, RiskLevel, SafetyVerdict, SystemState } from '@/types'

export const healthColor: Record<HealthLevel, { text: string; bg: string; border: string; dot: string }> = {
  healthy: { text: 'text-healthy-400', bg: 'bg-healthy-500/10', border: 'border-healthy-500/30', dot: 'bg-healthy-500' },
  advisory: { text: 'text-advisory-400', bg: 'bg-advisory-500/10', border: 'border-advisory-500/30', dot: 'bg-advisory-500' },
  warning: { text: 'text-warning-400', bg: 'bg-warning-500/10', border: 'border-warning-500/30', dot: 'bg-warning-500' },
  critical: { text: 'text-critical-400', bg: 'bg-critical-500/10', border: 'border-critical-500/30', dot: 'bg-critical-500' },
}

export const riskColor: Record<RiskLevel, { text: string; bg: string; border: string }> = {
  low: { text: 'text-healthy-400', bg: 'bg-healthy-500/10', border: 'border-healthy-500/30' },
  medium: { text: 'text-warning-400', bg: 'bg-warning-500/10', border: 'border-warning-500/30' },
  high: { text: 'text-critical-400', bg: 'bg-critical-500/10', border: 'border-critical-500/30' },
  severe: { text: 'text-critical-400', bg: 'bg-critical-500/15', border: 'border-critical-500/50' },
}

export const verdictColor: Record<SafetyVerdict, { text: string; bg: string; border: string; label: string }> = {
  passed: { text: 'text-healthy-400', bg: 'bg-healthy-500/10', border: 'border-healthy-500/30', label: 'PASSED' },
  conditional: { text: 'text-warning-400', bg: 'bg-warning-500/10', border: 'border-warning-500/30', label: 'CONDITIONAL' },
  blocked: { text: 'text-critical-400', bg: 'bg-critical-500/10', border: 'border-critical-500/30', label: 'BLOCKED' },
}

export const systemStateLabel: Record<SystemState, string> = {
  normal: 'NORMAL',
  degraded: 'DEGRADED',
  fallback: 'FALLBACK',
  contingency: 'CONTINGENCY',
}

export const systemStateColor: Record<SystemState, string> = {
  normal: 'text-healthy-400',
  degraded: 'text-warning-400',
  fallback: 'text-warning-400',
  contingency: 'text-critical-400',
}

export const oddStatusColor: Record<OddStatus, { text: string; bg: string; border: string }> = {
  inside: { text: 'text-healthy-400', bg: 'bg-healthy-500/10', border: 'border-healthy-500/30' },
  near_limit: { text: 'text-warning-400', bg: 'bg-warning-500/10', border: 'border-warning-500/30' },
  outside: { text: 'text-critical-400', bg: 'bg-critical-500/10', border: 'border-critical-500/30' },
}

export const assuranceColor: Record<AssuranceAvailability, string> = {
  available: 'text-healthy-400',
  degraded: 'text-warning-400',
  unavailable: 'text-critical-400',
}
