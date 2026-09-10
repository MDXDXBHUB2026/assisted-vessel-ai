import type { HealthLevel, VesselSystemArea } from './common'

export interface RawAlarm {
  id: string
  timestampIso: string
  area: VesselSystemArea
  tag: string
  description: string
  severity: HealthLevel
  active: boolean
  correlationGroup?: string
}

export interface CorrelatedEvent {
  id: string
  title: string
  probableCommonCause: string
  primaryAlarmId: string
  secondaryAlarmIds: string[]
  priority: HealthLevel
  recommendedCrewResponse: string
}
