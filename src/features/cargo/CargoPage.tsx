import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { InstrumentRow } from '@/components/ui/InstrumentRow'
import { HealthBadge, RiskBadge } from '@/components/ui/Badge'
import { Snowflake } from 'lucide-react'
import type { RiskLevel } from '@/types'

const RISK_FROM_HEALTH: Record<string, RiskLevel> = { healthy: 'low', advisory: 'low', warning: 'medium', critical: 'high' }

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

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-sm border border-panel-border bg-panel px-4 py-3 sm:grid-cols-4">
        <InstrumentRow label="Total Containers" value={cargoReefer.totalContainers.toLocaleString()} />
        <InstrumentRow label="Reefer Containers" value={cargoReefer.reeferContainers.toLocaleString()} />
        <InstrumentRow label="Excursions" value={String(excursions.length)} tone={excursions.length > 0 ? 'warning' : 'healthy'} />
        <InstrumentRow label="Lashing / Stability" value={cargoReefer.lashingStatus} tone={cargoReefer.lashingStatus === 'healthy' ? 'healthy' : 'warning'} />
      </div>

      <Panel title="Reefer Units">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead>
              <tr className="text-ink-500">
                <th className="pb-2 font-medium">Container</th>
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 font-medium">Set Point</th>
                <th className="pb-2 font-medium">Supply</th>
                <th className="pb-2 font-medium">Return</th>
                <th className="pb-2 font-medium">Ambient</th>
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
                  <td className="py-2 tabular-nums text-ink-400">{u.returnTempC.toFixed(1)} °C</td>
                  <td className="py-2 tabular-nums text-ink-500">{u.ambientTempC.toFixed(1)} °C</td>
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
        </div>
      </Panel>

      {excursions.length > 0 && (
        <Panel title="Cargo Exposure &amp; Recommended Action" subtitle="For units outside set point">
          <ul className="flex flex-col gap-2 text-xs">
            {excursions.map((u) => {
              const deviation = Math.abs(u.actualTempC - u.setPointC)
              const confidence = Math.round(96 - deviation * 3)
              return (
                <li key={u.containerRef} className="flex flex-col gap-1 rounded-sm border border-warning-500/30 bg-warning-500/5 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-ink-100">{u.containerRef} — {u.cargoCategory}</span>
                    <RiskBadge level={RISK_FROM_HEALTH[u.risk] ?? 'low'} />
                  </div>
                  <p className="text-ink-300">
                    Cargo exposure: {deviation.toFixed(1)}°C deviation, supply/return spread {(u.returnTempC - u.actualTempC).toFixed(1)}°C. Confidence {Math.max(50, confidence)}%.
                    Priority: {u.risk === 'critical' ? 'Immediate inspection' : 'Inspect at next round'}.
                  </p>
                  <p className="text-ink-400">Crew response: dispatch crew to inspect unit, verify power supply and setpoint, and assess cargo condition. Escalate to shore technical support if unresolved within one watch.</p>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}
    </div>
  )
}
