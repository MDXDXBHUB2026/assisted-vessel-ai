import { useState, type ReactNode } from 'react'
import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { HealthBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Sparkline } from '@/components/charts/Sparkline'
import { useMetricHistory } from '@/hooks/useMetricHistory'
import { SYSTEM_AREA_LABELS, type VesselSystemArea } from '@/types'
import { systemStateColor, systemStateLabel } from '@/utils/theme'
import { Boxes, Compass, Gauge, Wrench, Zap, Fuel, Snowflake, ShieldAlert, Radio } from 'lucide-react'

const AREA_ICONS: Record<VesselSystemArea, ReactNode> = {
  navigation: <Compass size={20} />,
  main_engine: <Gauge size={20} />,
  auxiliary_machinery: <Wrench size={20} />,
  electrical_power: <Zap size={20} />,
  fuel_energy: <Fuel size={20} />,
  cargo_reefer: <Snowflake size={20} />,
  safety: <ShieldAlert size={20} />,
  communications: <Radio size={20} />,
}

export function DigitalTwinPage() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const [openArea, setOpenArea] = useState<VesselSystemArea | null>(null)

  const detail = snapshot.systemHealth.find((s) => s.area === openArea)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <Boxes size={18} className="text-info-400" /> Vessel Digital Twin
        </h1>
        <p className="text-sm text-ink-500">A live, synthetic operational representation of {snapshot.identity.name}. Select a system to view detail, trend and recommendations.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {snapshot.systemHealth.map((s) => (
          <button key={s.area} onClick={() => setOpenArea(s.area)} className="group rounded-lg border border-panel-border bg-panel p-4 text-left transition-colors hover:border-info-500/40 hover:bg-panel-raised">
            <div className="flex items-center justify-between">
              <span className="text-info-400">{AREA_ICONS[s.area]}</span>
              <HealthBadge level={s.health} />
            </div>
            <div className="mt-3 text-sm font-semibold text-ink-100">{SYSTEM_AREA_LABELS[s.area]}</div>
            <div className="mt-1 line-clamp-2 text-xs text-ink-500">{s.headline}</div>
            <div className={`mt-2 text-[10px] font-bold uppercase tracking-wide ${systemStateColor[s.state]}`}>{systemStateLabel[s.state]}</div>
          </button>
        ))}
      </div>

      {openArea && detail && (
        <Modal title={SYSTEM_AREA_LABELS[openArea]} onClose={() => setOpenArea(null)} wide>
          <SystemDetail area={openArea} />
        </Modal>
      )}
    </div>
  )
}

function SystemDetail({ area }: { area: VesselSystemArea }) {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const recommendations = useSimulationStore((s) => s.recommendations).filter((r) => r.vesselFunction === area)
  const alarms = useSimulationStore((s) => s.rawAlarms).filter((a) => a.area === area && a.active)
  const detail = snapshot.systemHealth.find((s) => s.area === area)!
  const trend = useMetricHistory((s) => primaryMetric(s.snapshot, area), 40)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <HealthBadge level={detail.health} />
        <span className={`text-xs font-bold uppercase tracking-wide ${systemStateColor[detail.state]}`}>{systemStateLabel[detail.state]}</span>
      </div>
      <p className="text-sm text-ink-300">{detail.headline}</p>

      <Panel title="Trend" dense>
        <Sparkline data={trend} height={80} />
        <div className="mt-1 flex justify-between text-[11px] text-ink-500">
          <span>Confidence: {detail.confidence}%</span>
          <span>{trend.length} samples</span>
        </div>
      </Panel>

      <Panel title={`Active Events (${alarms.length})`} dense>
        {alarms.length === 0 ? (
          <p className="text-xs text-ink-500">No active alarms for this system.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {alarms.map((a) => (
              <li key={a.id} className="rounded border border-panel-border bg-panel-raised px-2.5 py-1.5 text-xs text-ink-200">
                {a.description}
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
              <li key={r.id} className="rounded border border-panel-border bg-panel-raised px-2.5 py-1.5 text-xs text-ink-200">
                {r.title} — <span className="text-ink-500">{r.status.replace(/_/g, ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function primaryMetric(snapshot: import('@/types').VesselSnapshot, area: VesselSystemArea): number {
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
