import type { HazardRiskAssessment, RiskLevel } from '@ave/core-domain/types'

/**
 * IMO Formal Safety Assessment (MSC-MEPC.2/Circ.12/Rev.2) Frequency Index. Logarithmic: each step
 * represents roughly two orders of magnitude of occurrence frequency, which is exactly why FI and
 * SI are additive rather than multiplied — see `computeRiskIndex`.
 */
export const FREQUENCY_INDEX_LABELS: Record<number, string> = {
  1: 'Extremely Remote',
  2: 'Remote–Extremely Remote',
  3: 'Remote',
  4: 'Reasonably Probable–Remote',
  5: 'Reasonably Probable',
  6: 'Frequent–Reasonably Probable',
  7: 'Frequent',
}

export const FREQUENCY_INDEX_DEFINITIONS: Record<number, string> = {
  1: 'Likely to occur once in the lifetime (20 years) of a world fleet of 5,000 ships',
  3: 'Likely to occur once per year in a fleet of 1,000 ships',
  5: 'Likely to occur once per year in a fleet of 10 ships',
  7: 'Likely to occur once per month on one ship',
}

/** IMO FSA Severity Index. */
export const SEVERITY_INDEX_LABELS: Record<number, string> = {
  1: 'Minor',
  2: 'Significant',
  3: 'Severe',
  4: 'Catastrophic',
}

export const SEVERITY_INDEX_DEFINITIONS: Record<number, { humanSafety: string; ship: string }> = {
  1: { humanSafety: 'Single or minor injuries', ship: 'Local equipment damage' },
  2: { humanSafety: 'Multiple or severe injuries', ship: 'Non-severe ship damage' },
  3: { humanSafety: 'Single fatality or multiple severe injuries', ship: 'Severe damage' },
  4: { humanSafety: 'Multiple fatalities', ship: 'Total loss' },
}

export const FREQUENCY_INDEX_MIN = 1
export const FREQUENCY_INDEX_MAX = 7
export const SEVERITY_INDEX_MIN = 1
export const SEVERITY_INDEX_MAX = 4

export type RiskBand = 'acceptable' | 'alarp' | 'intolerable'

/**
 * This project's own explicit FSA risk evaluation criteria. FSA (MSC-MEPC.2/Circ.12/Rev.2) states
 * that no universally accepted acceptance criteria exist and that whatever criteria are used must
 * be stated explicitly — recorded here and in docs/assumptions.md, not presented as a standard.
 */
export const RISK_BAND_THRESHOLDS: Record<RiskBand, { min: number; max: number; label: string; requiredResponse: string }> = {
  acceptable: { min: 2, max: 4, label: 'Broadly Acceptable', requiredResponse: 'Monitor. No further action required.' },
  alarp: { min: 5, max: 7, label: 'ALARP', requiredResponse: 'Mitigation required; justify residual risk As Low As Reasonably Practicable.' },
  intolerable: { min: 8, max: 11, label: 'Intolerable', requiredResponse: 'Immediate control required; Master informed; escalate to Company.' },
}

/** FSA: log(Risk) = log(Probability) + log(Consequence), so RI = FI + SI (never averaged, never
 * multiplied) — the property that makes equal-RI cells lie on diagonals of the matrix. */
export function computeRiskIndex(frequencyIndex: number, severityIndex: number): number {
  return frequencyIndex + severityIndex
}

export function riskBand(riskIndex: number): RiskBand {
  if (riskIndex >= RISK_BAND_THRESHOLDS.intolerable.min) return 'intolerable'
  if (riskIndex >= RISK_BAND_THRESHOLDS.alarp.min) return 'alarp'
  return 'acceptable'
}

export function isIntolerable(riskIndex: number): boolean {
  return riskBand(riskIndex) === 'intolerable'
}

export function buildRiskAssessment(frequencyIndex: number, severityIndex: number): HazardRiskAssessment {
  return { frequencyIndex, severityIndex, riskIndex: computeRiskIndex(frequencyIndex, severityIndex) }
}

/** Maps an RI band onto the app's existing 4-tier RiskLevel so hazards render with the same
 * badge vocabulary as everything else, without collapsing the FSA index itself — callers that
 * need the quantified value print the RI number alongside this badge, never instead of it. */
export function riskBandToRiskLevel(riskIndex: number): RiskLevel {
  const band = riskBand(riskIndex)
  if (band === 'acceptable') return 'low'
  if (band === 'alarp') return 'medium'
  return riskIndex >= 10 ? 'severe' : 'high'
}

/**
 * Target response time by RI band (this project's own criteria, per FSA's requirement for
 * explicit criteria). Intolerable is immediate; ALARP allows a working window; acceptable is
 * reviewed at the next routine interval rather than urgently.
 */
export function targetResponseMinutes(riskIndex: number): number {
  const band = riskBand(riskIndex)
  if (band === 'intolerable') return 0
  if (band === 'alarp') return 240
  return 10_080 // next weekly review
}

export function targetResponseLabel(riskIndex: number): string {
  const band = riskBand(riskIndex)
  if (band === 'intolerable') return 'Immediate'
  if (band === 'alarp') return 'Within 4h'
  return 'Next review'
}

/** Marker shape by band so risk is never conveyed by colour alone — also distinguishes an
 * overdue hazard by shape, not just colour, in the register (spec §5). */
export type MarkerShape = 'circle' | 'triangle' | 'diamond'

export function markerShapeForBand(band: RiskBand): MarkerShape {
  if (band === 'acceptable') return 'circle'
  if (band === 'alarp') return 'triangle'
  return 'diamond'
}

export interface RiskMatrixCell {
  frequencyIndex: number
  severityIndex: number
  riskIndex: number
  band: RiskBand
}

/** The full 7 (FI) x 4 (SI) matrix, one cell per index pair. */
export function buildRiskMatrixCells(): RiskMatrixCell[] {
  const cells: RiskMatrixCell[] = []
  for (let fi = FREQUENCY_INDEX_MIN; fi <= FREQUENCY_INDEX_MAX; fi++) {
    for (let si = SEVERITY_INDEX_MIN; si <= SEVERITY_INDEX_MAX; si++) {
      const riskIndex = computeRiskIndex(fi, si)
      cells.push({ frequencyIndex: fi, severityIndex: si, riskIndex, band: riskBand(riskIndex) })
    }
  }
  return cells
}

/** Every distinct RI value the matrix can produce (2..11), each an iso-risk diagonal. */
export function isoRiskValues(): number[] {
  const values = new Set<number>()
  for (const cell of buildRiskMatrixCells()) values.add(cell.riskIndex)
  return [...values].sort((a, b) => a - b)
}
