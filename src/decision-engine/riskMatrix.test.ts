import { describe, expect, it } from 'vitest'
import {
  buildRiskAssessment,
  buildRiskMatrixCells,
  computeRiskIndex,
  isIntolerable,
  isoRiskValues,
  markerShapeForBand,
  riskBand,
  riskBandToRiskLevel,
  targetResponseLabel,
  targetResponseMinutes,
} from './riskMatrix'

describe('computeRiskIndex', () => {
  it('is additive, not multiplicative or averaged — FI+SI, per FSA log(Risk)=log(P)+log(C)', () => {
    expect(computeRiskIndex(7, 4)).toBe(11)
    expect(computeRiskIndex(1, 1)).toBe(2)
    expect(computeRiskIndex(5, 2)).toBe(7)
  })

  it('spans the full documented range 2..11', () => {
    const all = buildRiskMatrixCells().map((c) => c.riskIndex)
    expect(Math.min(...all)).toBe(2)
    expect(Math.max(...all)).toBe(11)
  })
})

describe('riskBand', () => {
  it('classifies the acceptable band 2-4', () => {
    expect(riskBand(2)).toBe('acceptable')
    expect(riskBand(4)).toBe('acceptable')
  })

  it('classifies the ALARP band 5-7', () => {
    expect(riskBand(5)).toBe('alarp')
    expect(riskBand(7)).toBe('alarp')
  })

  it('classifies the intolerable band 8-11', () => {
    expect(riskBand(8)).toBe('intolerable')
    expect(riskBand(11)).toBe('intolerable')
  })

  it('band boundaries are contiguous and exhaustive over 2..11', () => {
    for (let ri = 2; ri <= 11; ri++) {
      expect(['acceptable', 'alarp', 'intolerable']).toContain(riskBand(ri))
    }
  })
})

describe('isIntolerable', () => {
  it('agrees with riskBand at the boundary', () => {
    expect(isIntolerable(7)).toBe(false)
    expect(isIntolerable(8)).toBe(true)
  })
})

describe('buildRiskAssessment', () => {
  it('computes riskIndex from the two supplied indices', () => {
    expect(buildRiskAssessment(3, 2)).toEqual({ frequencyIndex: 3, severityIndex: 2, riskIndex: 5 })
  })
})

describe('riskBandToRiskLevel', () => {
  it('maps acceptable to low and ALARP to medium', () => {
    expect(riskBandToRiskLevel(3)).toBe('low')
    expect(riskBandToRiskLevel(6)).toBe('medium')
  })

  it('splits the intolerable band into high (8-9) and severe (10-11) for badge granularity', () => {
    expect(riskBandToRiskLevel(8)).toBe('high')
    expect(riskBandToRiskLevel(9)).toBe('high')
    expect(riskBandToRiskLevel(10)).toBe('severe')
    expect(riskBandToRiskLevel(11)).toBe('severe')
  })
})

describe('targetResponseMinutes / targetResponseLabel', () => {
  it('intolerable requires an immediate (zero-minute) response', () => {
    expect(targetResponseMinutes(9)).toBe(0)
    expect(targetResponseLabel(9)).toBe('Immediate')
  })

  it('ALARP allows a bounded working window strictly greater than immediate', () => {
    expect(targetResponseMinutes(6)).toBeGreaterThan(0)
    expect(targetResponseMinutes(6)).toBeLessThan(targetResponseMinutes(3))
  })

  it('acceptable risk is reviewed, not urgently actioned', () => {
    expect(targetResponseLabel(3)).toBe('Next review')
  })
})

describe('markerShapeForBand', () => {
  it('assigns a distinct shape per band, so band is never colour-only', () => {
    const shapes = new Set([markerShapeForBand('acceptable'), markerShapeForBand('alarp'), markerShapeForBand('intolerable')])
    expect(shapes.size).toBe(3)
  })
})

describe('buildRiskMatrixCells', () => {
  it('produces exactly 28 cells (7 FI x 4 SI)', () => {
    expect(buildRiskMatrixCells()).toHaveLength(28)
  })

  it('every cell risk index equals the sum of its own indices', () => {
    for (const cell of buildRiskMatrixCells()) {
      expect(cell.riskIndex).toBe(cell.frequencyIndex + cell.severityIndex)
    }
  })
})

describe('isoRiskValues', () => {
  it('lists every distinct RI value in ascending order, matching the diagonals the matrix draws', () => {
    const values = isoRiskValues()
    expect(values[0]).toBe(2)
    expect(values[values.length - 1]).toBe(11)
    expect(values).toEqual([...values].sort((a, b) => a - b))
  })

  it('an equal-RI pair from different (FI, SI) combinations really does share one diagonal value', () => {
    // (FI=5, SI=2) and (FI=3, SI=4) both sum to 7 — the logarithmic-additive property the whole
    // diagonal presentation depends on.
    expect(computeRiskIndex(5, 2)).toBe(computeRiskIndex(3, 4))
  })
})
