import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { StatTile } from '@/components/ui/StatTile'
import { HealthBadge } from '@/components/ui/Badge'
import { Snowflake } from 'lucide-react'

export function CargoPage() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const { cargoReefer } = snapshot
  const excursions = cargoReefer.reeferUnits.filter((u) => u.risk !== 'healthy')

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <Snowflake size={18} className="text-info-400" /> Cargo / Reefer Intelligence
        </h1>
        <p className="text-sm text-ink-500">Synthetic reefer-container monitoring. No actual customer or container data is represented.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total Containers" value={cargoReefer.totalContainers.toLocaleString()} />
        <StatTile label="Reefer Containers" value={cargoReefer.reeferContainers.toLocaleString()} />
        <StatTile label="Excursions" value={String(excursions.length)} tone={excursions.length > 0 ? 'warning' : 'healthy'} />
        <StatTile label="Lashing / Stability" value={cargoReefer.lashingStatus} tone={cargoReefer.lashingStatus === 'healthy' ? 'healthy' : 'warning'} />
      </div>

      <Panel title="Reefer Units">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-ink-500">
              <th className="pb-2 font-medium">Container</th>
              <th className="pb-2 font-medium">Category</th>
              <th className="pb-2 font-medium">Set Point</th>
              <th className="pb-2 font-medium">Actual</th>
              <th className="pb-2 font-medium">Trend</th>
              <th className="pb-2 font-medium">Power</th>
              <th className="pb-2 font-medium">Alarms</th>
              <th className="pb-2 font-medium">Risk</th>
            </tr>
          </thead>
          <tbody>
            {cargoReefer.reeferUnits.map((u) => (
              <tr key={u.containerRef} className="border-t border-panel-border">
                <td className="py-2 font-medium text-ink-100">{u.containerRef}</td>
                <td className="py-2 text-ink-400">{u.cargoCategory}</td>
                <td className="py-2 tabular-nums text-ink-400">{u.setPointC.toFixed(1)} °C</td>
                <td className="py-2 tabular-nums text-ink-100">{u.actualTempC.toFixed(1)} °C</td>
                <td className="py-2 text-ink-400 capitalize">{u.trend}</td>
                <td className="py-2 text-ink-400 capitalize">{u.powerStatus.replace(/_/g, ' ')}</td>
                <td className="py-2 tabular-nums text-ink-400">{u.alarmCount}</td>
                <td className="py-2">
                  <HealthBadge level={u.risk} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {excursions.length > 0 && (
        <Panel title="Recommended Action" subtitle="For units outside set point">
          <ul className="flex flex-col gap-2 text-xs">
            {excursions.map((u) => (
              <li key={u.containerRef} className="rounded-md border border-warning-500/30 bg-warning-500/5 px-3 py-2">
                <span className="font-semibold text-ink-100">{u.containerRef}</span> — dispatch crew to inspect unit, verify power supply and setpoint, and assess cargo condition.
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
