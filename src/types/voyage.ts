export interface VoyagePlan {
  departurePort: string
  destinationPort: string
  departedAtIso: string
  distanceTotalNm: number
  distanceRemainingNm: number
  currentSpeedKn: number
  recommendedSpeedKn: number
  userModifiedSpeedKn: number | null
  etaCurrentIso: string
  etaRecommendedIso: string
  arrivalWindowStartIso: string
  arrivalWindowEndIso: string
  fuelEstimateCurrentTons: number
  fuelEstimateRecommendedTons: number
  fuelSavingTons: number
  co2SavingTons: number
  weatherExposure: 'favourable' | 'moderate' | 'adverse'
  recommendationAccepted: boolean
}
