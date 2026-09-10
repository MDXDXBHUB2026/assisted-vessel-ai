import { useEffect, useRef, useState } from 'react'

/**
 * Tracks a discrete/categorical value (a status string, a sample count, an alarm tag set) and
 * exposes a decaying "activity" pulse (1 → 0) for a brief moment after it changes — used for the
 * restrained micro-activity indicators in section 28 (e.g. a data-source dot that flashes once
 * when a new sample lands, not a constantly-pulsing green light).
 */
export function useInterpolatedSignal<T>(value: T, pulseMs = 500): { value: T; activity: number; justChanged: boolean } {
  const [activity, setActivity] = useState(0)
  const prevRef = useRef(value)
  const startRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)
  const [justChanged, setJustChanged] = useState(false)

  useEffect(() => {
    if (Object.is(prevRef.current, value)) return
    prevRef.current = value
    startRef.current = performance.now()
    setJustChanged(true)

    const step = (now: number) => {
      const elapsed = now - startRef.current
      const t = Math.min(1, elapsed / pulseMs)
      setActivity(1 - t)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        setJustChanged(false)
      }
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, pulseMs])

  return { value, activity, justChanged }
}
