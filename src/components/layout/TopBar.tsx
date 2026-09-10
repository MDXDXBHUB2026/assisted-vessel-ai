import { Link } from 'react-router-dom'
import { Pause, Play, Radio, Ship, FastForward } from 'lucide-react'
import { useSimulationStore } from '@/store/simulationStore'
import { HealthBadge } from '@/components/ui/Badge'
import { OPERATIONAL_MODE_LABELS } from '@/types'
import { formatUtc } from '@/utils/format'

const SPEEDS = [1, 2, 4, 8]

export function TopBar() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const isPlaying = useSimulationStore((s) => s.isPlaying)
  const speedMultiplier = useSimulationStore((s) => s.speedMultiplier)
  const play = useSimulationStore((s) => s.play)
  const pause = useSimulationStore((s) => s.pause)
  const setSpeed = useSimulationStore((s) => s.setSpeed)
  const recommendations = useSimulationStore((s) => s.recommendations)
  const activeCount = recommendations.filter((r) => r.status === 'awaiting_decision').length

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-panel-border bg-hull-900 px-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2">
          <Ship size={18} className="text-info-400" />
          <span className="text-sm font-bold tracking-wide text-ink-000">ASSISTED VESSEL INTELLIGENCE</span>
        </Link>
        <span className="hidden rounded border border-hull-500/40 px-2 py-0.5 text-[10px] font-medium text-ink-500 md:inline">DEMONSTRATOR</span>
      </div>

      <div className="hidden items-center gap-5 text-xs text-ink-300 lg:flex">
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-wide text-ink-500">Mode</span>
          <span className="font-medium text-ink-000">{OPERATIONAL_MODE_LABELS[snapshot.operationalMode]}</span>
        </div>
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-wide text-ink-500">Vessel Status</span>
          <HealthBadge level={snapshot.overallHealth} />
        </div>
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-wide text-ink-500">Connectivity</span>
          <span className={`flex items-center gap-1 font-medium ${snapshot.communications.satelliteLinkUp ? 'text-healthy-400' : 'text-critical-400'}`}>
            <Radio size={12} /> {snapshot.communications.satelliteLinkUp ? 'Linked' : 'Fallback'}
          </span>
        </div>
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-wide text-ink-500">Recommendations</span>
          <span className={`font-medium ${activeCount > 0 ? 'text-warning-400' : 'text-ink-000'}`}>{activeCount} awaiting</span>
        </div>
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-wide text-ink-500">Simulated Time</span>
          <span className="font-medium tabular-nums text-ink-000">{formatUtc(snapshot.simTimeIso)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={isPlaying ? pause : play} className="rounded-md border border-hull-500/40 bg-hull-700 p-1.5 text-ink-200 hover:bg-hull-600" title={isPlaying ? 'Pause simulation' : 'Play simulation'}>
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <div className="flex items-center gap-1 rounded-md border border-hull-500/40 bg-hull-700 px-1.5 py-1">
          <FastForward size={12} className="text-ink-500" />
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`rounded px-1.5 text-[11px] font-semibold ${speedMultiplier === s ? 'bg-info-500 text-hull-950' : 'text-ink-400 hover:text-ink-100'}`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
