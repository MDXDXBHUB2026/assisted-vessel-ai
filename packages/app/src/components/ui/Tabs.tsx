import { useState, type ReactNode } from 'react'
import clsx from 'clsx'

export interface TabItem {
  key: string
  label: string
  content: ReactNode
}

export function Tabs({ items, defaultKey }: { items: TabItem[]; defaultKey?: string }) {
  const [active, setActive] = useState(defaultKey ?? items[0]?.key)
  const activeItem = items.find((i) => i.key === active)
  return (
    <div>
      <div className="flex gap-1 border-b border-panel-border">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => setActive(item.key)}
            className={clsx(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active === item.key ? 'border-info-500 text-ink-000' : 'border-transparent text-ink-500 hover:text-ink-300',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="pt-3">{activeItem?.content}</div>
    </div>
  )
}
