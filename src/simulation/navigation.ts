import type { GeoPosition, TargetVessel } from '@/types'
import { bearingDeg, computeCpaTcpa, projectPosition } from '@/utils/geo'
import { ROUTE_WAYPOINTS } from '@/data/route'
import { clamp } from '@/utils/random'

/** Returns the bearing (deg true) from the vessel's current position toward the next uncompleted waypoint. */
export function courseToNextWaypoint(position: GeoPosition, distanceRemainingNm: number): number {
  const waypointIndex = clamp(Math.floor(ROUTE_WAYPOINTS.length * (1 - distanceRemainingNm / 780)), 0, ROUTE_WAYPOINTS.length - 1)
  const next = ROUTE_WAYPOINTS[Math.min(waypointIndex + 1, ROUTE_WAYPOINTS.length - 1)] ?? ROUTE_WAYPOINTS[ROUTE_WAYPOINTS.length - 1]!
  return bearingDeg(position, next)
}

export function advanceOwnPosition(position: GeoPosition, headingDeg: number, speedKn: number, dtMinutes: number): GeoPosition {
  const distanceNm = speedKn * (dtMinutes / 60)
  return projectPosition(position, headingDeg, distanceNm)
}

export interface UpdateTargetsInput {
  targets: TargetVessel[]
  ownPosition: GeoPosition
  ownHeading: number
  ownSpeedKn: number
  collisionScenarioActive: boolean
  severity: number
  dtMinutes: number
}

const CONVERGING_TARGET_ID = 'TGT-002'

export function updateTargets(input: UpdateTargetsInput): TargetVessel[] {
  const { targets, ownPosition, ownHeading, ownSpeedKn, collisionScenarioActive, severity, dtMinutes } = input

  return targets.map((target) => {
    let heading = target.heading

    if (collisionScenarioActive && target.id === CONVERGING_TARGET_ID) {
      // Steer gradually toward a closing course with own ship — bridge-team-visible risk development,
      // not an autonomous control action on any vessel.
      const interceptPoint = projectPosition(ownPosition, ownHeading, ownSpeedKn * 1.5)
      const desiredBearing = bearingDeg(target.position, interceptPoint)
      const delta = ((((desiredBearing - heading + 540) % 360) - 180) * severity) / 25
      heading = (heading + delta + 360) % 360
    }

    const distanceNm = target.speedKn * (dtMinutes / 60)
    const position = projectPosition(target.position, heading, distanceNm)
    const { cpaNm, tcpaMinutes } = computeCpaTcpa(ownPosition, ownHeading, ownSpeedKn, position, heading, target.speedKn)

    const relativeRisk: TargetVessel['relativeRisk'] = cpaNm < 1.2 && tcpaMinutes < 45 && tcpaMinutes > 0 ? 'high' : cpaNm < 3 && tcpaMinutes < 90 && tcpaMinutes > 0 ? 'medium' : 'low'

    return { ...target, heading, position, cpaNm, tcpaMinutes, relativeRisk }
  })
}
