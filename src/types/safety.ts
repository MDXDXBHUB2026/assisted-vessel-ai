import type { AssistanceLevel, OddStatus, RiskLevel, SafetyVerdict, VesselSystemArea } from './common'

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
  | 'dataLatency'
  | 'dataQuality'
  | 'operationalMode'

export interface OddParameterStatus {
  key: OddParameterKey
  label: string
  value: string
  status: OddStatus
  /** 0 = at the limit, 1 = full margin. Used to render proximity to a limit, not just a boolean. */
  marginFraction: number
  detail: string
}

export interface OddAssessment {
  functionId: string
  functionLabel: string
  status: OddStatus
  limitingFactors: OddParameterStatus[]
  nearLimitFactors: OddParameterStatus[]
  parameters: OddParameterStatus[]
  /** Assistance level actually available right now given the envelope/system state, vs. the level configured for this function. */
  availableAssistanceLevel: AssistanceLevel
  configuredAssistanceLevel: AssistanceLevel
  /** Hard ceiling declared for this function — enforced, never merely documented. */
  maxAssistanceLevel: AssistanceLevel
  /** Vessel system areas whose source-data availability this function actually depends on. */
  requiredSourceAreas: VesselSystemArea[]
  assistanceLimitingReason?: string
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
