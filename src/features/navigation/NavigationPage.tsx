import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { NavPlot } from '@/components/charts/NavPlot'
import { StatTile } from '@/components/ui/StatTile'
import { RiskBadge } from '@/components/ui/Badge'
import { ROUTE_WAYPOINTS } from '@/data/route'
import { formatLatLon, formatDuration } from '@/utils/format'
import { Compass, ShieldAlert } from 'lucide-react'

export function NavigationPage() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const targets = useSimulationStore((s) => s.targets)
  const recommendations = useSimulationStore((s) => s.recommendations).filter((r) => r.vesselFunction === 'navigation')

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <Compass size={18} className="text-info-400" /> Navigation Situational Awareness
        </h1>
        <p className="text-sm text-ink-500">Own-ship position, route, and synthetic target tracking with CPA/TCPA evaluation.</p>
      </div>

      <div className="rounded-md border border-info-500/30 bg-info-500/5 px-4 py-2.5 text-xs font-medium text-info-400">
        Navigational authority remains with the bridge team. This system observes and advises only — it does not alter course or speed.
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Situational Plot" className="lg:col-span-2" dense>
          <div className="aspect-square w-full">
            <NavPlot own={snapshot.navigation.position} ownHeading={snapshot.navigation.heading} targets={targets} routeWaypoints={ROUTE_WAYPOINTS} />
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Heading" value={snapshot.navigation.heading.toFixed(0)} unit="deg T" />
            <StatTile label="SOG" value={snapshot.navigation.speedOverGroundKn.toFixed(1)} unit="kn" />
            <StatTile label="Visibility" value={snapshot.environment.visibilityNm.toFixed(1)} unit="nm" tone={snapshot.environment.visibilityNm < 3 ? 'warning' : 'neutral'} />
            <StatTile label="Sea State" value={String(snapshot.environment.seaState)} tone={snapshot.environment.seaState > 6 ? 'warning' : 'neutral'} />
          </div>
          <Panel title="Position" dense>
            <p className="text-sm tabular-nums text-ink-100">{formatLatLon(snapshot.navigation.position.latitude, snapshot.navigation.position.longitude)}</p>
            <p className="mt-1 text-xs text-ink-500">GNSS confidence: {snapshot.navigation.gnssConfidence.toFixed(0)}%</p>
          </Panel>
        </div>
      </div>

      <Panel title="Target Tracking — CPA / TCPA">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-ink-500">
              <th className="pb-2 font-medium">Target</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Heading</th>
              <th className="pb-2 font-medium">Speed</th>
              <th className="pb-2 font-medium">CPA</th>
              <th className="pb-2 font-medium">TCPA</th>
              <th className="pb-2 font-medium">Relative Risk</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.id} className="border-t border-panel-border">
                <td className="py-2 font-medium text-ink-100">{t.label}</td>
                <td className="py-2 text-ink-400">{t.vesselType}</td>
                <td className="py-2 text-ink-400 tabular-nums">{t.heading.toFixed(0)}°</td>
                <td className="py-2 text-ink-400 tabular-nums">{t.speedKn.toFixed(1)} kn</td>
                <td className="py-2 tabular-nums text-ink-100">{t.cpaNm.toFixed(2)} nm</td>
                <td className="py-2 tabular-nums text-ink-100">{formatDuration(t.tcpaMinutes)}</td>
                <td className="py-2">
                  <RiskBadge level={t.relativeRisk === 'high' ? 'high' : t.relativeRisk === 'medium' ? 'medium' : 'low'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {recommendations.length > 0 && (
        <Panel title="Navigation Recommendations" subtitle="Evaluation only — bridge team decides">
          <ul className="flex flex-col gap-2">
            {recommendations.map((r) => (
              <li key={r.id} className="flex items-start gap-3 rounded-md border border-panel-border bg-panel-raised px-3 py-2.5 text-xs">
                <ShieldAlert size={14} className="mt-0.5 shrink-0 text-warning-400" />
                <div>
                  <div className="font-semibold text-ink-100">{r.title}</div>
                  <div className="mt-0.5 text-ink-500">{r.recommendedResponse}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
