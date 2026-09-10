export interface MaintenanceItem {
  id: string
  component: string
  area: string
  runningHours: number
  hoursSinceOverhaul: number
  maintenanceHistory: { dateIso: string; action: string }[]
  remainingUsefulLifeHours: number
  failureProbabilityPercent: number
  predictedFailureMode: string
  confidencePercent: number
  spareAvailability: 'onboard' | 'next_port' | 'order_required'
  nextSuitableOpportunity: string
  estimatedDowntimeHours: number
  operationalConsequence: string
}
