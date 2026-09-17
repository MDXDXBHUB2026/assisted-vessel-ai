import { Link } from 'react-router-dom'
import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { InstrumentRow } from '@/components/ui/InstrumentRow'
import { HealthBadge } from '@/components/ui/Badge'
import { StreamingChart } from '@/components/charts/StreamingChart'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { correlateAlarms } from '@ave/decision-engine/alarmCorrelation'
import { SYSTEM_AREA_LABELS } from '@/types'
import { Wrench, ArrowUpRight } from 'lucide-react'

export function EngineeringOperationsPage() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const analysis = useSimulationStore((s) => s.machineryAnalysis)
  const history = useSimulationStore((s) => s.telemetryHistory)
  const rawAlarms = useSimulationStore((s) => s.rawAlarms)
  const maintenanceItems = useSimulationStore((s) => s.maintenanceItems)

  const { correlated, uncorrelatedCount } = correlateAlarms(rawAlarms)
  const activeAlarms = rawAlarms.filter((a) => a.active)
  const engineHealth = snapshot.systemHealth.find((s) => s.area === 'main_engine')!
  const auxHealth = snapshot.systemHealth.find((s) => s.area === 'auxiliary_machinery')!
  const elecHealth = snapshot.systemHealth.find((s) => s.area === 'electrical_power')!
  const fuelHealth = snapshot.systemHealth.find((s) => s.area === 'fuel_energy')!

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
            <Wrench size={18} className="text-info-400" /> Engineering Operations
          </h1>
          <p className="text-sm text-ink-500">Chief Engineer workspace: main engine, auxiliary machinery, electrical, fuel/energy, condition and alarm intelligence, and maintenance planning in one operating picture.</p>
        </div>
        <div className="flex gap-3 text-[11px]">
          <Link to="/vessel/machinery" className="flex items-center gap-1 text-info-400 hover:text-info-300">Machinery Detail <ArrowUpRight size={11} /></Link>
          <Link to="/vessel/maintenance" className="flex items-center gap-1 text-info-400 hover:text-info-300">Maintenance Detail <ArrowUpRight size={11} /></Link>
          <Link to="/vessel/alarms" className="flex items-center gap-1 text-info-400 hover:text-info-300">Alarm Detail <ArrowUpRight size={11} /></Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { area: 'main_engine' as const, h: engineHealth },
          { area: 'auxiliary_machinery' as const, h: auxHealth },
          { area: 'electrical_power' as const, h: elecHealth },
          { area: 'fuel_energy' as const, h: fuelHealth },
        ].map(({ area, h }) => (
          <div key={area} className="flex items-center justify-between rounded-sm border border-panel-border bg-panel-raised px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-ink-100">{SYSTEM_AREA_LABELS[area]}</div>
              <div className="truncate text-[10px] text-ink-500">{h.headline}</div>
            </div>
            <HealthBadge level={h.health} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Condition Intelligence" dense>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <InstrumentRow label="Health Score" value={String(analysis.healthScore)} unit="/100" tone={analysis.healthScore < 65 ? 'warning' : 'healthy'} />
            <InstrumentRow label="Anomaly Score" value={String(analysis.anomalyScore)} unit="/100" tone={analysis.anomalyScore > 35 ? 'warning' : 'healthy'} />
          </div>
          <StreamingChart values={history.anomalyScore.values} color="#eda528" unit="/100" height={70} thresholdMin={65} />
          <p className="mt-1 text-[11px] text-ink-500">{analysis.probableCondition}</p>
        </Panel>

        <Panel title="Alarm Intelligence" dense action={<span className="text-[10px] text-ink-500">RAW {activeAlarms.length} / CORRELATED {correlated.length}</span>}>
          {correlated.length === 0 ? (
            <p className="text-xs text-ink-500">No correlated events. {uncorrelatedCount} independent alarm(s) tracked.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {correlated.map((c) => (
                <li key={c.id} className="rounded-sm border border-panel-border bg-panel-raised px-2 py-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink-100">{c.title}</span>
                    <HealthBadge level={c.priority} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-500">{c.probableCommonCause}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Maintenance Intelligence" dense>
          <ul className="flex flex-col gap-2">
            {maintenanceItems.map((m) => (
              <li key={m.id} className="text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink-100">{m.component}</span>
                  <span className="text-ink-500">{m.failureProbabilityPercent}% failure prob.</span>
                </div>
                <ProgressBar value={100 - m.failureProbabilityPercent} tone={m.failureProbabilityPercent > 15 ? 'warning' : 'healthy'} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-warning-400">POC Calculation — illustrative, not an engineering certification</p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Main Engine — Exhaust Deviation" dense>
          <StreamingChart values={history.exhaustTempDeviationC.values} color="#f0473a" unit="°C" baseline={analysis.baselineExhaustDeviationC} />
        </Panel>
        <Panel title="Fuel Consumption" dense>
          <StreamingChart values={history.fuelConsumptionRateTonPerDay.values} color="#5BC0BE" unit="t/day" baseline={snapshot.fuelEnergy.baselineConsumptionRateTonPerDay} />
        </Panel>
      </div>
    </div>
  )
}
