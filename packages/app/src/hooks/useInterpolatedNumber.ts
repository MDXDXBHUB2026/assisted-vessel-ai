import { useEffect, useRef, useState } from 'react'

/**
 * Smoothly animates toward a target numeric value using requestAnimationFrame, decoupled from
 * the ~1-2Hz engineering simulation tick. This is what lets a value that only *changes* once a
 * second still render as continuous motion at the browser's refresh rate.
 */
export function useInterpolatedNumber(target: number, smoothingMs = 600): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  const toRef = useRef(target)
  const startRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (Math.abs(toRef.current - target) < 1e-9) return
    fromRef.current = value
    toRef.current = target
    startRef.current = performance.now()

    const step = (now: number) => {
      const elapsed = now - startRef.current
      const t = smoothingMs <= 0 ? 1 : Math.min(1, elapsed / smoothingMs)
      const eased = 1 - (1 - t) * (1 - t) // ease-out quad
      setValue(fromRef.current + (toRef.current - fromRef.current) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, smoothingMs])

  return value
}
