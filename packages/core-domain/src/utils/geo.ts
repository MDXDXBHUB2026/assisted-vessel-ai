import type { GeoPosition } from '@/types'

const EARTH_RADIUS_NM = 3440.065

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

/** Project a new position given a starting point, course (deg true) and distance (nm). */
export function projectPosition(start: GeoPosition, courseDeg: number, distanceNm: number): GeoPosition {
  const lat1 = toRad(start.latitude)
  const lon1 = toRad(start.longitude)
  const brng = toRad(courseDeg)
  const angularDistance = distanceNm / EARTH_RADIUS_NM

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(brng))
  const lon2 =
    lon1 + Math.atan2(Math.sin(brng) * Math.sin(angularDistance) * Math.cos(lat1), Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2))

  return { latitude: toDeg(lat2), longitude: toDeg(lon2) }
}

export function haversineNm(a: GeoPosition, b: GeoPosition): number {
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(h))
}

export function bearingDeg(a: GeoPosition, b: GeoPosition): number {
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Closest point of approach and time to it, for two vessels moving at constant course/speed (knots). */
export function computeCpaTcpa(
  own: GeoPosition,
  ownCourseDeg: number,
  ownSpeedKn: number,
  target: GeoPosition,
  targetCourseDeg: number,
  targetSpeedKn: number,
): { cpaNm: number; tcpaMinutes: number } {
  // Convert to a local flat-earth nm grid centred on own ship for small-scale relative motion.
  const nmPerDegLat = 60
  const nmPerDegLon = 60 * Math.cos(toRad(own.latitude))

  const dxNm = (target.longitude - own.longitude) * nmPerDegLon
  const dyNm = (target.latitude - own.latitude) * nmPerDegLat

  const ownVx = ownSpeedKn * Math.sin(toRad(ownCourseDeg))
  const ownVy = ownSpeedKn * Math.cos(toRad(ownCourseDeg))
  const targetVx = targetSpeedKn * Math.sin(toRad(targetCourseDeg))
  const targetVy = targetSpeedKn * Math.cos(toRad(targetCourseDeg))

  const relVx = targetVx - ownVx
  const relVy = targetVy - ownVy
  const relSpeedSq = relVx * relVx + relVy * relVy

  if (relSpeedSq < 1e-6) {
    return { cpaNm: Math.hypot(dxNm, dyNm), tcpaMinutes: Number.POSITIVE_INFINITY }
  }

  const tcpaHours = -(dxNm * relVx + dyNm * relVy) / relSpeedSq
  const tcpaMinutes = tcpaHours * 60

  const closestX = dxNm + relVx * tcpaHours
  const closestY = dyNm + relVy * tcpaHours
  const cpaNm = Math.hypot(closestX, closestY)

  return { cpaNm, tcpaMinutes }
}
