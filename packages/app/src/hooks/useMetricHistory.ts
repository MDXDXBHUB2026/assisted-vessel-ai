import { useEffect, useState } from 'react'
import { useSimulationStore } from '@/store/simulationStore'
import type { SimulationState } from '@ave/simulator/simulation/state'

/** Accumulates a rolling window of a numeric metric derived from simulation state, for sparkline/trend display. */
export function useMetricHistory(selector: (s: SimulationState) => number, maxPoints = 60): number[] {
  const value = useSimulationStore(selector)
  const [history, setHistory] = useState<number[]>(() => [value])

  useEffect(() => {
    setHistory((prev) => [...prev.slice(-(maxPoints - 1)), value])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return history
}
