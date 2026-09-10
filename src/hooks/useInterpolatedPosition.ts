import { useEffect, useRef, useState } from 'react'
import type { GeoPosition } from '@/types'

/** Smoothly animates a lat/lon position toward its latest engineering-tick value. Distances
 * involved are small enough per tick that linear interpolation in degrees is a safe and cheap
 * approximation — a full geodesic interpolation would be invisible at this scale. */
export function useInterpolatedPosition(target: GeoPosition, smoothingMs = 900): GeoPosition {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  const toRef = useRef(target)
  const startRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (toRef.current.latitude === target.latitude && toRef.current.longitude === target.longitude) return
    fromRef.current = value
    toRef.current = target
    startRef.current = performance.now()

    const step = (now: number) => {
      const elapsed = now - startRef.current
      const t = smoothingMs <= 0 ? 1 : Math.min(1, elapsed / smoothingMs)
      const eased = t // linear — matches the steady-speed motion of a vessel between ticks
      setValue({
        latitude: fromRef.current.latitude + (toRef.current.latitude - fromRef.current.latitude) * eased,
        longitude: fromRef.current.longitude + (toRef.current.longitude - fromRef.current.longitude) * eased,
      })
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.latitude, target.longitude, smoothingMs])

  return value
}
