/** Deterministic PRNG (mulberry32) so a given session's evolution is smooth and reproducible after reset. */
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Ornstein-Uhlenbeck style smoothed random walk, mean-reverting toward `target`. */
export function stepTowards(current: number, target: number, volatility: number, reversion: number, rng: () => number): number {
  const noise = (rng() - 0.5) * 2 * volatility
  const pull = (target - current) * reversion
  return current + pull + noise
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1)
}
