import type { GeoPosition } from './vessel'

export interface TargetVessel {
  id: string
  label: string
  position: GeoPosition
  heading: number
  speedKn: number
  cpaNm: number
  tcpaMinutes: number
  relativeRisk: 'low' | 'medium' | 'high'
  vesselType: string
}

export interface RouteWaypoint {
  label: string
  position: GeoPosition
  etaIso: string
}
