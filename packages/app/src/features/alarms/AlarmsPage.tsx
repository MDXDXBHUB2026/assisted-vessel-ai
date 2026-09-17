import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { HealthBadge } from '@/components/ui/Badge'
import { StatTile } from '@/components/ui/StatTile'
import { correlateAlarms } from '@ave/decision-engine/alarmCorrelation'
import { SYSTEM_AREA_LABELS } from '@/types'
import { BellRing } from 'lucide-react'

export function AlarmsPage() {
  const rawAlarms = useSimulationStore((s) => s.rawAlarms)
  const active = rawAlarms.filter((a) => a.active)
  const { correlated, uncorrelatedCount } = correlateAlarms(rawAlarms)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <BellRing size={18} className="text-info-400" /> Intelligent Alarm Management
        </h1>
        <p className="text-sm text-ink-500">Raw alarms are correlated into probable underlying operational conditions to reduce crew workload.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <StatTile label="Raw Alarms" value={String(active.length)} tone={active.length > 0 ? 'warning' : 'healthy'} />
        <StatTile label="Correlated Operational Events" value={String(correlated.length)} tone={correlated.length > 0 ? 'warning' : 'healthy'} sub={`${uncorrelatedCount} uncorrelated`} />
      </div>

      <Panel title="Correlated Operational Events">
        {correlated.length === 0 ? (
          <p className="text-sm text-ink-500">No correlated events. Try the ALARM CASCADE scenario to see multiple related alarms fuse into one probable cause.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {correlated.map((c) => (
              <div key={c.id} className="rounded-sm border border-panel-border bg-panel-raised p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-ink-100">{c.title}</div>
                  <HealthBadge level={c.priority} />
                </div>
                <p className="mt-1 text-xs text-ink-400">{c.probableCommonCause}</p>
                <p className="mt-1 text-xs text-ink-500">
                  Primary alarm: {c.primaryAlarmId} · Secondary effects: {c.secondaryAlarmIds.length}
                </p>
                <p className="mt-2 text-xs font-medium text-info-400">Recommended crew response: {c.recommendedCrewResponse}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Raw Alarm Log">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-ink-500">
              <th className="pb-2 font-medium">Time</th>
              <th className="pb-2 font-medium">Area</th>
              <th className="pb-2 font-medium">Description</th>
              <th className="pb-2 font-medium">Severity</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rawAlarms
              .slice()
              .reverse()
              .map((a) => (
                <tr key={a.id} className="border-t border-panel-border">
                  <td className="py-2 tabular-nums text-ink-400">{a.timestampIso.slice(11, 16)}</td>
                  <td className="py-2 text-ink-400">{SYSTEM_AREA_LABELS[a.area]}</td>
                  <td className="py-2 text-ink-100">{a.description}</td>
                  <td className="py-2">
                    <HealthBadge level={a.severity} />
                  </td>
                  <td className="py-2 text-ink-400">{a.active ? 'Active' : 'Cleared'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
