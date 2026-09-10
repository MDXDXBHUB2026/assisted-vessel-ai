import { describe, expect, it } from 'vitest'
import { analyseMainEngine } from './machineryAnalytics'
import { buildBaselineSnapshot } from '@/simulation/baseline'

describe('analyseMainEngine', () => {
  it('reports a healthy condition at baseline values', () => {
    const snapshot = buildBaselineSnapshot()
    const result = analyseMainEngine(snapshot)
    expect(result.anomalyScore).toBeLessThan(12)
    expect(result.healthScore).toBeGreaterThan(85)
    expect(result.probableCondition).toMatch(/normal/i)
  })

  it('increases anomaly score monotonically with exhaust temperature deviation', () => {
    const snapshot = buildBaselineSnapshot()
    const low = analyseMainEngine({ ...snapshot, mainEngine: { ...snapshot.mainEngine, exhaustTempDeviationC: 5 } })
    const mid = analyseMainEngine({ ...snapshot, mainEngine: { ...snapshot.mainEngine, exhaustTempDeviationC: 25 } })
    const high = analyseMainEngine({ ...snapshot, mainEngine: { ...snapshot.mainEngine, exhaustTempDeviationC: 45 } })

    expect(low.anomalyScore).toBeLessThan(mid.anomalyScore)
    expect(mid.anomalyScore).toBeLessThan(high.anomalyScore)
    expect(low.healthScore).toBeGreaterThan(mid.healthScore)
    expect(mid.healthScore).toBeGreaterThan(high.healthScore)
  })

  it('escalates probable condition wording as anomaly score rises', () => {
    const snapshot = buildBaselineSnapshot()
    const severe = analyseMainEngine({ ...snapshot, mainEngine: { ...snapshot.mainEngine, exhaustTempDeviationC: 48, lubOilPressureBar: 3.0 } })
    expect(severe.anomalyScore).toBeGreaterThan(65)
    expect(severe.probableCondition).toMatch(/significant thermal anomaly/i)
    expect(severe.recommendedResponse).toMatch(/chief engineer/i)
  })
})
