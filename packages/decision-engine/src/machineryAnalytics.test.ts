import { describe, expect, it } from 'vitest'
import { analyseMainEngine } from './machineryAnalytics'
import { buildBaselineSnapshot } from '@ave/simulator/simulation/baseline'

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

  it('increases anomaly score from a widening cylinder spread even when the average deviation is modest', () => {
    const snapshot = buildBaselineSnapshot()
    const tightSpread = analyseMainEngine({ ...snapshot, mainEngine: { ...snapshot.mainEngine, exhaustTempDeviationC: 8, cylinderExhaustDeviationsC: [8, 7.8, 8.1, 7.9, 8.2, 8] } })
    const wideSpread = analyseMainEngine({ ...snapshot, mainEngine: { ...snapshot.mainEngine, exhaustTempDeviationC: 8, cylinderExhaustDeviationsC: [8, 4, 22, 5, 8, 8] } })

    expect(wideSpread.cylinderSpreadC).toBeGreaterThan(tightSpread.cylinderSpreadC)
    expect(wideSpread.anomalyScore).toBeGreaterThan(tightSpread.anomalyScore)
  })

  it('escalates probable condition wording as anomaly score rises', () => {
    const snapshot = buildBaselineSnapshot()
    const severe = analyseMainEngine({ ...snapshot, mainEngine: { ...snapshot.mainEngine, exhaustTempDeviationC: 48, lubOilPressureBar: 3.0 } })
    expect(severe.anomalyScore).toBeGreaterThan(65)
    expect(severe.probableCondition).toMatch(/significant thermal anomaly/i)
    expect(severe.recommendedResponse).toMatch(/chief engineer/i)
  })
})
