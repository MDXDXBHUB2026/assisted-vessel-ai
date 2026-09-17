import { useEffect, useRef, useState } from 'react'

function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % 360
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  return delta
}

/** Like useInterpolatedNumber, but correctly animates the short way around the compass —
 * 359° → 0° must rotate forward by 1°, never spin backward through 180°. */
export function useInterpolatedHeading(targetDeg: number, smoothingMs = 600): number {
  const [value, setValue] = useState(targetDeg)
  const fromRef = useRef(targetDeg)
  const deltaRef = useRef(0)
  const startRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const delta = shortestAngleDelta(value, targetDeg)
    if (Math.abs(delta) < 1e-6) return
    fromRef.current = value
    deltaRef.current = delta
    startRef.current = performance.now()

    const step = (now: number) => {
      const elapsed = now - startRef.current
      const t = smoothingMs <= 0 ? 1 : Math.min(1, elapsed / smoothingMs)
      const eased = 1 - (1 - t) * (1 - t)
      const next = (fromRef.current + deltaRef.current * eased + 360) % 360
      setValue(next)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDeg, smoothingMs])

  return value
}
