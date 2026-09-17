/**
 * CPA/TCPA-based risk classification for the navigation operating picture. This is decision logic
 * (which targets are dangerous or merit caution) and must not live inside the canvas renderer,
 * which only draws whatever classification it is given.
 *
 * Per IMO MSC.192(79) ("the preset CPA/TCPA limits applied to targets from radar and AIS should
 * be identical"), there is exactly one operator-settable limit pair applied to every target,
 * regardless of source.
 */

export type TargetRiskLevel = 'dangerous' | 'caution' | 'normal'

export interface TargetRiskLimits {
  /** A target at or inside this CPA and TCPA is dangerous. Operator-settable; conventionally 1-2 nm. */
  cpaLimitNm: number
  /** Operator-settable; conventionally 12-20 minutes. */
  tcpaLimitMinutes: number
}

export const DEFAULT_TARGET_RISK_LIMITS: TargetRiskLimits = {
  cpaLimitNm: 1.5,
  tcpaLimitMinutes: 20,
}

/** Caution is a band above the dangerous limit, not a second operator-settable pair. */
export const CAUTION_BAND_MULTIPLIER = 2.5

/**
 * A target is only ever dangerous or caution while it is genuinely closing: TCPA must be strictly
 * positive (a negative or zero TCPA means the closest point of approach is now in the past and the
 * target is opening — never dangerous, however small the historical CPA) and finite (an infinite
 * TCPA means the two tracks are parallel and never converge).
 *
 * DANGEROUS is CPA <= limit and TCPA <= limit (inclusive: a target exactly on the limit has reached
 * it, not stopped short of it). CAUTION is a wider band above the same limits.
 */
export function classifyTargetRisk(cpaNm: number, tcpaMinutes: number, limits: TargetRiskLimits = DEFAULT_TARGET_RISK_LIMITS): TargetRiskLevel {
  if (!(tcpaMinutes > 0) || !Number.isFinite(tcpaMinutes)) return 'normal'
  if (cpaNm <= limits.cpaLimitNm && tcpaMinutes <= limits.tcpaLimitMinutes) return 'dangerous'
  if (cpaNm <= limits.cpaLimitNm * CAUTION_BAND_MULTIPLIER && tcpaMinutes <= limits.tcpaLimitMinutes * CAUTION_BAND_MULTIPLIER) return 'caution'
  return 'normal'
}
