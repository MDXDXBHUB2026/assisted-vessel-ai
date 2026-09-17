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
  /** AIS activation state for display purposes — an activated target is being actively tracked
   * (full symbol, vector, heading line); a sleeping target is a smaller, unadorned contact. */
  activated: boolean
}

export interface RouteWaypoint {
  label: string
  position: GeoPosition
  etaIso: string
}
