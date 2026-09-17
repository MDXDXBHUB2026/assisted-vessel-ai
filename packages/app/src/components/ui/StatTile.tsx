import type { ReactNode } from 'react'
import clsx from 'clsx'

export function StatTile({ label, value, unit, tone = 'neutral', sub, icon }: { label: string; value: string; unit?: string; tone?: 'neutral' | 'healthy' | 'warning' | 'critical' | 'info'; sub?: ReactNode; icon?: ReactNode }) {
  const tones: Record<string, string> = {
    neutral: 'text-ink-000',
    healthy: 'text-healthy-400',
    warning: 'text-warning-400',
    critical: 'text-critical-400',
    info: 'text-info-400',
  }
  return (
    <div className="rounded-sm border border-panel-border bg-panel-raised px-3.5 py-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{label}</div>
        {icon}
      </div>
      <div className={clsx('mt-1 flex items-baseline gap-1 tabular-nums', tones[tone])}>
        <span className="text-xl font-semibold">{value}</span>
        {unit && <span className="text-xs text-ink-500">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-500">{sub}</div>}
    </div>
  )
}
