import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { HealthLevel, RiskLevel, SafetyVerdict } from '@/types'
import { healthColor, riskColor, verdictColor } from '@/utils/theme'

export function HealthBadge({ level, label }: { level: HealthLevel; label?: string }) {
  const c = healthColor[level]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', c.text, c.bg, c.border)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', c.dot)} />
      {label ?? level}
    </span>
  )
}

export function RiskBadge({ level, label }: { level: RiskLevel; label?: string }) {
  const c = riskColor[level]
  return <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', c.text, c.bg, c.border)}>{label ?? level}</span>
}

export function VerdictBadge({ verdict }: { verdict: SafetyVerdict }) {
  const c = verdictColor[verdict]
  return <span className={clsx('inline-flex items-center rounded border px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest', c.text, c.bg, c.border)}>{c.label}</span>
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'info' | 'healthy' | 'warning' | 'critical' }) {
  const tones: Record<string, string> = {
    neutral: 'text-ink-300 bg-hull-700/60 border-hull-500/40',
    info: 'text-info-400 bg-info-500/10 border-info-500/30',
    healthy: 'text-healthy-400 bg-healthy-500/10 border-healthy-500/30',
    warning: 'text-warning-400 bg-warning-500/10 border-warning-500/30',
    critical: 'text-critical-400 bg-critical-500/10 border-critical-500/30',
  }
  return <span className={clsx('inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium', tones[tone])}>{children}</span>
}
