import type { VesselSnapshot } from '@/types'

/** A bounded, chronological rolling window of samples for one metric, used to compute genuine
 * trend/slope/persistence-based analytics rather than a point-in-time formula. */
export interface HistoryBuffer {
  values: number[]
  times: number[]
}

export const HISTORY_MAX_SAMPLES = 60

export function createEmptyHistory(): HistoryBuffer {
  return { values: [], times: [] }
}

/** ALSO FIX 3 (cold-start transient): a history buffer pre-populated with `count` copies of a
 * steady-state value, spaced one minute apart into the past. Used so a freshly-loaded, perfectly
 * healthy vessel does not read as under-sampled for its first few ticks — see
 * `buildInitialTelemetryHistory`. Slope is 0 and persistence is 0 for a seeded buffer, exactly as
 * they should be for a vessel that was already running steadily before the operator opened the app. */
function seedHistory(value: number, count: number, nowMs: number): HistoryBuffer {
  const values: number[] = []
  const times: number[] = []
  for (let i = count; i >= 1; i--) {
    values.push(value)
    times.push(nowMs - i * 60_000)
  }
  return { values, times }
}

export function pushSample(buf: HistoryBuffer, timeMs: number, value: number, maxLen = HISTORY_MAX_SAMPLES): HistoryBuffer {
  const values = [...buf.values, value]
  const times = [...buf.times, timeMs]
  if (values.length > maxLen) {
    values.shift()
    times.shift()
  }
  return { values, times }
}

export function mean(buf: HistoryBuffer): number {
  if (buf.values.length === 0) return 0
  return buf.values.reduce((a, b) => a + b, 0) / buf.values.length
}

/** Ordinary least-squares slope of value against sample index (i.e. change per sample, not per second). */
export function slopePerSample(buf: HistoryBuffer): number {
  const n = buf.values.length
  if (n < 3) return 0
  const xs = buf.values.map((_, i) => i)
  const xMean = (n - 1) / 2
  const yMean = mean(buf)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - xMean) * (buf.values[i]! - yMean)
    den += (xs[i]! - xMean) ** 2
  }
  return den === 0 ? 0 : num / den
}

/** Fraction of the most recent `window` samples that exceed (or fall below) a threshold. */
export function persistenceAbove(buf: HistoryBuffer, threshold: number, window = 12): number {
  const recent = buf.values.slice(-window)
  if (recent.length === 0) return 0
  return recent.filter((v) => v > threshold).length / recent.length
}

export function persistenceBelow(buf: HistoryBuffer, threshold: number, window = 12): number {
  const recent = buf.values.slice(-window)
  if (recent.length === 0) return 0
  return recent.filter((v) => v < threshold).length / recent.length
}

export interface TelemetryHistoryState {
  exhaustTempDeviationC: HistoryBuffer
  cylinderSpreadC: HistoryBuffer
  lubOilPressureBar: HistoryBuffer
  fuelConsumptionRateTonPerDay: HistoryBuffer
  gnssConfidence: HistoryBuffer
  satelliteConfidence: HistoryBuffer
  blackoutRiskScore: HistoryBuffer
  rpm: HistoryBuffer
  loadPercent: HistoryBuffer
  anomalyScore: HistoryBuffer
}

/**
 * Seeded with the baseline snapshot's own steady-state values rather than starting empty, so
 * `analyseMainEngine`'s data-maturity penalty (sampleCount < 6) — correct behaviour, not removed
 * here — does not apply on a vessel that has not actually just started operating. Without this,
 * the ribbon reads OUTSIDE ODD / DATA QUALITY LOW on a perfectly healthy vessel for the first few
 * ticks after every load, purely because the rolling window was briefly empty.
 */
export function buildInitialTelemetryHistory(snapshot: VesselSnapshot): TelemetryHistoryState {
  const nowMs = new Date(snapshot.simTimeIso).getTime()
  const seedCount = 6
  return {
    exhaustTempDeviationC: seedHistory(snapshot.mainEngine.exhaustTempDeviationC, seedCount, nowMs),
    cylinderSpreadC: seedHistory(0, seedCount, nowMs),
    lubOilPressureBar: seedHistory(snapshot.mainEngine.lubOilPressureBar, seedCount, nowMs),
    fuelConsumptionRateTonPerDay: seedHistory(snapshot.fuelEnergy.fuelConsumptionRateTonPerDay, seedCount, nowMs),
    gnssConfidence: seedHistory(snapshot.navigation.gnssConfidence, seedCount, nowMs),
    satelliteConfidence: seedHistory(snapshot.communications.satelliteConfidence, seedCount, nowMs),
    blackoutRiskScore: seedHistory(snapshot.electricalPower.blackoutRiskScore, seedCount, nowMs),
    rpm: seedHistory(snapshot.mainEngine.rpm, seedCount, nowMs),
    loadPercent: seedHistory(snapshot.mainEngine.loadPercent, seedCount, nowMs),
    anomalyScore: seedHistory(0, seedCount, nowMs),
  }
}
