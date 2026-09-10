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
  lubOilPressureBar: HistoryBuffer
  fuelConsumptionRateTonPerDay: HistoryBuffer
  gnssConfidence: HistoryBuffer
  satelliteConfidence: HistoryBuffer
  blackoutRiskScore: HistoryBuffer
}

export function buildInitialTelemetryHistory(): TelemetryHistoryState {
  return {
    exhaustTempDeviationC: createEmptyHistory(),
    lubOilPressureBar: createEmptyHistory(),
    fuelConsumptionRateTonPerDay: createEmptyHistory(),
    gnssConfidence: createEmptyHistory(),
    satelliteConfidence: createEmptyHistory(),
    blackoutRiskScore: createEmptyHistory(),
  }
}
