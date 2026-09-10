import { Link } from 'react-router-dom'
import { useSimulationStore } from '@/store/simulationStore'
import { Panel, SectionLabel } from '@/components/ui/Panel'
import { HealthBadge } from '@/components/ui/Badge'
import { StatTile } from '@/components/ui/StatTile'
import { SYSTEM_AREA_LABELS, OPERATIONAL_MODE_LABELS, type OperationalMode } from '@/types'
import { formatDateUtc, formatLatLon } from '@/utils/format'
import { systemStateColor, systemStateLabel } from '@/utils/theme'
import { ArrowUpRight } from 'lucide-react'

const MODES: OperationalMode[] = ['open_sea', 'coastal', 'traffic_separation', 'congested_waters', 'port_approach', 'manoeuvring', 'anchored', 'alongside']

export function ConsolePage() {
  const state = useSimulationStore()
  const { snapshot, recommendations, rawAlarms, activeScenario } = state
  const awaiting = recommendations.filter((r) => r.status === 'awaiting_decision')
  const activeAlarms = rawAlarms.filter((a) => a.active)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink-000">Assisted Operations Console</h1>
          <p className="text-sm text-ink-500">
            {snapshot.identity.name} · {snapshot.identity.vesselType} · {formatDateUtc(snapshot.simTimeIso)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SectionLabel>Operating Mode</SectionLabel>
          <select
            value={snapshot.operationalMode}
            onChange={(e) => state.setOperationalMode(e.target.value as OperationalMode)}
            className="rounded-md border border-hull-500/40 bg-hull-800 px-2.5 py-1.5 text-xs font-medium text-ink-100"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {OPERATIONAL_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeScenario !== 'normal_operations' && (
        <div className="rounded-md border border-warning-500/30 bg-warning-500/10 px-4 py-2 text-xs font-medium text-warning-400">
          Active scenario: {activeScenario.replace(/_/g, ' ')} — synthetic condition in progress. See Scenario Control for details.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Position" value={formatLatLon(snapshot.navigation.position.latitude, snapshot.navigation.position.longitude)} />
        <StatTile label="Heading" value={snapshot.navigation.heading.toFixed(0)} unit="deg" />
        <StatTile label="Speed (SOG)" value={snapshot.navigation.speedOverGroundKn.toFixed(1)} unit="kn" />
        <StatTile label="Main Engine Load" value={snapshot.mainEngine.loadPercent.toFixed(0)} unit="%" tone={snapshot.mainEngine.loadPercent > 90 ? 'warning' : 'neutral'} />
        <StatTile label="Fuel Rate" value={snapshot.fuelEnergy.fuelConsumptionRateTonPerDay.toFixed(0)} unit="t/day" />
        <StatTile label="Active Alarms" value={String(activeAlarms.length)} tone={activeAlarms.length > 0 ? 'warning' : 'healthy'} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="System Health" subtitle="Vessel Digital Twin summary" className="xl:col-span-2" action={<Link to="/vessel/digital-twin" className="flex items-center gap-1 text-xs text-info-400 hover:text-info-300">Open Digital Twin <ArrowUpRight size={12} /></Link>}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {snapshot.systemHealth.map((s) => (
              <div key={s.area} className="flex items-center justify-between rounded-md border border-panel-border bg-panel-raised px-3 py-2.5">
                <div>
                  <div className="text-xs font-semibold text-ink-100">{SYSTEM_AREA_LABELS[s.area]}</div>
                  <div className="mt-0.5 text-[11px] text-ink-500">{s.headline}</div>
                  <div className={`mt-1 text-[10px] font-bold uppercase tracking-wide ${systemStateColor[s.state]}`}>{systemStateLabel[s.state]}</div>
                </div>
                <HealthBadge level={s.health} />
              </div>
            ))}
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Recommendations Awaiting Decision" action={<Link to="/vessel/decisions" className="text-xs text-info-400 hover:text-info-300">Decision Centre</Link>}>
            {awaiting.length === 0 ? (
              <p className="text-sm text-ink-500">No recommendations currently require a decision.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {awaiting.slice(0, 4).map((r) => (
                  <li key={r.id} className="rounded-md border border-panel-border bg-panel-raised px-3 py-2 text-xs">
                    <div className="font-semibold text-ink-100">{r.title}</div>
                    <div className="mt-0.5 text-ink-500">Requires: {r.requiredAuthority.replace(/_/g, ' ')}</div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Safety &amp; Communications">
            <div className="flex flex-col gap-2 text-xs">
              <Row label="Fire Detection" value={snapshot.safetySystems.fireDetectionOnline ? 'Online' : 'Offline'} ok={snapshot.safetySystems.fireDetectionOnline} />
              <Row label="Watertight Integrity" value={snapshot.safetySystems.watertightIntegrityOk ? 'Confirmed' : 'Compromised'} ok={snapshot.safetySystems.watertightIntegrityOk} />
              <Row label="Bilge Alarm" value={snapshot.safetySystems.bilgeAlarmActive ? 'Active' : 'Clear'} ok={!snapshot.safetySystems.bilgeAlarmActive} />
              <Row label="Satellite Link" value={snapshot.communications.satelliteLinkUp ? 'Up' : 'Down'} ok={snapshot.communications.satelliteLinkUp} />
              <Row label="VHF" value={snapshot.communications.vhfOperational ? 'Operational' : 'Fault'} ok={snapshot.communications.vhfOperational} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-panel-border/60 pb-1.5 last:border-0">
      <span className="text-ink-500">{label}</span>
      <span className={ok ? 'font-medium text-healthy-400' : 'font-medium text-critical-400'}>{value}</span>
    </div>
  )
}
