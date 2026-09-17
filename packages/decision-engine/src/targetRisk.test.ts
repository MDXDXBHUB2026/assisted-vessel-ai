import { describe, expect, it } from 'vitest'
import { classifyTargetRisk, DEFAULT_TARGET_RISK_LIMITS } from './targetRisk'

const { cpaLimitNm, tcpaLimitMinutes } = DEFAULT_TARGET_RISK_LIMITS

describe('classifyTargetRisk', () => {
  it('is dangerous when CPA and TCPA are both inside the limits', () => {
    expect(classifyTargetRisk(cpaLimitNm - 0.1, tcpaLimitMinutes - 1)).toBe('dangerous')
  })

  it('is dangerous exactly at the CPA limit (inclusive)', () => {
    expect(classifyTargetRisk(cpaLimitNm, tcpaLimitMinutes - 1)).toBe('dangerous')
  })

  it('is dangerous exactly at the TCPA limit (inclusive)', () => {
    expect(classifyTargetRisk(cpaLimitNm - 0.1, tcpaLimitMinutes)).toBe('dangerous')
  })

  it('is dangerous exactly at both limits simultaneously', () => {
    expect(classifyTargetRisk(cpaLimitNm, tcpaLimitMinutes)).toBe('dangerous')
  })

  it('is not dangerous when TCPA is negative — the target is opening, not closing, however small the historical CPA', () => {
    expect(classifyTargetRisk(0.01, -5)).toBe('normal')
  })

  it('is not dangerous when TCPA is exactly zero — TCPA must be strictly positive', () => {
    expect(classifyTargetRisk(0.1, 0)).toBe('normal')
  })

  it('is not dangerous or caution when TCPA is infinite — parallel tracks never converge', () => {
    expect(classifyTargetRisk(0.1, Number.POSITIVE_INFINITY)).toBe('normal')
  })

  it('is caution just outside the dangerous limit but inside the caution band', () => {
    expect(classifyTargetRisk(cpaLimitNm + 0.1, tcpaLimitMinutes + 1)).toBe('caution')
  })

  it('is caution exactly at the edge of the caution band (inclusive)', () => {
    expect(classifyTargetRisk(cpaLimitNm * 2.5, tcpaLimitMinutes * 2.5)).toBe('caution')
  })

  it('is normal just outside the caution band', () => {
    expect(classifyTargetRisk(cpaLimitNm * 2.5 + 0.1, tcpaLimitMinutes * 2.5 + 1)).toBe('normal')
  })

  it('is normal when CPA is inside the dangerous band but TCPA is far outside both bands', () => {
    expect(classifyTargetRisk(cpaLimitNm - 0.1, tcpaLimitMinutes * 5)).toBe('normal')
  })

  it('respects operator-supplied limits rather than only the defaults', () => {
    const tighter = { cpaLimitNm: 0.5, tcpaLimitMinutes: 8 }
    expect(classifyTargetRisk(0.6, 5, tighter)).toBe('caution')
    expect(classifyTargetRisk(0.5, 8, tighter)).toBe('dangerous')
  })
})
