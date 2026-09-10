import type { RiskLevel, SafetyVerdict } from './common'

export type OddParameterKey =
  | 'visibility'
  | 'wind'
  | 'waveHeight'
  | 'seaState'
  | 'trafficDensity'
  | 'gnssAvailability'
  | 'radarAvailability'
  | 'aisAvailability'
  | 'chartDataValidity'
  | 'machineryHealth'
  | 'communications'
  | 'sensorConfidence'

export interface OddParameterStatus {
  key: OddParameterKey
  label: string
  value: string
  withinLimit: boolean
  detail: string
}

export interface OddAssessment {
  functionId: string
  functionLabel: string
  insideEnvelope: boolean
  limitingFactors: OddParameterStatus[]
  parameters: OddParameterStatus[]
}

export interface SafetyValidationResult {
  verdict: SafetyVerdict
  checks: {
    label: string
    passed: boolean
    detail: string
  }[]
  reason?: string
}

export interface Hazard {
  id: string
  title: string
  category: 'navigation' | 'machinery' | 'cargo' | 'personnel' | 'environmental' | 'security'
  riskLevel: RiskLevel
  likelihood: 'rare' | 'unlikely' | 'possible' | 'likely' | 'almost_certain'
  severity: 'minor' | 'moderate' | 'major' | 'catastrophic'
  peopleExposed: number
  immediateMitigation: string
  recommendedCorrectiveAction: string
  responsibleRole: string
  residualRisk: RiskLevel
  status: 'open' | 'acknowledged' | 'assigned' | 'investigating' | 'escalated' | 'closed'
  raisedAtIso: string
}
