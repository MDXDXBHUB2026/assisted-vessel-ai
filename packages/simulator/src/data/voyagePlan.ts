import type { VoyagePlan } from '@ave/core-domain/types'
import { DEPARTURE_PORT, DESTINATION_PORT, TOTAL_ROUTE_DISTANCE_NM } from './route'
import { SIM_START_ISO } from '@ave/core-domain/simClock'

export function buildBaselineVoyagePlan(): VoyagePlan {
  return {
    departurePort: DEPARTURE_PORT,
    destinationPort: DESTINATION_PORT,
    departedAtIso: SIM_START_ISO,
    distanceTotalNm: TOTAL_ROUTE_DISTANCE_NM,
    distanceRemainingNm: TOTAL_ROUTE_DISTANCE_NM,
    currentSpeedKn: 18.5,
    recommendedSpeedKn: 18.5,
    userModifiedSpeedKn: null,
    etaCurrentIso: addHours(SIM_START_ISO, TOTAL_ROUTE_DISTANCE_NM / 18.5),
    etaRecommendedIso: addHours(SIM_START_ISO, TOTAL_ROUTE_DISTANCE_NM / 18.5),
    arrivalWindowStartIso: addHours(SIM_START_ISO, TOTAL_ROUTE_DISTANCE_NM / 18.5 - 2),
    arrivalWindowEndIso: addHours(SIM_START_ISO, TOTAL_ROUTE_DISTANCE_NM / 18.5 + 3),
    fuelEstimateCurrentTons: 620,
    fuelEstimateRecommendedTons: 620,
    fuelSavingTons: 0,
    co2SavingTons: 0,
    weatherExposure: 'favourable',
    recommendationAccepted: false,
  }
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600_000).toISOString()
}
