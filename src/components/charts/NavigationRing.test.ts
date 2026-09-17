import { describe, expect, it } from 'vitest'
import {
  computeBearingRingRadiusPx,
  computeOrigin,
  estimateLabelWidthPx,
  orientationRotationDeg,
  placeLabel,
  project,
  pxPerNm,
  ringRangesNm,
  vectorLengthPx,
  VIEW_BOX_HEIGHT,
  VIEW_BOX_WIDTH,
  type LabelBox,
} from './NavigationRing'

describe('computeOrigin', () => {
  it('is the exact centre of the viewBox', () => {
    expect(computeOrigin(400, 300)).toEqual({ originX: 200, originY: 150 })
  })

  it('defaults to the fixed viewBox dimensions', () => {
    expect(computeOrigin()).toEqual({ originX: VIEW_BOX_WIDTH / 2, originY: VIEW_BOX_HEIGHT / 2 })
  })
})

describe('computeBearingRingRadiusPx', () => {
  it('is a fixed fraction of the smaller half-dimension', () => {
    // min(200, 200, 150, 150) * 0.9 = 135
    expect(computeBearingRingRadiusPx(400, 300)).toBeCloseTo(135)
  })

  it('is bounded by the narrower axis on a non-4:3 viewBox', () => {
    // min(100, 300, 150, 150) * 0.9 = 90 — width-constrained, not height-constrained.
    expect(computeBearingRingRadiusPx(200, 300)).toBeCloseTo(90)
  })

  it('is resolution-independent — scaling both dimensions scales the radius by the same factor', () => {
    const base = computeBearingRingRadiusPx(400, 300)
    const doubled = computeBearingRingRadiusPx(800, 600)
    expect(doubled).toBeCloseTo(base * 2)
  })
})

describe('orientationRotationDeg', () => {
  it('North Up is always 0, regardless of heading — it never rotates', () => {
    expect(orientationRotationDeg('north_up', 0)).toBe(0)
    expect(orientationRotationDeg('north_up', 47)).toBe(0)
    expect(orientationRotationDeg('north_up', 359.9)).toBe(0)
  })

  it('Course Up rotates opposite to own heading, tracking the vessel course', () => {
    expect(orientationRotationDeg('course_up', 90)).toBe(-90)
    expect(orientationRotationDeg('course_up', 0)).toBe(-0)
    expect(orientationRotationDeg('course_up', 270)).toBe(-270)
  })
})

describe('pxPerNm', () => {
  it('matches the documented fraction of the bearing ring radius', () => {
    // 135 * 0.88 / 6 = 19.8
    expect(pxPerNm(135, 6)).toBeCloseTo(19.8)
  })

  it('halves when range doubles — inversely proportional to range', () => {
    const at6 = pxPerNm(135, 6)
    const at12 = pxPerNm(135, 12)
    expect(at12).toBeCloseTo(at6 / 2)
  })
})

describe('project', () => {
  const origin = { latitude: 1.5, longitude: 103.5 }

  it('projects the centre itself onto the origin pixel', () => {
    const [x, y] = project(origin, origin, 200, 150, 0, 20)
    expect(x).toBeCloseTo(200)
    expect(y).toBeCloseTo(150)
  })

  it('places a point due north (no rotation) directly above the origin', () => {
    const north = { latitude: origin.latitude + 1 / 60, longitude: origin.longitude } // 1 nm north
    const [x, y] = project(origin, north, 200, 150, 0, 20)
    expect(x).toBeCloseTo(200, 1)
    expect(y).toBeCloseTo(150 - 20, 1) // up screen == smaller y, distance * pxPerNm
  })

  it('rotation of 90 maps "due north" onto the ring position for bearing 090 unrotated (i.e. to the right)', () => {
    // With rotationDeg=90 (as Course-Up would apply when heading=90), a true-north point should
    // project to the position a 000-rotationDeg picture would draw bearing (0 - 90) = -90 at,
    // i.e. to the LEFT of the origin (compensating so "ahead" points up).
    const north = { latitude: origin.latitude + 1 / 60, longitude: origin.longitude }
    const [x] = project(origin, north, 200, 150, 90, 20)
    expect(x).toBeLessThan(200)
  })
})

describe('vectorLengthPx', () => {
  it('scales linearly with vector minutes', () => {
    const at3 = vectorLengthPx(18, 3, 20, 999)
    const at6 = vectorLengthPx(18, 6, 20, 999)
    const at12 = vectorLengthPx(18, 12, 20, 999)
    expect(at6).toBeCloseTo(at3 * 2)
    expect(at12).toBeCloseTo(at3 * 4)
  })

  it('is capped at the supplied maximum', () => {
    expect(vectorLengthPx(40, 12, 50, 100)).toBe(100)
  })

  it('is zero for a stationary target', () => {
    expect(vectorLengthPx(0, 12, 20, 999)).toBe(0)
  })
})

describe('ringRangesNm', () => {
  it('places four rings at range/4 on a 12 NM scale', () => {
    expect(ringRangesNm(12)).toEqual([3, 6, 9, 12])
  })

  it('the outermost ring always equals the selected range', () => {
    for (const rangeNm of [0.25, 0.5, 0.75, 1.5, 3, 6, 12, 24]) {
      const ranges = ringRangesNm(rangeNm)
      expect(ranges[ranges.length - 1]).toBeCloseTo(rangeNm)
    }
  })

  it('supports a non-default ring count', () => {
    expect(ringRangesNm(10, 5)).toEqual([2, 4, 6, 8, 10])
  })
})

describe('estimateLabelWidthPx', () => {
  it('grows with text length', () => {
    expect(estimateLabelWidthPx('AB')).toBeLessThan(estimateLabelWidthPx('ABCDEFGH'))
  })

  it('is DOM-free and deterministic for the same input', () => {
    expect(estimateLabelWidthPx('ALPHA 1.20')).toBe(estimateLabelWidthPx('ALPHA 1.20'))
  })
})

describe('placeLabel', () => {
  it('uses the first (NE) candidate offset when nothing is placed yet', () => {
    const box = placeLabel(100, 100, 40, 14, [])
    expect(box).toEqual({ x: 108, y: 78, w: 40, h: 14 })
  })

  it('falls through to the next candidate offset when the first collides', () => {
    const first = placeLabel(100, 100, 40, 14, [])
    const second = placeLabel(100, 100, 40, 14, [first])
    expect(second).not.toEqual(first)
    // The second placement must not overlap the first.
    const overlap = second.x < first.x + first.w && second.x + second.w > first.x && second.y < first.y + first.h && second.y + second.h > first.y
    expect(overlap).toBe(false)
  })

  it('placement order is deterministic for identical inputs (no jitter between frames)', () => {
    const a = placeLabel(50, 50, 30, 14, [])
    const b = placeLabel(50, 50, 30, 14, [])
    expect(a).toEqual(b)
  })

  it('falls back to the first offset when every candidate collides', () => {
    // A single huge avoid-box covering every candidate offset around the anchor forces the
    // fallback path, which must still return a well-defined box rather than throwing.
    const hugeBox: LabelBox = { x: -1000, y: -1000, w: 2000, h: 2000 }
    const box = placeLabel(100, 100, 40, 14, [hugeBox])
    expect(box).toEqual({ x: 108, y: 78, w: 40, h: 14 })
  })
})
