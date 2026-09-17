import { Link } from 'react-router-dom'
import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { HealthBadge, RiskBadge, VerdictBadge, OddStatusBadge, AssistanceLevelTag } from '@/components/ui/Badge'
import { InstrumentRow } from '@/components/ui/InstrumentRow'
import { Sparkline } from '@/components/charts/Sparkline'
import { NavigationCanvas } from '@/components/charts/NavigationCanvas'
import { ROUTE_WAYPOINTS } from '@/data/route'
import { assessAllOdd } from '@/safety-engine/oddEngine'
import { correlateAlarms } from '@/decision-engine/alarmCorrelation'
import { activeIntolerableHazardCategories } from '@/decision-engine/hazardLifecycle'
import { riskBandToRiskLevel } from '@/decision-engine/riskMatrix'
import { SYSTEM_AREA_LABELS, OPERATIONAL_MODE_LABELS, type OperationalMode } from '@/types'
import { formatDateUtc, formatLatLon } from '@/utils/format'
import { systemStateColor, systemStateLabel } from '@/utils/theme'
import { ArrowUpRight } from 'lucide-react'

const MODES: OperationalMode[] = ['open_sea', 'coastal', 'traffic_separation', 'congested_waters', 'port_approach', 'manoeuvring', 'anchored', 'alongside']

export function OperationsCanvasPage() {
  const state = useSimulationStore()
  const { snapshot, recommendations, rawAlarms, targets, hazards, auditEvents, activeScenario, machineryAnalysis, ownTrack } = state
  const awaiting = recommendations.filter((r) => r.status === 'awaiting_decision')
  const activeAlarms = rawAlarms.filter((a) => a.active)
  const { correlated, uncorrelatedCount } = correlateAlarms(rawAlarms)
  const oddAssessments = assessAllOdd(snapshot, activeIntolerableHazardCategories(hazards))
  const constrainedFunctions = oddAssessments.filter((a) => a.status !== 'inside')
  const openHazards = hazards.filter((h) => h.status !== 'closed')

  const topRecommendation = awaiting[0]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[13px] font-bold uppercase tracking-widest text-ink-000">Assisted Operations Console</h1>
          <p className="text-xs text-ink-500">
            {snapshot.identity.name} · {snapshot.identity.vesselType} · {formatDateUtc(snapshot.simTimeIso)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-700">Operating Mode</span>
          <select
            value={snapshot.operationalMode}
            onChange={(e) => state.setOperationalMode(e.target.value as OperationalMode)}
            className="rounded-sm border border-hull-500/40 bg-hull-800 px-2.5 py-1.5 text-xs font-medium text-ink-100"
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
        <div className="rounded-sm border border-warning-500/30 bg-warning-500/10 px-4 py-2 text-xs font-medium text-warning-400">
          Active scenario: {activeScenario.replace(/_/g, ' ')} — synthetic condition in progress.
        </div>
      )}

      {/* Mission-control canvas: one integrated operating picture rather than unrelated cards. */}
      <div className="grid grid-cols-12 gap-3">
        {/* Navigation operating picture */}
        <Panel title="Navigation Operating Picture" dense className="col-span-12 xl:col-span-5" action={<Link to="/vessel/navigation" className="flex items-center gap-1 text-[10px] text-info-400 hover:text-info-300">DETAIL <ArrowUpRight size={11} /></Link>}>
          <NavigationCanvas
            own={snapshot.navigation.position}
            ownHeadingDeg={snapshot.navigation.heading}
            ownSpeedKn={snapshot.navigation.speedOverGroundKn}
            targets={targets}
            routeWaypoints={ROUTE_WAYPOINTS}
            historicalTrack={ownTrack}
            windSpeedKn={snapshot.environment.windSpeedKn}
            windDirectionDeg={snapshot.environment.windDirectionDeg}
            visibilityNm={snapshot.environment.visibilityNm}
          />
          <div className="mt-2 grid grid-cols-4 gap-x-3">
            <InstrumentRow label="Position" value={formatLatLon(snapshot.navigation.position.latitude, snapshot.navigation.position.longitude)} />
            <InstrumentRow label="Heading" value={snapshot.navigation.heading.toFixed(0)} unit="°T" />
            <InstrumentRow label="SOG" value={snapshot.navigation.speedOverGroundKn.toFixed(1)} unit="kn" />
            <InstrumentRow label="GNSS" value={snapshot.navigation.gnssConfidence.toFixed(0)} unit="%" tone={snapshot.navigation.gnssConfidence < 60 ? 'warning' : 'healthy'} />
          </div>
        </Panel>

        {/* Vessel operational health matrix */}
        <Panel title="Vessel Operational Health" dense className="col-span-12 sm:col-span-6 xl:col-span-4" action={<Link to="/vessel/digital-twin" className="flex items-center gap-1 text-[10px] text-info-400 hover:text-info-300">TWIN <ArrowUpRight size={11} /></Link>}>
          <div className="grid grid-cols-2 gap-1.5">
            {snapshot.systemHealth.map((s) => (
              <div key={s.area} className="flex items-center justify-between rounded-sm border border-panel-border bg-panel-raised px-2 py-1.5">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium text-ink-100">{SYSTEM_AREA_LABELS[s.area]}</div>
                  <div className={`text-[9px] font-bold uppercase tracking-wide ${systemStateColor[s.state]}`}>{systemStateLabel[s.state]}</div>
                </div>
                <HealthBadge level={s.health} />
              </div>
            ))}
          </div>
        </Panel>

        {/* Machinery / energy trend strip */}
        <Panel title="Machinery &amp; Energy Trend" dense className="col-span-12 sm:col-span-6 xl:col-span-3" action={<Link to="/vessel/machinery" className="flex items-center gap-1 text-[10px] text-info-400 hover:text-info-300">DETAIL <ArrowUpRight size={11} /></Link>}>
          <div className="flex flex-col gap-2">
            <div>
              <div className="mb-0.5 flex justify-between text-[10px] text-ink-500">
                <span>Anomaly Score</span>
                <span className="tabular-nums text-ink-200">{machineryAnalysis.anomalyScore}/100</span>
              </div>
              <Sparkline data={state.telemetryHistory.exhaustTempDeviationC.values} color={machineryAnalysis.anomalyScore > 50 ? '#f0473a' : '#5BC0BE'} height={44} />
            </div>
            <InstrumentRow label="Fuel Rate" value={snapshot.fuelEnergy.fuelConsumptionRateTonPerDay.toFixed(0)} unit="t/day" tone={snapshot.fuelEnergy.fuelConsumptionRateTonPerDay > snapshot.fuelEnergy.baselineConsumptionRateTonPerDay * 1.15 ? 'warning' : 'neutral'} />
            <InstrumentRow label="Health Score" value={String(machineryAnalysis.healthScore)} unit="/100" tone={machineryAnalysis.healthScore < 65 ? 'warning' : 'healthy'} />
          </div>
        </Panel>

        {/* ODD / assistance availability strip */}
        <Panel title="Operational Envelope &amp; Assistance" dense className="col-span-12 lg:col-span-6" action={<Link to="/vessel/envelope" className="flex items-center gap-1 text-[10px] text-info-400 hover:text-info-300">DETAIL <ArrowUpRight size={11} /></Link>}>
          {constrainedFunctions.length === 0 ? (
            <p className="text-xs text-ink-500">All assisted functions inside their operational envelope at configured assistance level.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {constrainedFunctions.map((a) => (
                <li key={a.functionId} className="flex items-center justify-between gap-2 rounded-sm border border-panel-border bg-panel-raised px-2 py-1.5 text-xs">
                  <span className="truncate text-ink-200">{a.functionLabel}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <AssistanceLevelTag level={a.availableAssistanceLevel} />
                    <OddStatusBadge status={a.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Active alarms */}
        <Panel title={`Active Alarms — Raw ${activeAlarms.length} / Correlated ${correlated.length}`} dense className="col-span-12 lg:col-span-6" action={<Link to="/vessel/alarms" className="flex items-center gap-1 text-[10px] text-info-400 hover:text-info-300">DETAIL <ArrowUpRight size={11} /></Link>}>
          {correlated.length === 0 && uncorrelatedCount === 0 ? (
            <p className="text-xs text-ink-500">No active alarms.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {correlated.slice(0, 3).map((c) => (
                <li key={c.id} className="rounded-sm border border-panel-border bg-panel-raised px-2 py-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-ink-100">{c.title}</span>
                    <HealthBadge level={c.priority} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Top recommendation requiring decision */}
        <Panel title="Recommendation Requiring Decision" dense className="col-span-12 lg:col-span-6" action={<Link to="/vessel/decisions" className="flex items-center gap-1 text-[10px] text-info-400 hover:text-info-300">DECISION CENTRE ({awaiting.length}) <ArrowUpRight size={11} /></Link>}>
          {!topRecommendation ? (
            <p className="text-xs text-ink-500">No recommendations currently require a decision.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink-100">{topRecommendation.title}</span>
                <div className="flex items-center gap-1.5">
                  <RiskBadge level={topRecommendation.riskLevel} />
                  <VerdictBadge verdict={topRecommendation.safetyValidation.verdict} />
                </div>
              </div>
              <p className="text-xs text-ink-500">{topRecommendation.detectedCondition}</p>
              <p className="text-[11px] text-ink-700">Requires: {topRecommendation.requiredAuthority.replace(/_/g, ' ')} · Confidence {topRecommendation.confidencePercent}%</p>
            </div>
          )}
        </Panel>

        {/* Safety condition */}
        <Panel title="Safety Condition" dense className="col-span-12 lg:col-span-6">
          {openHazards.length === 0 ? (
            <p className="text-xs text-ink-500">No open safety hazards.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {openHazards.slice(0, 2).map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 rounded-sm border border-critical-500/30 bg-critical-500/5 px-2 py-1.5 text-xs">
                  <span className="truncate text-ink-100">{h.title}</span>
                  <RiskBadge level={riskBandToRiskLevel(h.residualRisk.riskIndex)} label={`RI ${h.residualRisk.riskIndex}`} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Event timeline tail */}
        <Panel title="Event Timeline" dense className="col-span-12" action={<Link to="/vessel/audit" className="flex items-center gap-1 text-[10px] text-info-400 hover:text-info-300">FULL AUDIT TRAIL <ArrowUpRight size={11} /></Link>}>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {auditEvents.slice(0, 8).map((e) => (
              <div key={e.id} className="w-56 shrink-0 rounded-sm border border-panel-border bg-panel-raised px-2.5 py-2">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-ink-700">{e.timestampIso.slice(11, 16)} UTC · {e.kind.replace(/_/g, ' ')}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] text-ink-200">{e.event}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
