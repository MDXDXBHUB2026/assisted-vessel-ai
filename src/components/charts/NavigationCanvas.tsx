import { useEffect, useRef, useState } from 'react'
import type { GeoPosition, TargetVessel } from '@/types'
import { bearingDeg, haversineNm, projectPosition } from '@/utils/geo'
import { classifyTargetRisk, type TargetRiskLevel } from '@/decision-engine/targetRisk'
import { useSimulationStore } from '@/store/simulationStore'

type NavOrientation = 'north_up' | 'course_up'
type NavMotionMode = 'relative' | 'true'

interface NavLayerToggles {
  route: boolean
  targets: boolean
  predicted: boolean
  cpaTcpa: boolean
  safetyDomain: boolean
  weather: boolean
  historicalTrack: boolean
}

const DEFAULT_NAV_LAYERS: NavLayerToggles = {
  route: true,
  targets: true,
  predicted: true,
  cpaTcpa: true,
  safetyDomain: true,
  weather: true,
  historicalTrack: true,
}

interface Props {
  own: GeoPosition
  ownHeadingDeg: number
  ownSpeedKn: number
  targets: TargetVessel[]
  routeWaypoints: GeoPosition[]
  historicalTrack: GeoPosition[]
  windSpeedKn: number
  windDirectionDeg: number
  visibilityNm: number
}

interface AnimatedEntity {
  fromLat: number
  fromLon: number
  toLat: number
  toLon: number
  fromHeading: number
  toHeading: number
  updatedAtMs: number
}

interface TrailSample {
  tMs: number
  targetPos: GeoPosition
  ownPos: GeoPosition
}

// IMO Res. MSC.192(79): "Range scales of 0.25, 0.5, 0.75, 1.5, 3, 6, 12 and 24 NM should be
// provided." Exactly these eight — no wider voyage-planning scale belongs on a tactical picture.
const RANGE_SCALES_NM = [0.25, 0.5, 0.75, 1.5, 3, 6, 12, 24]
const VECTOR_MINUTE_OPTIONS = [3, 6, 12] as const
type VectorMinutes = (typeof VECTOR_MINUTE_OPTIONS)[number]
const TRAIL_OPTIONS = [
  { key: 'off', ms: 0, label: 'OFF' },
  { key: '30s', ms: 30_000, label: '30S' },
  { key: '1m', ms: 60_000, label: '1M' },
  { key: '3m', ms: 180_000, label: '3M' },
  { key: '6m', ms: 360_000, label: '6M' },
] as const
type TrailKey = (typeof TRAIL_OPTIONS)[number]['key']
const TRAIL_HISTORY_CAP_MS = 360_000

const RING_COUNT = 4
const TARGET_HIT_RADIUS_PX = 16
const TRANSITION_MS = 950
const TRUE_MOTION_RESET_FRACTION = 0.6

// This is a compressed-time DEMONSTRATOR, not a live radar watched for hours — a real 1x baseline
// of ~30 simulated seconds per real second (docs/architecture.md section 4). The perceptibility
// constraint below is evaluated against this fixed 1x baseline regardless of the live playback
// speed multiplier, which this component does not receive, so the auto-selected scale does not
// jitter as the operator changes speed. This is a demonstrator-specific rule, not a standards
// requirement — MSC.192(79) says nothing about perceptibility thresholds.
const SIM_MINUTES_PER_REAL_SECOND_AT_1X = 0.5
const MIN_PERCEPTIBLE_FRACTION_PER_SECOND = 0.01

const CPA_LIMIT_STEP_NM = 0.25
const CPA_LIMIT_MIN_NM = 0.25
const CPA_LIMIT_MAX_NM = 5
const TCPA_LIMIT_STEP_MIN = 5
const TCPA_LIMIT_MIN_MIN = 5
const TCPA_LIMIT_MAX_MIN = 60

function angleDelta(from: number, to: number): number {
  let d = (to - from) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function clampIndex(i: number): number {
  return Math.min(RANGE_SCALES_NM.length - 1, Math.max(0, i))
}

function formatNm(nm: number): string {
  return nm < 10 ? nm.toFixed(2) : nm.toFixed(1)
}

function isPerceptible(speedKn: number, rangeNm: number): boolean {
  return (speedKn * SIM_MINUTES_PER_REAL_SECOND_AT_1X) / (60 * rangeNm) >= MIN_PERCEPTIBLE_FRACTION_PER_SECOND
}

/**
 * Fits the tactical collision-avoidance picture: every dangerous/caution target and its vector
 * head, the three nearest targets of any classification, and own ship's own vector head. The
 * route and next waypoint are deliberately excluded — a voyage-planning extent belongs in a
 * separate view, not on the tactical picture (MSC.192(79) provides no such requirement, and no
 * watchkeeper monitors traffic at voyage-planning range). If containing all of that would force a
 * scale where motion is imperceptible, perceptibility wins.
 */
function computeAutoRangeNm(own: GeoPosition, ownHeadingDeg: number, ownSpeedKn: number, targets: TargetVessel[], riskById: Map<string, TargetRiskLevel>, vectorMinutes: number): number {
  const ranged = targets.map((t) => ({ t, rangeNm: haversineNm(own, t.position) })).sort((a, b) => a.rangeNm - b.rangeNm)
  const requiredNm: number[] = [RANGE_SCALES_NM[0]!]

  for (const { t, rangeNm } of ranged) {
    if ((riskById.get(t.id) ?? 'normal') === 'normal') continue
    const vectorHead = projectPosition(t.position, t.heading, t.speedKn * (vectorMinutes / 60))
    requiredNm.push(rangeNm, haversineNm(own, vectorHead))
  }
  for (const { rangeNm } of ranged.slice(0, 3)) requiredNm.push(rangeNm)

  const ownVectorHead = projectPosition(own, ownHeadingDeg, ownSpeedKn * (vectorMinutes / 60))
  requiredNm.push(haversineNm(own, ownVectorHead))

  const minRequiredNm = Math.max(...requiredNm)

  for (const scale of RANGE_SCALES_NM) {
    if (scale >= minRequiredNm && isPerceptible(ownSpeedKn, scale)) return scale
  }
  // No scale satisfies both containment and perceptibility — a display that reads as frozen has
  // failed at its job, so prefer the largest scale that still keeps motion visible.
  let fallback = RANGE_SCALES_NM[0]!
  for (const scale of RANGE_SCALES_NM) {
    if (isPerceptible(ownSpeedKn, scale)) fallback = scale
  }
  return fallback
}

function screenAngleRad(trueBearingDeg: number, rotationDeg: number): number {
  return ((trueBearingDeg - rotationDeg) * Math.PI) / 180
}

function polarPoint(cx: number, cy: number, radiusPx: number, angleRad: number): [number, number] {
  return [cx + radiusPx * Math.sin(angleRad), cy - radiusPx * Math.cos(angleRad)]
}

function describeAspect(relBearingDeg: number): string {
  const rounded = Math.round(Math.abs(relBearingDeg))
  if (rounded === 0) return '000 DEAD AHEAD'
  if (rounded === 180) return '180 DEAD ASTERN'
  return `${relBearingDeg > 0 ? 'GREEN' : 'RED'} ${String(rounded).padStart(3, '0')}`
}

export function NavigationCanvas({ own, ownHeadingDeg, ownSpeedKn, targets, routeWaypoints, historicalTrack, windSpeedKn, windDirectionDeg, visibilityNm }: Props) {
  const logAudit = useSimulationStore((s) => s.logAudit)
  // The CPA/TCPA limit pair lives in the simulation store, not component state: it is the same
  // single limit pair the CPA alarm and the collision-risk recommendation gate apply (MSC.192(79)),
  // and it must survive a remount of this panel (e.g. switching tabs) rather than resetting.
  const { cpaLimitNm, tcpaLimitMinutes } = useSimulationStore((s) => s.targetRiskLimits)
  const setTargetRiskLimits = useSimulationStore((s) => s.setTargetRiskLimits)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [orientation, setOrientation] = useState<NavOrientation>('north_up')
  const [motionMode, setMotionMode] = useState<NavMotionMode>('true')
  const [layers, setLayers] = useState<NavLayerToggles>(DEFAULT_NAV_LAYERS)
  const [autoRange, setAutoRange] = useState(true)
  const [manualRangeIndex, setManualRangeIndex] = useState(RANGE_SCALES_NM.indexOf(6))
  const [vectorMinutes, setVectorMinutes] = useState<VectorMinutes>(6)
  const [trailKey, setTrailKey] = useState<TrailKey>('3m')
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [displayRangeNm, setDisplayRangeNm] = useState(6)

  const ownAnimRef = useRef<AnimatedEntity>({ fromLat: own.latitude, fromLon: own.longitude, toLat: own.latitude, toLon: own.longitude, fromHeading: ownHeadingDeg, toHeading: ownHeadingDeg, updatedAtMs: performance.now() })
  const targetAnimRef = useRef<Map<string, AnimatedEntity>>(new Map())
  const rafRef = useRef<number | undefined>(undefined)
  const autoRangeIndexRef = useRef(RANGE_SCALES_NM.indexOf(6))
  const acknowledgedIdsRef = useRef<Set<string>>(new Set())
  const hitTargetsRef = useRef<{ id: string; x: number; y: number }[]>([])
  const riskByIdRef = useRef<Map<string, TargetRiskLevel>>(new Map())
  const trueMotionAnchorRef = useRef<GeoPosition | null>(null)
  const targetTrailsRef = useRef<Map<string, TrailSample[]>>(new Map())
  const ownTrailRef = useRef<{ tMs: number; pos: GeoPosition }[]>([])
  const prevRangeNmRef = useRef<number | null>(null)

  const latestRef = useRef({
    own,
    ownHeadingDeg,
    ownSpeedKn,
    targets,
    routeWaypoints,
    historicalTrack,
    windSpeedKn,
    windDirectionDeg,
    visibilityNm,
    orientation,
    motionMode,
    layers,
    autoRange,
    manualRangeIndex,
    vectorMinutes,
    trailKey,
    selectedTargetId,
    cpaLimitNm,
    tcpaLimitMinutes,
  })
  latestRef.current = {
    own,
    ownHeadingDeg,
    ownSpeedKn,
    targets,
    routeWaypoints,
    historicalTrack,
    windSpeedKn,
    windDirectionDeg,
    visibilityNm,
    orientation,
    motionMode,
    layers,
    autoRange,
    manualRangeIndex,
    vectorMinutes,
    trailKey,
    selectedTargetId,
    cpaLimitNm,
    tcpaLimitMinutes,
  }

  // Register a new animation leg whenever the engine tick produces new own-ship/target values, and
  // append this tick's positions to the trail history (real-time-based, independent of playback speed).
  useEffect(() => {
    const now = performance.now()
    const prevOwn = ownAnimRef.current
    const ownInterpNow = interpolateEntity(prevOwn, now)
    ownAnimRef.current = { fromLat: ownInterpNow.lat, fromLon: ownInterpNow.lon, toLat: own.latitude, toLon: own.longitude, fromHeading: ownInterpNow.heading, toHeading: ownHeadingDeg, updatedAtMs: now }

    const ownPosNow: GeoPosition = { latitude: own.latitude, longitude: own.longitude }
    ownTrailRef.current.push({ tMs: now, pos: ownPosNow })
    ownTrailRef.current = ownTrailRef.current.filter((s) => now - s.tMs <= TRAIL_HISTORY_CAP_MS)

    for (const t of targets) {
      const prev = targetAnimRef.current.get(t.id)
      const base = prev ?? { fromLat: t.position.latitude, fromLon: t.position.longitude, toLat: t.position.latitude, toLon: t.position.longitude, fromHeading: t.heading, toHeading: t.heading, updatedAtMs: now }
      const interpNow = interpolateEntity(base, now)
      targetAnimRef.current.set(t.id, { fromLat: interpNow.lat, fromLon: interpNow.lon, toLat: t.position.latitude, toLon: t.position.longitude, fromHeading: interpNow.heading, toHeading: t.heading, updatedAtMs: now })

      const trail = targetTrailsRef.current.get(t.id) ?? []
      trail.push({ tMs: now, targetPos: t.position, ownPos: ownPosNow })
      targetTrailsRef.current.set(
        t.id,
        trail.filter((s) => now - s.tMs <= TRAIL_HISTORY_CAP_MS),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own.latitude, own.longitude, ownHeadingDeg, targets])

  // Trails and the true-motion anchor are cleared on an explicit motion-mode change, per spec.
  useEffect(() => {
    targetTrailsRef.current.clear()
    ownTrailRef.current = []
    trueMotionAnchorRef.current = null
  }, [motionMode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const render = () => {
      const now = performance.now()
      const {
        ownSpeedKn: curSpeed,
        targets: curTargets,
        historicalTrack: curTrack,
        windSpeedKn: curWind,
        windDirectionDeg: curWindDir,
        visibilityNm: curVis,
        orientation: curOrientation,
        motionMode: curMotionMode,
        layers: curLayers,
        autoRange: curAutoRange,
        manualRangeIndex: curManualRangeIndex,
        vectorMinutes: curVectorMinutes,
        trailKey: curTrailKey,
        selectedTargetId: curSelectedId,
        cpaLimitNm: curCpaLimit,
        tcpaLimitMinutes: curTcpaLimit,
      } = latestRef.current

      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr
        canvas.height = rect.height * dpr
      }
      const W = rect.width
      const H = rect.height
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, W, H)
      ctx.clip()

      const ownNow = interpolateEntity(ownAnimRef.current, now)
      const ownPos: GeoPosition = { latitude: ownNow.lat, longitude: ownNow.lon }
      const targetsNow = curTargets.map((t) => {
        const anim = targetAnimRef.current.get(t.id)
        const interp = anim ? interpolateEntity(anim, now) : { lat: t.position.latitude, lon: t.position.longitude, heading: t.heading }
        return { ...t, position: { latitude: interp.lat, longitude: interp.lon }, heading: interp.heading }
      })

      const riskLimits = { cpaLimitNm: curCpaLimit, tcpaLimitMinutes: curTcpaLimit }
      riskByIdRef.current = new Map(curTargets.map((t) => [t.id, classifyTargetRisk(t.cpaNm, t.tcpaMinutes, riskLimits)]))
      for (const [id, risk] of riskByIdRef.current) {
        if (risk !== 'dangerous') acknowledgedIdsRef.current.delete(id)
      }

      const rangeNm = curAutoRange ? computeAutoRangeNm(ownPos, ownNow.heading, curSpeed, curTargets, riskByIdRef.current, curVectorMinutes) : RANGE_SCALES_NM[clampIndex(curManualRangeIndex)]!
      if (curAutoRange) autoRangeIndexRef.current = RANGE_SCALES_NM.indexOf(rangeNm)
      if (prevRangeNmRef.current !== null && prevRangeNmRef.current !== rangeNm) {
        targetTrailsRef.current.clear()
        ownTrailRef.current = []
      }
      prevRangeNmRef.current = rangeNm

      const rotationDeg = curOrientation === 'north_up' ? 0 : -ownNow.heading
      const originX = W / 2
      const originY = H / 2
      const bearingRingRadiusPx = Math.max(Math.min(originX, W - originX, originY, H - originY) * 0.9, 24)
      const pxPerNm = (bearingRingRadiusPx * 0.88) / rangeNm

      const projectFrom = (center: GeoPosition, p: GeoPosition): [number, number] => {
        const dLatNm = (p.latitude - center.latitude) * 60
        const dLonNm = (p.longitude - center.longitude) * 60 * Math.cos((center.latitude * Math.PI) / 180)
        const rot = (rotationDeg * Math.PI) / 180
        const rx = dLonNm * Math.cos(rot) - dLatNm * Math.sin(rot)
        const ry = dLonNm * Math.sin(rot) + dLatNm * Math.cos(rot)
        return [originX + rx * pxPerNm, originY - ry * pxPerNm]
      }

      // Relative motion: own ship is always the projection centre, so it never moves by
      // construction. True motion: a fixed geographic anchor is the centre, so own ship travels
      // across the display until it nears the edge, then the anchor resets to own ship's current
      // position — the picture "resets" exactly as MSC.192(79) describes.
      if (curMotionMode === 'relative') {
        trueMotionAnchorRef.current = null
      } else if (!trueMotionAnchorRef.current) {
        trueMotionAnchorRef.current = ownPos
      }
      const projectionCentre = curMotionMode === 'true' ? trueMotionAnchorRef.current! : ownPos
      const project = (p: GeoPosition) => projectFrom(projectionCentre, p)

      let [ox, oy] = project(ownPos)
      if (curMotionMode === 'true') {
        const dispFromOrigin = Math.hypot(ox - originX, oy - originY)
        if (dispFromOrigin > bearingRingRadiusPx * TRUE_MOTION_RESET_FRACTION) {
          trueMotionAnchorRef.current = ownPos
          targetTrailsRef.current.clear()
          ownTrailRef.current = []
          ;[ox, oy] = project(ownPos)
        }
      }

      // background
      ctx.fillStyle = '#0b132b'
      ctx.fillRect(0, 0, W, H)

      if (curLayers.weather) {
        const visPx = bearingRingRadiusPx * clamp01(curVis / 10)
        const grad = ctx.createRadialGradient(ox, oy, visPx * 0.5, ox, oy, Math.max(W, H) * 0.8)
        grad.addColorStop(0, 'rgba(11,19,43,0)')
        grad.addColorStop(1, 'rgba(11,19,43,0.55)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)
      }

      drawRangeRings(ctx, originX, originY, rangeNm, pxPerNm)
      drawBearingRing(ctx, originX, originY, bearingRingRadiusPx, rotationDeg)

      const curRoute = latestRef.current.routeWaypoints
      if (curLayers.route && curMotionMode === 'relative' && curRoute.length > 1) {
        ctx.beginPath()
        curRoute.forEach((wp, i) => {
          const [x, y] = project(wp)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.strokeStyle = 'rgba(91,192,190,0.55)'
        ctx.setLineDash([5, 5])
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.setLineDash([])
      }

      if (curLayers.historicalTrack && curTrack.length > 1) {
        for (let i = 1; i < curTrack.length; i++) {
          const [x1, y1] = project(curTrack[i - 1]!)
          const [x2, y2] = project(curTrack[i]!)
          const alpha = 0.05 + 0.35 * (i / curTrack.length)
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.strokeStyle = `rgba(148,163,184,${alpha})`
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      if (curLayers.predicted) {
        const predicted = [10, 20, 30].map((min) => projectPosition(ownPos, ownNow.heading, curSpeed * (min / 60)))
        ctx.beginPath()
        ctx.moveTo(ox, oy)
        predicted.forEach((p) => {
          const [x, y] = project(p)
          ctx.lineTo(x, y)
        })
        ctx.strokeStyle = 'rgba(91,192,190,0.9)'
        ctx.setLineDash([2, 4])
        ctx.lineWidth = 1.25
        ctx.stroke()
        ctx.setLineDash([])
      }

      if (curLayers.safetyDomain) {
        ctx.beginPath()
        ctx.arc(ox, oy, 0.5 * pxPerNm, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(237,165,40,0.4)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // --- trails (subordinate to symbols: thin, fading, cleared on range/motion-mode change) ---
      const trailOption = TRAIL_OPTIONS.find((o) => o.key === curTrailKey)!
      if (trailOption.ms > 0) {
        if (curMotionMode === 'true') {
          drawTrueTrail(
            ctx,
            ownTrailRef.current.map((s) => ({ tMs: s.tMs, pos: s.pos })),
            project,
            now,
            trailOption.ms,
            '#94a3b8',
          )
        }
        for (const t of curTargets) {
          const color = riskColorFor(riskByIdRef.current.get(t.id) ?? 'normal')
          const samples = targetTrailsRef.current.get(t.id) ?? []
          if (curMotionMode === 'true') {
            drawTrueTrail(
              ctx,
              samples.map((s) => ({ tMs: s.tMs, pos: s.targetPos })),
              project,
              now,
              trailOption.ms,
              color,
            )
          } else {
            drawRelativeTrail(ctx, samples, projectFrom, now, trailOption.ms, color)
          }
        }
      }

      const placedLabels: LabelBox[] = []
      hitTargetsRef.current = []

      if (curLayers.targets) {
        for (const t of targetsNow) {
          const [tx, ty] = project(t.position)
          hitTargetsRef.current.push({ id: t.id, x: tx, y: ty })
          const risk = riskByIdRef.current.get(t.id) ?? 'normal'
          const isSelected = t.id === curSelectedId
          const acknowledged = acknowledgedIdsRef.current.has(t.id)
          const flashAlpha = risk === 'dangerous' && !acknowledged ? 0.55 + 0.45 * Math.sin(now / 220) : 1
          const color = riskColorFor(risk)
          const showFull = t.activated || risk !== 'normal'
          const size = showFull ? 11 : 6.5

          if (curLayers.cpaTcpa && risk !== 'normal') {
            const ownFuture = projectPosition(ownPos, ownNow.heading, curSpeed * (t.tcpaMinutes / 60))
            const targetFuture = projectPosition(t.position, t.heading, t.speedKn * (t.tcpaMinutes / 60))
            const [fx1, fy1] = project(ownFuture)
            const [fx2, fy2] = project(targetFuture)
            ctx.beginPath()
            ctx.moveTo(fx1, fy1)
            ctx.lineTo(fx2, fy2)
            ctx.strokeStyle = `${color}99`
            ctx.setLineDash([3, 3])
            ctx.lineWidth = 1
            ctx.stroke()
            ctx.setLineDash([])
            ctx.beginPath()
            ctx.arc(fx2, fy2, 3, 0, Math.PI * 2)
            ctx.fillStyle = color
            ctx.fill()
          }

          ctx.save()
          ctx.globalAlpha = flashAlpha
          if (showFull) {
            const headingAngle = screenAngleRad(t.heading, rotationDeg)
            const [hlx, hly] = polarPoint(tx, ty, size * 2, headingAngle)
            ctx.beginPath()
            ctx.moveTo(tx, ty)
            ctx.lineTo(hlx, hly)
            ctx.strokeStyle = color
            ctx.lineWidth = 1
            ctx.stroke()

            const vectorPx = Math.min(t.speedKn * (curVectorMinutes / 60) * pxPerNm, bearingRingRadiusPx * 0.9)
            const [vlx, vly] = polarPoint(tx, ty, vectorPx, headingAngle)
            ctx.setLineDash([2, 4])
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.moveTo(tx, ty)
            ctx.lineTo(vlx, vly)
            ctx.stroke()
            ctx.setLineDash([])
          }

          drawTargetTriangle(ctx, tx, ty, t.heading, rotationDeg, size, color, risk !== 'normal', risk === 'dangerous' ? 2.5 : risk === 'caution' ? 1.75 : 1.25)

          if (risk === 'dangerous') {
            ctx.beginPath()
            ctx.arc(tx, ty, size * 1.7, 0, Math.PI * 2)
            ctx.strokeStyle = color
            ctx.lineWidth = 1.5
            ctx.stroke()
          }
          ctx.restore()

          if (isSelected) drawCornerBrackets(ctx, tx, ty, size * 1.9)

          if (risk !== 'normal' || isSelected) {
            const label = `${t.label.replace('Synthetic Target ', '').toUpperCase()} ${formatNm(t.cpaNm)}`
            ctx.font = 'bold 10px Inter, sans-serif'
            const box = placeLabel(ctx, label, tx, ty, [...placedLabels])
            ctx.fillStyle = risk === 'dangerous' ? '#ffb3ab' : risk === 'caution' ? '#ffd685' : '#f1f5f9'
            ctx.fillText(label, box.x + 3, box.y + box.h - 3)
            placedLabels.push(box)
          }
        }
      }

      const ownLabelText = 'OWN SHIP'
      ctx.font = 'bold 10px Inter, sans-serif'
      placedLabels.push({ x: ox + 10, y: oy - 6, w: ctx.measureText(ownLabelText).width + 6, h: 14 })

      drawOwnShip(ctx, ox, oy, ownNow.heading, rotationDeg, curSpeed, curVectorMinutes, bearingRingRadiusPx, pxPerNm)
      ctx.font = 'bold 10px Inter, sans-serif'
      ctx.fillStyle = '#f8fafc'
      ctx.fillText(ownLabelText, ox + 10, oy + 4)

      if (curLayers.weather) drawWindIndicator(ctx, W, curWind, curWindDir)

      ctx.restore()
      setDisplayRangeNm((prev) => (prev === rangeNm ? prev : rangeNm))
      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    let hitId: string | null = null
    let hitDist = TARGET_HIT_RADIUS_PX
    for (const t of hitTargetsRef.current) {
      const d = Math.hypot(mx - t.x, my - t.y)
      if (d <= hitDist) {
        hitDist = d
        hitId = t.id
      }
    }
    setSelectedTargetId(hitId)
  }

  const stepRange = (dir: 1 | -1) => {
    const base = autoRange ? autoRangeIndexRef.current : manualRangeIndex
    setAutoRange(false)
    setManualRangeIndex(clampIndex(base + dir))
  }

  const selectedTarget = targets.find((t) => t.id === selectedTargetId) ?? null
  const selectedRisk = selectedTarget ? classifyTargetRisk(selectedTarget.cpaNm, selectedTarget.tcpaMinutes, { cpaLimitNm, tcpaLimitMinutes }) : 'normal'
  const selectedDetail = selectedTarget ? describeTargetDetail(own, selectedTarget) : null
  const trailLabel = TRAIL_OPTIONS.find((o) => o.key === trailKey)!.label

  const acknowledgeSelected = () => {
    if (!selectedTarget) return
    acknowledgedIdsRef.current.add(selectedTarget.id)
    logAudit(
      `Dangerous target ${selectedTarget.label} acknowledged by operator (CPA ${formatNm(selectedTarget.cpaNm)} nm, TCPA ${Number.isFinite(selectedTarget.tcpaMinutes) ? `${selectedTarget.tcpaMinutes.toFixed(0)} min` : 'n/a'}; limits in effect: ${cpaLimitNm.toFixed(2)} nm / ${tcpaLimitMinutes} min).`,
      'human_decision',
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-sm border border-hull-500/40 bg-hull-900/80 px-2 py-1.5 text-[9px]">
        <ControlGroup label="ORIENT">
          {(['north_up', 'course_up'] as NavOrientation[]).map((m) => (
            <ToggleButton key={m} active={orientation === m} onClick={() => setOrientation(m)}>
              {m.replace('_', ' ')}
            </ToggleButton>
          ))}
        </ControlGroup>
        <ControlGroup label="MOTION">
          {(['relative', 'true'] as NavMotionMode[]).map((m) => (
            <ToggleButton key={m} active={motionMode === m} onClick={() => setMotionMode(m)}>
              {m}
            </ToggleButton>
          ))}
        </ControlGroup>
        <ControlGroup label="RANGE">
          <button onClick={() => stepRange(-1)} className="rounded px-1.5 py-0.5 font-bold text-ink-300 hover:text-ink-100">
            −
          </button>
          <ToggleButton active={autoRange} onClick={() => setAutoRange(true)}>
            auto
          </ToggleButton>
          <button onClick={() => stepRange(1)} className="rounded px-1.5 py-0.5 font-bold text-ink-300 hover:text-ink-100">
            +
          </button>
        </ControlGroup>
        <ControlGroup label="VECTOR">
          {VECTOR_MINUTE_OPTIONS.map((m) => (
            <ToggleButton key={m} active={vectorMinutes === m} onClick={() => setVectorMinutes(m)}>
              {m}m
            </ToggleButton>
          ))}
        </ControlGroup>
        <ControlGroup label="TRAIL">
          {TRAIL_OPTIONS.map((o) => (
            <ToggleButton key={o.key} active={trailKey === o.key} onClick={() => setTrailKey(o.key)}>
              {o.label}
            </ToggleButton>
          ))}
        </ControlGroup>
        <ControlGroup label="CPA LIM">
          <button
            onClick={() => setTargetRiskLimits({ cpaLimitNm: clamp(cpaLimitNm - CPA_LIMIT_STEP_NM, CPA_LIMIT_MIN_NM, CPA_LIMIT_MAX_NM), tcpaLimitMinutes })}
            className="rounded px-1.5 py-0.5 font-bold text-ink-300 hover:text-ink-100"
          >
            −
          </button>
          <span className="min-w-[2.5em] text-center font-bold tabular-nums text-info-400">{cpaLimitNm.toFixed(2)}</span>
          <button
            onClick={() => setTargetRiskLimits({ cpaLimitNm: clamp(cpaLimitNm + CPA_LIMIT_STEP_NM, CPA_LIMIT_MIN_NM, CPA_LIMIT_MAX_NM), tcpaLimitMinutes })}
            className="rounded px-1.5 py-0.5 font-bold text-ink-300 hover:text-ink-100"
          >
            +
          </button>
        </ControlGroup>
        <ControlGroup label="TCPA LIM">
          <button
            onClick={() => setTargetRiskLimits({ cpaLimitNm, tcpaLimitMinutes: clamp(tcpaLimitMinutes - TCPA_LIMIT_STEP_MIN, TCPA_LIMIT_MIN_MIN, TCPA_LIMIT_MAX_MIN) })}
            className="rounded px-1.5 py-0.5 font-bold text-ink-300 hover:text-ink-100"
          >
            −
          </button>
          <span className="min-w-[2.5em] text-center font-bold tabular-nums text-info-400">{tcpaLimitMinutes}</span>
          <button
            onClick={() => setTargetRiskLimits({ cpaLimitNm, tcpaLimitMinutes: clamp(tcpaLimitMinutes + TCPA_LIMIT_STEP_MIN, TCPA_LIMIT_MIN_MIN, TCPA_LIMIT_MAX_MIN) })}
            className="rounded px-1.5 py-0.5 font-bold text-ink-300 hover:text-ink-100"
          >
            +
          </button>
        </ControlGroup>
        <div className="flex flex-wrap gap-1 sm:ml-auto">
          {(Object.keys(layers) as (keyof NavLayerToggles)[]).map((key) => (
            <button
              key={key}
              onClick={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
              className={`rounded px-1.5 py-0.5 font-medium uppercase ${layers[key] ? 'bg-hull-700 text-info-400' : 'text-ink-600'}`}
            >
              {key.replace(/([A-Z])/g, ' $1')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative aspect-[4/3] flex-1 overflow-hidden rounded-sm border border-panel-border">
          <canvas ref={canvasRef} className="h-full w-full cursor-pointer" onClick={handleCanvasClick} />
        </div>

        <div className="flex w-40 shrink-0 flex-col gap-2 text-[9px]">
          <div className="rounded-sm border border-panel-border bg-hull-900/70 p-2 leading-relaxed text-ink-300">
            <div className="font-bold text-ink-100">
              RANGE {formatNm(displayRangeNm)} NM {autoRange ? '(AUTO)' : '(MANUAL)'}
            </div>
            <div>RINGS {formatNm(displayRangeNm / RING_COUNT)} NM</div>
            <div className="mt-1 uppercase text-info-400">
              {motionMode} · {orientation.replace('_', ' ')}
            </div>
            <div>VECTOR {vectorMinutes} MIN</div>
            <div>TRAIL {trailLabel}</div>
            <div className="mt-1">
              CPA LIM {cpaLimitNm.toFixed(2)} NM
              <br />
              TCPA LIM {tcpaLimitMinutes} MIN
            </div>
          </div>

          {selectedTarget && selectedDetail ? (
            <div className="rounded-sm border border-panel-border bg-hull-900/90 p-2">
              <div className="mb-1 flex items-center justify-between border-b border-panel-border pb-1">
                <span className="font-bold uppercase text-ink-100">{selectedTarget.label.replace('Synthetic Target ', '')}</span>
                <button onClick={() => setSelectedTargetId(null)} className="text-ink-500 hover:text-ink-100">
                  ×
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-x-1 gap-y-0.5 tabular-nums text-ink-300">
                <dt className="text-ink-500">Range</dt>
                <dd>{formatNm(selectedDetail.rangeNm)} nm</dd>
                <dt className="text-ink-500">Bearing</dt>
                <dd>{selectedDetail.bearingDeg.toFixed(0).padStart(3, '0')}°</dd>
                <dt className="text-ink-500">COG</dt>
                <dd>{selectedTarget.heading.toFixed(0).padStart(3, '0')}°</dd>
                <dt className="text-ink-500">SOG</dt>
                <dd>{selectedTarget.speedKn.toFixed(1)} kn</dd>
                <dt className="text-ink-500">CPA</dt>
                <dd>{formatNm(selectedTarget.cpaNm)} nm</dd>
                <dt className="text-ink-500">TCPA</dt>
                <dd>{Number.isFinite(selectedTarget.tcpaMinutes) ? `${selectedTarget.tcpaMinutes.toFixed(0)} min` : '—'}</dd>
                <dt className="col-span-2 text-ink-500">Aspect</dt>
                <dd className="col-span-2">{selectedDetail.aspect}</dd>
                <dt className="col-span-2 text-ink-500">AIS state</dt>
                <dd className="col-span-2">{selectedTarget.activated ? 'ACTIVATED' : 'SLEEPING'}</dd>
              </dl>
              {selectedRisk === 'dangerous' && (
                <button onClick={acknowledgeSelected} className="mt-2 w-full rounded bg-critical-500 py-1 text-center font-bold uppercase text-hull-950 hover:bg-critical-400">
                  Acknowledge
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-sm border border-panel-border bg-hull-900/50 p-2 text-ink-600">Click a target for range, bearing, COG/SOG, CPA/TCPA and aspect.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="mr-1 font-bold uppercase text-ink-600">{label}</span>
      {children}
    </div>
  )
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded px-1.5 py-0.5 font-bold uppercase ${active ? 'bg-info-500 text-hull-950' : 'text-ink-300 hover:text-ink-100'}`}>
      {children}
    </button>
  )
}

function riskColorFor(risk: TargetRiskLevel): string {
  return risk === 'dangerous' ? '#f0473a' : risk === 'caution' ? '#eda528' : '#c3d1ea'
}

interface LabelBox {
  x: number
  y: number
  w: number
  h: number
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function placeLabel(ctx: CanvasRenderingContext2D, text: string, anchorX: number, anchorY: number, avoid: LabelBox[]): LabelBox {
  const w = ctx.measureText(text).width + 6
  const h = 13
  const offsets: [number, number][] = [
    [8, -8 - h],
    [-8 - w, -8 - h],
    [8, 8],
    [-8 - w, 8],
    [18, -18 - h],
    [-18 - w, -18 - h],
    [18, 18],
    [-18 - w, 18],
  ]
  for (const [dx, dy] of offsets) {
    const box = { x: anchorX + dx, y: anchorY + dy, w, h }
    if (!avoid.some((b) => boxesOverlap(box, b))) return box
  }
  const [dx, dy] = offsets[0]!
  return { x: anchorX + dx, y: anchorY + dy, w, h }
}

function drawRangeRings(ctx: CanvasRenderingContext2D, cx: number, cy: number, rangeNm: number, pxPerNm: number) {
  const ringStepNm = rangeNm / RING_COUNT
  ctx.font = '10px monospace'
  for (let k = 1; k <= RING_COUNT; k++) {
    const ringNm = ringStepNm * k
    const r = ringNm * pxPerNm
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(180,195,220,0.4)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = 'rgba(226,232,240,0.85)'
    ctx.fillText(`${formatNm(ringNm)}`, cx + 4, cy - r + 11)
  }
}

function drawBearingRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, radiusPx: number, rotationDeg: number) {
  ctx.beginPath()
  ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(226,232,240,0.7)'
  ctx.lineWidth = 1.25
  ctx.stroke()

  for (let brg = 0; brg < 360; brg += 5) {
    const angle = screenAngleRad(brg, rotationDeg)
    const major = brg % 30 === 0
    const tickLen = major ? 8 : 4
    const [x1, y1] = polarPoint(cx, cy, radiusPx, angle)
    const [x2, y2] = polarPoint(cx, cy, radiusPx - tickLen, angle)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.strokeStyle = major ? 'rgba(241,245,249,0.95)' : 'rgba(180,195,220,0.6)'
    ctx.lineWidth = major ? 1.75 : 1
    ctx.stroke()
    if (major) {
      const [lx, ly] = polarPoint(cx, cy, radiusPx + 12, angle)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (brg === 0) {
        ctx.font = 'bold 12px Inter, sans-serif'
        ctx.fillStyle = '#5BC0BE'
        ctx.fillText('N', lx, ly)
      } else {
        ctx.font = 'bold 10px monospace'
        ctx.fillStyle = '#f1f5f9'
        ctx.fillText(String(brg).padStart(3, '0'), lx, ly)
      }
    }
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

function drawArrowhead(ctx: CanvasRenderingContext2D, tipX: number, tipY: number, angleRad: number, size: number, color: string) {
  const [x1, y1] = polarPoint(tipX, tipY, size, angleRad + Math.PI - 0.35)
  const [x2, y2] = polarPoint(tipX, tipY, size, angleRad + Math.PI + 0.35)
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function drawOwnShip(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  headingDeg: number,
  rotationDeg: number,
  speedKn: number,
  vectorMinutes: number,
  bearingRingRadiusPx: number,
  pxPerNm: number,
) {
  ctx.beginPath()
  ctx.arc(ox, oy, 4, 0, Math.PI * 2)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.75
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(ox, oy, 7.5, 0, Math.PI * 2)
  ctx.stroke()

  const headingAngle = screenAngleRad(headingDeg, rotationDeg)
  const [hx, hy] = polarPoint(ox, oy, bearingRingRadiusPx, headingAngle)
  ctx.beginPath()
  ctx.moveTo(ox, oy)
  ctx.lineTo(hx, hy)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.stroke()

  // Ground-stabilised course/speed vector — dashed, two arrowheads. This simulation sets course
  // over ground equal to heading (no leeway/drift modelled), so the vector shares the heading
  // line's direction and is distinguished by dash pattern, weight and the double arrowhead alone.
  const vectorNm = speedKn * (vectorMinutes / 60)
  const vectorPx = Math.min(vectorNm * pxPerNm, bearingRingRadiusPx * 0.95)
  const [vx, vy] = polarPoint(ox, oy, vectorPx, headingAngle)
  ctx.save()
  ctx.setLineDash([3, 6])
  ctx.lineWidth = 2
  ctx.strokeStyle = '#5BC0BE'
  ctx.beginPath()
  ctx.moveTo(ox, oy)
  ctx.lineTo(vx, vy)
  ctx.stroke()
  ctx.restore()
  if (vectorPx > 8) {
    drawArrowhead(ctx, vx, vy, headingAngle, 6, '#5BC0BE')
    const [mx, my] = polarPoint(ox, oy, vectorPx * 0.65, headingAngle)
    drawArrowhead(ctx, mx, my, headingAngle, 5, '#5BC0BE')
  }
}

/** Isosceles acute-angled triangle centred on the target's true position (half its height forward, half behind). */
function drawTargetTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, headingDeg: number, rotationDeg: number, size: number, color: string, filled: boolean, lineWidth: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(((headingDeg - rotationDeg) * Math.PI) / 180)
  ctx.beginPath()
  ctx.moveTo(0, -size)
  ctx.lineTo(-size * 0.55, size * 0.6)
  ctx.lineTo(size * 0.55, size * 0.6)
  ctx.closePath()
  if (filled) {
    ctx.fillStyle = color
    ctx.fill()
  }
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.stroke()
  ctx.restore()
}

function drawCornerBrackets(ctx: CanvasRenderingContext2D, cx: number, cy: number, half: number) {
  const len = half * 0.5
  ctx.strokeStyle = '#f8fafc'
  ctx.lineWidth = 1.5
  const corners: [number, number, number, number][] = [
    [-half, -half, 1, 1],
    [half, -half, -1, 1],
    [-half, half, 1, -1],
    [half, half, -1, -1],
  ]
  for (const [dx, dy, sx, sy] of corners) {
    ctx.beginPath()
    ctx.moveTo(cx + dx, cy + dy + len * sy)
    ctx.lineTo(cx + dx, cy + dy)
    ctx.lineTo(cx + dx + len * sx, cy + dy)
    ctx.stroke()
  }
}

function drawWindIndicator(ctx: CanvasRenderingContext2D, W: number, windSpeedKn: number, windDirectionDeg: number) {
  const cx = W - 46
  const cy = 58
  ctx.fillStyle = 'rgba(11,19,43,0.6)'
  ctx.fillRect(cx - 32, cy - 30, 64, 82)
  ctx.beginPath()
  ctx.arc(cx, cy, 22, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(180,195,220,0.4)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((windDirectionDeg * Math.PI) / 180)
  ctx.beginPath()
  ctx.moveTo(0, 14)
  ctx.lineTo(0, -12)
  ctx.strokeStyle = '#5BC0BE'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-5, -5)
  ctx.lineTo(0, -14)
  ctx.lineTo(5, -5)
  ctx.strokeStyle = '#5BC0BE'
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.restore()
  ctx.textAlign = 'center'
  ctx.font = 'bold 9px monospace'
  ctx.fillStyle = '#e2e8f0'
  ctx.fillText('WIND', cx, cy + 34)
  ctx.font = '9px monospace'
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText(`${windSpeedKn.toFixed(0)} KN ${windDirectionDeg.toFixed(0).padStart(3, '0')}T`, cx, cy + 46)
  ctx.textAlign = 'left'
}

/** Ground-referenced trail: each historical position projected via the current (possibly
 * anchor-based) projection, so it traces the target's actual track over the ground. */
function drawTrueTrail(ctx: CanvasRenderingContext2D, samples: { tMs: number; pos: GeoPosition }[], project: (p: GeoPosition) => [number, number], nowMs: number, maxAgeMs: number, color: string) {
  if (samples.length < 2) return
  for (let i = 1; i < samples.length; i++) {
    const s0 = samples[i - 1]!
    const s1 = samples[i]!
    const age = nowMs - s1.tMs
    if (age > maxAgeMs) continue
    const alpha = 0.5 * (1 - age / maxAgeMs)
    const [x1, y1] = project(s0.pos)
    const [x2, y2] = project(s1.pos)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.strokeStyle = withAlpha(color, alpha)
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

/** Relative trail: each historical sample is the target's position relative to where own ship
 * WAS at that same moment, plotted from own ship's current (always-central) position — the
 * classic radar relative-motion line, not a ground track. */
function drawRelativeTrail(ctx: CanvasRenderingContext2D, samples: TrailSample[], projectFrom: (center: GeoPosition, p: GeoPosition) => [number, number], nowMs: number, maxAgeMs: number, color: string) {
  if (samples.length < 2) return
  for (let i = 1; i < samples.length; i++) {
    const s0 = samples[i - 1]!
    const s1 = samples[i]!
    const age = nowMs - s1.tMs
    if (age > maxAgeMs) continue
    const alpha = 0.5 * (1 - age / maxAgeMs)
    const [x1, y1] = projectFrom(s0.ownPos, s0.targetPos)
    const [x2, y2] = projectFrom(s1.ownPos, s1.targetPos)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.strokeStyle = withAlpha(color, alpha)
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

function withAlpha(hexColor: string, alpha: number): string {
  const clamped = clamp01(alpha)
  const alphaHex = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hexColor}${alphaHex}`
}

interface TargetDetail {
  rangeNm: number
  bearingDeg: number
  aspect: string
}

function describeTargetDetail(own: GeoPosition, target: TargetVessel): TargetDetail {
  const rangeNm = haversineNm(own, target.position)
  const brg = bearingDeg(own, target.position)
  const bearingFromTarget = bearingDeg(target.position, own)
  const relBearing = ((bearingFromTarget - target.heading + 540) % 360) - 180
  return { rangeNm, bearingDeg: brg, aspect: describeAspect(relBearing) }
}

function interpolateEntity(anim: AnimatedEntity, nowMs: number): { lat: number; lon: number; heading: number } {
  const t = clamp01((nowMs - anim.updatedAtMs) / TRANSITION_MS)
  const eased = easeOutQuad(t)
  return {
    lat: anim.fromLat + (anim.toLat - anim.fromLat) * eased,
    lon: anim.fromLon + (anim.toLon - anim.fromLon) * eased,
    heading: (anim.fromHeading + angleDelta(anim.fromHeading, anim.toHeading) * eased + 360) % 360,
  }
}
