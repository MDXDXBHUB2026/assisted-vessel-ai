import { useEffect, useState } from 'react'

/**
 * Tracks whether the viewport is at least `minWidthPx` wide, via `matchMedia` rather than a
 * one-shot `window.innerWidth` read, so a live resize (not just a fresh navigation) toggles the
 * result — required for the console gate in AppShell to restore without a reload.
 */
export function useMinViewportWidth(minWidthPx: number): boolean {
  const query = `(min-width: ${minWidthPx}px)`
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    // Covers the case where `query` itself changed since the last render (a different
    // minWidthPx) — the initial useState above only computes the value for the very first mount.
    if (mql.matches !== matches) setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return matches
}
