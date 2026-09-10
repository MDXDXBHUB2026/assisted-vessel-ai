import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { SCENARIOS } from '@/types'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SCENARIO_RAMP_MINUTES } from '@/simulation/scenarioEffects'
import { SlidersHorizontal, RotateCcw } from 'lucide-react'
import { clamp } from '@/utils/random'

export function ScenarioControlPage() {
  const activeScenario = useSimulationStore((s) => s.activeScenario)
  const scenarioElapsedMinutes = useSimulationStore((s) => s.scenarioElapsedMinutes)
  const setScenario = useSimulationStore((s) => s.setScenario)
  const resetEnvironment = useSimulationStore((s) => s.resetEnvironment)
  const isPlaying = useSimulationStore((s) => s.isPlaying)
  const speedMultiplier = useSimulationStore((s) => s.speedMultiplier)

  const ramp = SCENARIO_RAMP_MINUTES[activeScenario]
  const severity = activeScenario === 'normal_operations' ? 0 : clamp((scenarioElapsedMinutes / ramp) * 100, 0, 100)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <SlidersHorizontal size={18} className="text-info-400" /> Scenario Control Centre
        </h1>
        <p className="text-sm text-ink-500">Activate a synthetic operating condition. Effects ramp in progressively and propagate across machinery, alarms, recommendations and audit.</p>
      </div>

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
              activeScenario === s.id ? 'border-info-500/50 bg-info-500/10' : 'border-panel-border bg-panel hover:border-hull-500/60'
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
