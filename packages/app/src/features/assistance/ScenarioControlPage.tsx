import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { SCENARIOS } from '@/types'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SCENARIO_RAMP_MINUTES } from '@ave/simulator/simulation/scenarioEffects'
import { DEMO_VOYAGE_PHASES } from '@ave/simulator/simulation/demoVoyage'
import { SlidersHorizontal, RotateCcw, PlayCircle, SkipForward } from 'lucide-react'
import { clamp } from '@/utils/random'

export function ScenarioControlPage() {
  const activeScenario = useSimulationStore((s) => s.activeScenario)
  const scenarioElapsedMinutes = useSimulationStore((s) => s.scenarioElapsedMinutes)
  const setScenario = useSimulationStore((s) => s.setScenario)
  const resetEnvironment = useSimulationStore((s) => s.resetEnvironment)
  const isPlaying = useSimulationStore((s) => s.isPlaying)
  const speedMultiplier = useSimulationStore((s) => s.speedMultiplier)
  const play = useSimulationStore((s) => s.play)
  const pause = useSimulationStore((s) => s.pause)
  const demoVoyage = useSimulationStore((s) => s.demoVoyage)
  const startDemoVoyage = useSimulationStore((s) => s.startDemoVoyage)
  const skipToPhase = useSimulationStore((s) => s.skipToPhase)
  const resetDemoVoyage = useSimulationStore((s) => s.resetDemoVoyage)

  const ramp = SCENARIO_RAMP_MINUTES[activeScenario]
  const severity = activeScenario === 'normal_operations' ? 0 : clamp((scenarioElapsedMinutes / ramp) * 100, 0, 100)
  const currentPhase = DEMO_VOYAGE_PHASES[demoVoyage.phaseIndex]

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <SlidersHorizontal size={18} className="text-info-400" /> Scenario Control Centre
        </h1>
        <p className="text-sm text-ink-500">Activate a synthetic operating condition, or run the full end-to-end Demo Voyage. Effects ramp in progressively and propagate across machinery, alarms, recommendations and audit.</p>
      </div>

      <Panel title="Demo Voyage" subtitle="A coherent, end-to-end compressed demonstration voyage across ten phases">
        <div className="flex flex-wrap items-center gap-2">
          {!demoVoyage.active ? (
            <Button variant="primary" size="sm" icon={<PlayCircle size={14} />} onClick={startDemoVoyage}>
              START DEMO VOYAGE
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={isPlaying ? pause : play}>
              {isPlaying ? 'PAUSE' : 'RESUME'}
            </Button>
          )}
          <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={resetDemoVoyage}>
            RESET DEMO VOYAGE
          </Button>
        </div>

        {demoVoyage.active && currentPhase && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-ink-300">
              <span>
                Phase {demoVoyage.phaseIndex + 1} / {DEMO_VOYAGE_PHASES.length}: <span className="font-semibold text-ink-100">{currentPhase.title}</span>
              </span>
              <span className="tabular-nums text-ink-500">{demoVoyage.phaseElapsedMinutes.toFixed(0)} / {currentPhase.durationMinutes} min</span>
            </div>
            <ProgressBar value={(demoVoyage.phaseElapsedMinutes / currentPhase.durationMinutes) * 100} tone="info" />
            <p className="mt-2 text-xs text-ink-500">{currentPhase.description}</p>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {DEMO_VOYAGE_PHASES.map((phase, i) => (
            <button
              key={phase.id}
              onClick={() => skipToPhase(i)}
              className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium ${
                demoVoyage.active && demoVoyage.phaseIndex === i ? 'border-info-500/50 bg-info-500/10 text-info-400' : 'border-hull-500/40 text-ink-500 hover:text-ink-100'
              }`}
            >
              <SkipForward size={9} /> {i + 1}. {phase.title}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Simulation State">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-ink-400">
            Status: <span className={isPlaying ? 'font-medium text-healthy-400' : 'font-medium text-warning-400'}>{isPlaying ? 'RUNNING' : 'PAUSED'}</span>
          </span>
          <span className="text-ink-400">
            Speed: <span className="font-medium text-ink-100">{speedMultiplier}x</span>
          </span>
          <span className="text-ink-400">
            Active scenario: <span className="font-medium text-ink-100">{activeScenario.replace(/_/g, ' ')}</span>
          </span>
          <Button size="sm" variant="danger" icon={<RotateCcw size={13} />} onClick={resetEnvironment}>
            RESET ENVIRONMENT
          </Button>
        </div>
        {activeScenario !== 'normal_operations' && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px] text-ink-500">
              <span>Scenario severity ramp</span>
              <span>{severity.toFixed(0)}%</span>
            </div>
            <ProgressBar value={severity} tone={severity > 70 ? 'critical' : severity > 35 ? 'warning' : 'info'} />
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => setScenario(s.id)}
            className={`rounded-sm border p-4 text-left transition-colors ${
              activeScenario === s.id && !demoVoyage.active ? 'border-info-500/50 bg-info-500/10' : 'border-panel-border bg-panel hover:border-hull-500/60'
            }`}
          >
            <div className="text-sm font-semibold text-ink-100">{s.label.toUpperCase()}</div>
            <p className="mt-1 text-xs text-ink-500">{s.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
