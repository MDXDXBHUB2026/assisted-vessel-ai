import clsx from 'clsx'

export function ProgressBar({ value, max = 100, tone = 'info' }: { value: number; max?: number; tone?: 'info' | 'healthy' | 'warning' | 'critical' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const tones: Record<string, string> = {
    info: 'bg-info-500',
    healthy: 'bg-healthy-500',
    warning: 'bg-warning-500',
    critical: 'bg-critical-500',
  }
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-hull-700">
      <div className={clsx('h-full rounded-full transition-all duration-500', tones[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}
