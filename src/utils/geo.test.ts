import { describe, expect, it } from 'vitest'
import { computeCpaTcpa, haversineNm, projectPosition } from './geo'

describe('geo utilities', () => {
  it('projects a position along a course and distance consistently with haversine distance', () => {
    const start = { latitude: 1.0, longitude: 103.0 }
    const projected = projectPosition(start, 90, 60) // 60nm due east
    const distance = haversineNm(start, projected)
    expect(distance).toBeCloseTo(60, 0)
  })

  it('computes zero CPA for two vessels on a direct collision course', () => {
    const own = { latitude: 0, longitude: 0 }
    const target = { latitude: 0, longitude: 0.2 } // ~12nm east
    // own heading east at 10kn, target heading west at 10kn - closing head-on
    const { cpaNm, tcpaMinutes } = computeCpaTcpa(own, 90, 10, target, 270, 10)
    expect(cpaNm).toBeCloseTo(0, 0)
    expect(tcpaMinutes).toBeGreaterThan(0)
  })

  it('returns an infinite TCPA for vessels moving in parallel at the same speed', () => {
    const own = { latitude: 0, longitude: 0 }
    const target = { latitude: 0.1, longitude: 0 }
    const { tcpaMinutes } = computeCpaTcpa(own, 0, 15, target, 0, 15)
    expect(tcpaMinutes).toBe(Number.POSITIVE_INFINITY)
  })

  it('increases CPA as target passes further off own-ship track', () => {
    const own = { latitude: 0, longitude: 0 }
    const near = { latitude: 0.02, longitude: -0.5 }
    const far = { latitude: 0.2, longitude: -0.5 }
    const nearResult = computeCpaTcpa(own, 90, 12, near, 90, 12)
    const farResult = computeCpaTcpa(own, 90, 12, far, 90, 12)
    expect(farResult.cpaNm).toBeGreaterThan(nearResult.cpaNm)
  })
})
