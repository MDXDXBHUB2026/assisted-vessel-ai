import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import {
  LayoutGrid,
  Boxes,
  Compass,
  Gauge,
  Wrench,
  Sailboat,
  Snowflake,
  ShieldAlert,
  BellRing,
  ScanLine,
  ClipboardCheck,
  History,
  Bot,
  Building2,
  Network,
  BookOpen,
  SlidersHorizontal,
} from 'lucide-react'
import type { ReactNode } from 'react'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

const VESSEL_ITEMS: NavItem[] = [
  { to: '/vessel/console', label: 'Assisted Console', icon: <LayoutGrid size={16} /> },
  { to: '/vessel/digital-twin', label: 'Digital Twin', icon: <Boxes size={16} /> },
  { to: '/vessel/navigation', label: 'Navigation', icon: <Compass size={16} /> },
  { to: '/vessel/machinery', label: 'Machinery', icon: <Gauge size={16} /> },
  { to: '/vessel/maintenance', label: 'Predictive Maintenance', icon: <Wrench size={16} /> },
  { to: '/vessel/voyage-energy', label: 'Voyage & Energy', icon: <Sailboat size={16} /> },
  { to: '/vessel/cargo', label: 'Cargo / Reefer', icon: <Snowflake size={16} /> },
  { to: '/vessel/safety', label: 'Safety Intelligence', icon: <ShieldAlert size={16} /> },
  { to: '/vessel/alarms', label: 'Alarm Management', icon: <BellRing size={16} /> },
  { to: '/vessel/envelope', label: 'Operational Envelope', icon: <ScanLine size={16} /> },
  { to: '/vessel/decisions', label: 'Human Decision Centre', icon: <ClipboardCheck size={16} /> },
  { to: '/vessel/audit', label: 'Audit Trail', icon: <History size={16} /> },
  { to: '/vessel/copilot', label: 'Operations Copilot', icon: <Bot size={16} /> },
  { to: '/vessel/scenarios', label: 'Scenario Control', icon: <SlidersHorizontal size={16} /> },
]

const SHORE_ITEMS: NavItem[] = [{ to: '/shore', label: 'Shore Operations Centre', icon: <Building2 size={16} /> }]

const INFO_ITEMS: NavItem[] = [
  { to: '/architecture', label: 'System Architecture', icon: <Network size={16} /> },
  { to: '/conops', label: 'Concept of Operations', icon: <BookOpen size={16} /> },
]

export function SideNav({ section }: { section: 'vessel' | 'shore' }) {
  const items = section === 'vessel' ? VESSEL_ITEMS : SHORE_ITEMS
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r border-panel-border bg-hull-900 px-2 py-4">
      <div>
        <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-ink-700">{section === 'vessel' ? 'Onboard Vessel' : 'Shore'}</div>
        <div className="flex flex-col gap-0.5">
          {items.map((item) => (
            <SideLink key={item.to} item={item} />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-ink-700">Engineering</div>
        <div className="flex flex-col gap-0.5">
          {INFO_ITEMS.map((item) => (
            <SideLink key={item.to} item={item} />
          ))}
          <SideLink item={{ to: section === 'vessel' ? '/shore' : '/vessel/console', label: section === 'vessel' ? 'Switch to Shore' : 'Switch to Vessel', icon: <Boxes size={16} /> }} />
        </div>
      </div>
    </nav>
  )
}

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        clsx('flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors', isActive ? 'bg-info-500/10 text-info-400' : 'text-ink-400 hover:bg-hull-700/60 hover:text-ink-100')
      }
    >
      {item.icon}
      {item.label}
    </NavLink>
  )
}
