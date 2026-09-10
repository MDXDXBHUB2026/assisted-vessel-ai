import type { HealthLevel, RiskLevel } from './common'

export type ShoreFunction = 'marine_operations' | 'technical_support' | 'safety_support' | 'fleet_performance'

export const SHORE_FUNCTION_LABELS: Record<ShoreFunction, string> = {
  marine_operations: 'Marine Operations',
  technical_support: 'Technical Support',
  safety_support: 'Safety Support',
  fleet_performance: 'Fleet Performance / Energy',
}

export interface FleetVesselSummary {
  vesselId: string
  name: string
  vesselType: string
  operationalMode: string
  assistanceMode: HealthLevel
  riskLevel: RiskLevel
  position: { latitude: number; longitude: number }
  activeRequests: number
  communicationsOk: boolean
}

export type ShoreCaseStatus = 'open' | 'accepted' | 'in_review' | 'guidance_provided' | 'returned' | 'closed'

export interface ShoreCase {
  id: string
  vesselId: string
  vesselName: string
  function: ShoreFunction
  priority: HealthLevel
  reason: string
  requestedExpertise: string
  status: ShoreCaseStatus
  createdAtIso: string
  guidanceNotes?: string
  recommendationId?: string
}
