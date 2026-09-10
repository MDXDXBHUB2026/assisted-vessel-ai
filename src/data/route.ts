import type { GeoPosition } from '@/types'

export const DEPARTURE_PORT = 'Port of Halvern (Fictional)'
export const DESTINATION_PORT = 'Port of Isarna (Fictional)'

export const DEPARTURE_POSITION: GeoPosition = { latitude: 1.28, longitude: 103.85 }
export const DESTINATION_POSITION: GeoPosition = { latitude: 13.75, longitude: 100.49 }

/** Simplified great-circle-ish waypoint chain for the demo voyage, synthetic strait/coastal transit included. */
export const ROUTE_WAYPOINTS: GeoPosition[] = [
  { latitude: 1.28, longitude: 103.85 },
  { latitude: 2.9, longitude: 101.4 },
  { latitude: 5.6, longitude: 98.9 },
  { latitude: 8.9, longitude: 98.4 },
  { latitude: 11.9, longitude: 99.6 },
  { latitude: 13.75, longitude: 100.49 },
]

export const TOTAL_ROUTE_DISTANCE_NM = 780
