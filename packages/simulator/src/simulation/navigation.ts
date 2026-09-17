import type { GeoPosition, TargetVessel } from '@ave/core-domain/types'
import { bearingDeg, computeCpaTcpa, projectPosition } from '@ave/core-domain/utils/geo'
import { ROUTE_WAYPOINTS } from '../data/route'
import { clamp } from '@ave/core-domain/utils/random'
import { classifyTargetRisk, DEFAULT_TARGET_RISK_LIMITS, type TargetRiskLimits } from '@ave/decision-engine/targetRisk'

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
  /** The single operator CPA/TCPA limit pair. Defaults to the same limits the navigation canvas
   * starts with, so callers that don't yet thread the operator's setting through still agree with
   * it rather than applying an independent, ad hoc threshold. */
  riskLimits?: TargetRiskLimits
}

const CONVERGING_TARGET_ID = 'TGT-002'

/**
 * `TargetVessel['relativeRisk']` is consumed by the CPA alarm (`buildDesiredAlarms`), the
 * collision-risk recommendation gate, and the navigation risk badge. It must come from the same
 * `classifyTargetRisk` limit pair the navigation canvas uses to paint DANGEROUS/CAUTION — four
 * independent ad hoc thresholds previously let the canvas, alarm, recommendation and badge
 * disagree about the same target.
 */
export function toRelativeRisk(cpaNm: number, tcpaMinutes: number, limits: TargetRiskLimits): TargetVessel['relativeRisk'] {
  const level = classifyTargetRisk(cpaNm, tcpaMinutes, limits)
  return level === 'dangerous' ? 'high' : level === 'caution' ? 'medium' : 'low'
}

export function updateTargets(input: UpdateTargetsInput): TargetVessel[] {
  const { targets, ownPosition, ownHeading, ownSpeedKn, collisionScenarioActive, severity, dtMinutes, riskLimits = DEFAULT_TARGET_RISK_LIMITS } = input

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

    const relativeRisk = toRelativeRisk(cpaNm, tcpaMinutes, riskLimits)

    return { ...target, heading, position, cpaNm, tcpaMinutes, relativeRisk }
  })
}
