import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  dense?: boolean
}

export function Panel({ title, subtitle, action, dense, className, children, ...rest }: PanelProps) {
  return (
    <div className={clsx('rounded-sm border border-panel-border bg-panel', className)} {...rest}>
      {(title || action) && (
        <div className={clsx('flex items-start justify-between gap-3 border-b border-panel-border', dense ? 'px-3 py-2' : 'px-4 py-3')}>
          <div>
            {title && <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-000">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={dense ? 'p-3' : 'p-4'}>{children}</div>
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-500">{children}</div>
}
