import type { ReactNode } from 'react'
import clsx from 'clsx'

/** A dense label/value instrumentation row — the primary building block for replacing
 * card-grid layouts with a console-like readout. */
export function InstrumentRow({ label, value, unit, tone = 'neutral', trailing, dim }: { label: string; value: string; unit?: string; tone?: 'neutral' | 'healthy' | 'warning' | 'critical' | 'info'; trailing?: ReactNode; dim?: boolean }) {
  const tones: Record<string, string> = {
    neutral: 'text-ink-100',
    healthy: 'text-healthy-400',
    warning: 'text-warning-400',
    critical: 'text-critical-400',
    info: 'text-info-400',
  }
  return (
    <div className={clsx('flex items-center justify-between gap-3 border-b border-panel-border/70 py-1.5 last:border-0', dim && 'opacity-60')}>
      <span className="text-[11px] uppercase tracking-wide text-ink-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className={clsx('tabular-nums text-sm font-semibold', tones[tone])}>
          {value}
          {unit && <span className="ml-1 text-[10px] font-normal text-ink-500">{unit}</span>}
        </span>
        {trailing}
      </div>
    </div>
  )
}

/** A titled group of instrument rows — visually a thin instrumentation block, not a card. */
export function InstrumentGroup({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('border-l-2 border-hull-600 pl-3', className)}>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-ink-700">{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}
