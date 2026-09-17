import { useState, type ReactNode } from 'react'
import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { HealthBadge } from '@/components/ui/Badge'
import { InstrumentRow } from '@/components/ui/InstrumentRow'
import { Sparkline } from '@/components/charts/Sparkline'
import { VesselTopology, type TopologyLink, type TopologyNode } from '@/components/charts/VesselTopology'
import { useMetricHistory } from '@/hooks/useMetricHistory'
import { SYSTEM_AREA_LABELS, type VesselSnapshot, type VesselSystemArea } from '@/types'
import { systemStateColor, systemStateLabel } from '@/utils/theme'
import { Boxes, Compass, Gauge, Wrench, Zap, Fuel, Snowflake, ShieldAlert, Radio } from 'lucide-react'

const AREA_ICONS: Record<VesselSystemArea, ReactNode> = {
  navigation: <Compass size={16} />,
  main_engine: <Gauge size={16} />,
  auxiliary_machinery: <Wrench size={16} />,
  electrical_power: <Zap size={16} />,
  fuel_energy: <Fuel size={16} />,
  cargo_reefer: <Snowflake size={16} />,
  safety: <ShieldAlert size={16} />,
  communications: <Radio size={16} />,
}

const NODE_POSITIONS: Record<VesselSystemArea, { x: number; y: number }> = {
  navigation: { x: 85, y: 50 },
  communications: { x: 88, y: 22 },
  safety: { x: 50, y: 78 },
  cargo_reefer: { x: 50, y: 30 },
  electrical_power: { x: 28, y: 30 },
  auxiliary_machinery: { x: 22, y: 70 },
  fuel_energy: { x: 10, y: 60 },
  main_engine: { x: 14, y: 32 },
}

const LINKS: TopologyLink[] = [
  { from: 'navigation', to: 'communications', label: 'Command & reporting' },
  { from: 'navigation', to: 'cargo_reefer', label: 'Monitoring' },
  { from: 'main_engine', to: 'auxiliary_machinery', label: 'Shared systems' },
  { from: 'main_engine', to: 'electrical_power', label: 'Shaft generator' },
  { from: 'main_engine', to: 'fuel_energy', label: 'Fuel supply' },
  { from: 'electrical_power', to: 'cargo_reefer', label: 'Reefer power' },
  { from: 'electrical_power', to: 'safety', label: 'Emergency power' },
  { from: 'safety', to: 'navigation', label: 'Alarm & command' },
]

export function DigitalTwinPage() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const [selected, setSelected] = useState<VesselSystemArea | null>('main_engine')

  const nodes: TopologyNode[] = snapshot.systemHealth.map((s) => ({
    area: s.area,
    label: SYSTEM_AREA_LABELS[s.area],
    icon: AREA_ICONS[s.area],
    health: s.health,
    ...NODE_POSITIONS[s.area],
  }))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <Boxes size={18} className="text-info-400" /> Vessel Digital Twin
        </h1>
        <p className="text-sm text-ink-500">A live, synthetic operational representation of {snapshot.identity.name}. Select a system to inspect condition, trend and recommendations.</p>
      </div>

      <VesselTopology nodes={nodes} links={LINKS} selected={selected} onSelect={setSelected} />

      {selected && <SystemDetail area={selected} />}
    </div>
  )
}

function SystemDetail({ area }: { area: VesselSystemArea }) {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const recommendations = useSimulationStore((s) => s.recommendations).filter((r) => r.vesselFunction === area)
  const alarms = useSimulationStore((s) => s.rawAlarms).filter((a) => a.area === area && a.active)
  const maintenanceItems = useSimulationStore((s) => s.maintenanceItems).filter((m) => m.area.toLowerCase().includes(area.replace(/_/g, ' ')) || (area === 'main_engine' && m.area === 'Main Engine'))
  const detail = snapshot.systemHealth.find((s) => s.area === area)!
  const trend = useMetricHistory((s) => primaryMetric(s.snapshot, area), 40)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel title={`${SYSTEM_AREA_LABELS[area]} — Condition`} dense>
        <div className="mb-2 flex items-center justify-between">
          <HealthBadge level={detail.health} />
          <span className={`text-xs font-bold uppercase tracking-wide ${systemStateColor[detail.state]}`}>{systemStateLabel[detail.state]}</span>
        </div>
        <p className="text-sm text-ink-300">{detail.headline}</p>
        <div className="mt-3">
          <Sparkline data={trend} height={70} />
          <div className="mt-1 flex justify-between text-[11px] text-ink-500">
            <span>Confidence: {detail.confidence}%</span>
            <span>{trend.length} samples</span>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-0.5">
          <InstrumentRow label="Data source" value="Vessel Simulation" dim />
        </div>
      </Panel>

      <Panel title={`Active Alarms (${alarms.length})`} dense>
        {alarms.length === 0 ? (
          <p className="text-xs text-ink-500">No active alarms for this system.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {alarms.map((a) => (
              <li key={a.id} className="rounded-sm border border-panel-border bg-panel-raised px-2.5 py-1.5 text-xs text-ink-200">
                {a.description}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 text-[11px] uppercase tracking-wide text-ink-700">Maintenance implications</div>
        {maintenanceItems.length === 0 ? (
          <p className="mt-1 text-xs text-ink-500">No open maintenance items associated with this system.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {maintenanceItems.map((m) => (
              <li key={m.id} className="text-xs text-ink-300">
                {m.component} — RUL {m.remainingUsefulLifeHours.toLocaleString()}h
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Recommendations (${recommendations.length})`} dense>
        {recommendations.length === 0 ? (
          <p className="text-xs text-ink-500">No recommendations currently associated with this system.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recommendations.map((r) => (
              <li key={r.id} className="rounded-sm border border-panel-border bg-panel-raised px-2.5 py-1.5 text-xs text-ink-200">
                {r.title} — <span className="text-ink-500">{r.status.replace(/_/g, ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function primaryMetric(snapshot: VesselSnapshot, area: VesselSystemArea): number {
  switch (area) {
    case 'navigation':
      return snapshot.navigation.gnssConfidence
    case 'main_engine':
      return snapshot.mainEngine.exhaustTempDeviationC
    case 'auxiliary_machinery':
      return snapshot.auxMachinery.auxEngineHealthScore
    case 'electrical_power':
      return snapshot.electricalPower.blackoutRiskScore
    case 'fuel_energy':
      return snapshot.fuelEnergy.fuelConsumptionRateTonPerDay
    case 'cargo_reefer':
      return snapshot.cargoReefer.reeferUnits[3]?.actualTempC ?? 0
    case 'safety':
      return snapshot.safetySystems.bilgeAlarmActive ? 100 : 0
    case 'communications':
      return snapshot.communications.satelliteConfidence
  }
}
