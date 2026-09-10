import { Link } from 'react-router-dom'
import { Pause, Play, FastForward, Ship } from 'lucide-react'
import { useSimulationStore } from '@/store/simulationStore'
import { OPERATIONAL_MODE_LABELS, assistanceLevelRank, worstHealth, type AssistanceLevel } from '@/types'
import { formatUtc } from '@/utils/format'
import { assessAllOdd } from '@/safety-engine/oddEngine'
import { buildVesselOperationalState } from '@/simulation/operationalState'
import clsx from 'clsx'

const SPEEDS = [1, 2, 4, 8]

const HEALTH_COLOR: Record<string, string> = { healthy: 'text-healthy-400', advisory: 'text-advisory-400', warning: 'text-warning-400', critical: 'text-critical-400' }
const ODD_COLOR: Record<string, string> = { inside: 'text-healthy-400', near_limit: 'text-warning-400', outside: 'text-critical-400' }

function RibbonStat({ label, value, valueClass, sub }: { label: string; value: string; valueClass?: string; sub?: string }) {
  return (
    <div className="flex flex-col items-start border-r border-hull-700/70 px-3 py-1.5 first:pl-0 last:border-r-0">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-ink-700">{label}</span>
      <span className={clsx('text-[13px] font-bold leading-tight tabular-nums', valueClass ?? 'text-ink-100')}>{value}</span>
      {sub && <span className="text-[9px] text-ink-700">{sub}</span>}
    </div>
  )
}

export function CommandRibbon() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const isPlaying = useSimulationStore((s) => s.isPlaying)
  const speedMultiplier = useSimulationStore((s) => s.speedMultiplier)
  const play = useSimulationStore((s) => s.play)
  const pause = useSimulationStore((s) => s.pause)
  const setSpeed = useSimulationStore((s) => s.setSpeed)
  const recommendations = useSimulationStore((s) => s.recommendations)
  const rawAlarms = useSimulationStore((s) => s.rawAlarms)
  const pocMode = useSimulationStore((s) => s.pocMode)
  const adapterStatuses = useSimulationStore((s) => s.adapterStatuses)

  const pendingDecisions = recommendations.filter((r) => r.status === 'awaiting_decision').length
  const activeAlerts = rawAlarms.filter((a) => a.active).length

  const oddAssessments = assessAllOdd(snapshot)
  const worstOdd = oddAssessments.reduce((worst, a) => (a.status === 'outside' ? 'outside' : a.status === 'near_limit' && worst !== 'outside' ? 'near_limit' : worst), 'inside' as 'inside' | 'near_limit' | 'outside')
  const minAvailableLevel = oddAssessments.reduce<AssistanceLevel>((min, a) => (assistanceLevelRank(a.availableAssistanceLevel) < assistanceLevelRank(min) ? a.availableAssistanceLevel : min), 'L3')

  const opState = buildVesselOperationalState(snapshot)
  const dataQualityPct = opState.dataQuality.overallConfidencePercent.value
  const dataQualityLabel = dataQualityPct >= 80 ? 'HIGH' : dataQualityPct >= 55 ? 'MEDIUM' : dataQualityPct > 0 ? 'LOW' : 'NONE'

  const anyFallback = pocMode === 'connected' && Object.values(adapterStatuses).some((s) => s === 'unavailable_fallback' || s === 'connecting')
  const dataModeLabel = 'SIMULATED'
  const dataModeSub = pocMode === 'offline' ? 'Offline Demonstration Mode' : anyFallback ? 'Connected services unavailable — fallback active' : 'Connected services active'

  return (
    <header className="flex shrink-0 flex-col border-b border-panel-border bg-hull-900">
      <div className="flex h-10 items-center justify-between border-b border-hull-800 px-4">
        <Link to="/" className="flex items-center gap-2">
          <Ship size={15} className="text-info-400" />
          <span className="text-xs font-bold tracking-widest text-ink-000">ASSISTED VESSEL INTELLIGENCE</span>
          <span className="rounded border border-hull-500/40 px-1.5 py-0.5 text-[9px] font-medium text-ink-700">POC</span>
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={isPlaying ? pause : play} className="rounded border border-hull-500/40 bg-hull-700 p-1 text-ink-200 hover:bg-hull-600" title={isPlaying ? 'Pause simulation' : 'Play simulation'}>
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <div className="flex items-center gap-1 rounded border border-hull-500/40 bg-hull-700 px-1.5 py-1">
            <FastForward size={11} className="text-ink-500" />
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={clsx('rounded px-1.5 text-[10px] font-semibold', speedMultiplier === s ? 'bg-info-500 text-hull-950' : 'text-ink-400 hover:text-ink-100')}>
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 overflow-x-auto px-4 py-1.5">
        <RibbonStat label="Operating Mode" value={OPERATIONAL_MODE_LABELS[snapshot.operationalMode]} />
        <RibbonStat label="System State" value={snapshot.overallHealth.toUpperCase()} valueClass={HEALTH_COLOR[snapshot.overallHealth]} />
        <RibbonStat label="Operational Envelope" value={worstOdd === 'inside' ? 'INSIDE ODD' : worstOdd === 'near_limit' ? 'NEAR LIMIT' : 'OUTSIDE ODD'} valueClass={ODD_COLOR[worstOdd]} />
        <RibbonStat label="Connectivity" value={snapshot.communications.satelliteLinkUp ? 'LINKED' : 'FALLBACK'} valueClass={snapshot.communications.satelliteLinkUp ? 'text-healthy-400' : 'text-critical-400'} />
        <RibbonStat label="Assistance Level" value={minAvailableLevel} sub={worstHealth([snapshot.overallHealth]) !== 'healthy' ? 'capped' : undefined} valueClass="text-info-400" />
        <RibbonStat label="Data Quality" value={dataQualityLabel} valueClass={dataQualityLabel === 'HIGH' ? 'text-healthy-400' : dataQualityLabel === 'MEDIUM' ? 'text-warning-400' : 'text-critical-400'} />
        <RibbonStat label="Active Alerts" value={String(activeAlerts)} valueClass={activeAlerts > 0 ? 'text-warning-400' : 'text-healthy-400'} />
        <RibbonStat label="Pending Decisions" value={String(pendingDecisions)} valueClass={pendingDecisions > 0 ? 'text-warning-400' : 'text-healthy-400'} />
        <RibbonStat label="POC Data Mode" value={dataModeLabel} sub={dataModeSub} valueClass="text-critical-400" />
        <RibbonStat label="UTC Time" value={formatUtc(snapshot.simTimeIso)} />
      </div>
    </header>
  )
}
