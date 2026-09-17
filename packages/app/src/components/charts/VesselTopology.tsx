import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { HealthLevel, VesselSystemArea } from '@/types'
import { healthColor } from '@/utils/theme'

export interface TopologyNode {
  area: VesselSystemArea
  label: string
  icon: ReactNode
  health: HealthLevel
  /** Position as a percentage of the topology canvas. */
  x: number
  y: number
}

export interface TopologyLink {
  from: VesselSystemArea
  to: VesselSystemArea
  label: string
}

/**
 * A simplified functional-system topology of the vessel — not a literal deck plan, but a
 * meaningful representation of how the eight monitored system areas relate (power, monitoring
 * and command links), so selecting an area reads as "part of a vessel" rather than a card grid.
 */
export function VesselTopology({ nodes, links, selected, onSelect }: { nodes: TopologyNode[]; links: TopologyLink[]; selected: VesselSystemArea | null; onSelect: (area: VesselSystemArea) => void }) {
  const find = (area: VesselSystemArea) => nodes.find((n) => n.area === area)

  return (
    <div className="relative aspect-[21/9] w-full overflow-hidden rounded-sm border border-panel-border bg-hull-950">
      {/* Hull silhouette */}
      <div
        className="absolute inset-x-[4%] inset-y-[20%] bg-gradient-to-r from-hull-800 to-hull-750"
        style={{ clipPath: 'polygon(0% 20%, 92% 20%, 100% 50%, 92% 80%, 0% 80%)' }}
      />
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(#182233 1px, transparent 1px), linear-gradient(90deg, #182233 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.25 }} />

      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {links.map((l) => {
          const a = find(l.from)
          const b = find(l.to)
          if (!a || !b) return null
          return (
            <line
              key={`${l.from}-${l.to}`}
              x1={`${a.x}%`}
              y1={`${a.y}%`}
              x2={`${b.x}%`}
              y2={`${b.y}%`}
              stroke="#3a4d74"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          )
        })}
      </svg>

      {nodes.map((n) => {
        const c = healthColor[n.health]
        const isSelected = selected === n.area
        return (
          <button
            key={n.area}
            onClick={() => onSelect(n.area)}
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
            className={clsx(
              'absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-sm border px-2.5 py-2 text-center transition-all',
              isSelected ? 'border-info-400 bg-hull-700 shadow-[0_0_0_2px_rgba(91,192,190,0.3)]' : `${c.border} ${c.bg} hover:border-info-500/50`,
            )}
          >
            <span className={c.text}>{n.icon}</span>
            <span className="whitespace-nowrap text-[10px] font-semibold text-ink-100">{n.label}</span>
            <span className={clsx('h-1.5 w-1.5 rounded-full', c.dot)} />
          </button>
        )
      })}
    </div>
  )
}
