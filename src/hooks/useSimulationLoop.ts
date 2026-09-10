import { useEffect } from 'react'
import { useSimulationStore } from '@/store/simulationStore'

const WALL_CLOCK_INTERVAL_MS = 1000
/** Caps the real-time gap used for a single catch-up tick, so a throttled/backgrounded tab
 * resumes smoothly instead of jumping simulated time forward all at once. */
const MAX_ELAPSED_SECONDS = 5

/**
 * A background tab's setInterval/setTimeout timers are throttled by browsers (down to once a
 * minute or less) once the page is hidden or occluded. Ticking the demo clock from a Web Worker
 * sidesteps that throttling entirely — workers are not subject to page-visibility timer
 * throttling — so the console keeps advancing at the intended pace even while backgrounded.
 */
function createTickerWorker(onTick: () => void): () => void {
  const workerSource = `setInterval(() => postMessage('tick'), ${WALL_CLOCK_INTERVAL_MS});`
  const blob = new Blob([workerSource], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  const worker = new Worker(url)
  worker.onmessage = onTick
  return () => {
    worker.terminate()
    URL.revokeObjectURL(url)
  }
}

/** Drives the simulation clock. Mount once near the app root. Uses actual elapsed wall-clock
 * time (not a fixed step) so the simulation stays correct even if the ticking callback fires
 * late or irregularly. */
export function useSimulationLoop(): void {
  useEffect(() => {
    let lastTimestampMs = Date.now()

    const onTick = () => {
      const now = Date.now()
      const elapsedSeconds = Math.min(MAX_ELAPSED_SECONDS, (now - lastTimestampMs) / 1000)
      lastTimestampMs = now
      useSimulationStore.getState().stepIfPlaying(elapsedSeconds)
    }

    if (typeof Worker !== 'undefined') {
      try {
        return createTickerWorker(onTick)
      } catch {
        // fall through to setInterval below
      }
    }

    const interval = window.setInterval(onTick, WALL_CLOCK_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [])
}
