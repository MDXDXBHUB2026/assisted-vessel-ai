import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { GeoPosition, TargetVessel } from '@/types'
import { bearingDeg, haversineNm } from '@/utils/geo'
import { classifyTargetRisk, type TargetRiskLevel } from '@ave/decision-engine/targetRisk'
import { useSimulationStore } from '@/store/simulationStore'
import { useInterpolatedHeading } from '@/hooks/useInterpolatedHeading'
import { useInterpolatedNumber } from '@/hooks/useInterpolatedNumber'
import {
  RANGE_SCALES_NM,
  RING_COUNT,
  TRAIL_OPTIONS,
  VECTOR_MINUTE_OPTIONS,
  clampIndex,
  computeAutoRangeNm,
  type NavMotionMode,
  type NavOrientation,
  type TrailKey,
  type VectorMinutes,
} from './NavigationCanvas'

// ---------------------------------------------------------------------------
// Pure geometry — no layout or DOM dependency, unit-tested in NavigationRing.test.ts.
// Fixed viewBox with CSS scaling: every function below works in these user-space units
// regardless of the rendered pixel size, so the maths is resolution-independent.
// ---------------------------------------------------------------------------

export const VIEW_BOX_WIDTH = 400
export const VIEW_BOX_HEIGHT = 300
/** Matches NavigationCanvas's bearingRingRadiusPx fraction, so the SVG ring and the canvas
 * target field agree on where the bearing ring sits when both fill the same aspect-[4/3] box. */
const BEARING_RING_RADIUS_FRACTION = 0.9
/** Matches NavigationCanvas's pxPerNm formula exactly (bearingRingRadiusPx * 0.88 / rangeNm). */
const PLOT_FILL_FRACTION = 0.88
const TRUE_MOTION_RESET_FRACTION = 0.6

export function computeOrigin(viewBoxW: number = VIEW_BOX_WIDTH, viewBoxH: number = VIEW_BOX_HEIGHT): { originX: number; originY: number } {
  return { originX: viewBoxW / 2, originY: viewBoxH / 2 }
}

export function computeBearingRingRadiusPx(viewBoxW: number = VIEW_BOX_WIDTH, viewBoxH: number = VIEW_BOX_HEIGHT): number {
  const { originX, originY } = computeOrigin(viewBoxW, viewBoxH)
  return Math.min(originX, viewBoxW - originX, originY, viewBoxH - originY) * BEARING_RING_RADIUS_FRACTION
}

/**
 * The bearing ring's rotation. North Up is pinned at 0 — it never spins decoratively; a mariner
 * reads bearings off it, so rotating it for "liveness" would make it a lie. Course Up rotates only
 * because own-ship heading actually changes, tracking the vessel's real course, not a synthetic
 * animation. (Head Up is not offered as a separate mode: in this simulation COG always equals
 * heading, so a Head-Up mode would be visually identical to Course Up and only add a confusing
 * duplicate control — MSC.192(79) lists it as optional ("may be provided"), not required.)
 */
export function orientationRotationDeg(orientation: NavOrientation, ownHeadingDeg: number): number {
  return orientation === 'north_up' ? 0 : -ownHeadingDeg
}

export function pxPerNm(bearingRingRadiusPx: number, rangeNm: number): number {
  return (bearingRingRadiusPx * PLOT_FILL_FRACTION) / rangeNm
}

/** Flat-earth nm-grid projection, identical to NavigationCanvas's `projectFrom`, so the SVG chrome
 * and the composed canvas's target field agree pixel-for-pixel given the same controlled state. */
export function project(center: GeoPosition, p: GeoPosition, originX: number, originY: number, rotationDeg: number, pxPerNmValue: number): [number, number] {
  const dLatNm = (p.latitude - center.latitude) * 60
  const dLonNm = (p.longitude - center.longitude) * 60 * Math.cos((center.latitude * Math.PI) / 180)
  const rot = (rotationDeg * Math.PI) / 180
  const rx = dLonNm * Math.cos(rot) - dLatNm * Math.sin(rot)
  const ry = dLonNm * Math.sin(rot) + dLatNm * Math.cos(rot)
  return [originX + rx * pxPerNmValue, originY - ry * pxPerNmValue]
}

export function vectorLengthPx(speedKn: number, vectorMinutes: number, pxPerNmValue: number, maxPx: number): number {
  return Math.min(speedKn * (vectorMinutes / 60) * pxPerNmValue, maxPx)
}

/** Four rings at range/4 (3, 6, 9, 12 on a 12 NM scale), each labelled with its own range. */
export function ringRangesNm(rangeNm: number, ringCount: number = RING_COUNT): number[] {
  const step = rangeNm / ringCount
  return Array.from({ length: ringCount }, (_, i) => step * (i + 1))
}

export interface LabelBox {
  x: number
  y: number
  w: number
  h: number
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** DOM-free width estimate for a monospace-ish label string, so `placeLabel` needs no canvas
 * context or measured text — just a character count. */
export function estimateLabelWidthPx(text: string, charWidthPx = 5.6, paddingPx = 8): number {
  return text.length * charWidthPx + paddingPx
}

/**
 * De-conflicts a label against already-placed boxes by trying fixed candidate offsets (NE, NW,
 * SE, SW, then further out) in a deterministic order, taking the first that does not overlap.
 * Falls back to the first offset if every candidate collides, so placement is always defined.
 */
export function placeLabel(anchorX: number, anchorY: number, widthPx: number, heightPx: number, avoid: readonly LabelBox[]): LabelBox {
  const offsets: [number, number][] = [
    [8, -8 - heightPx],
    [-8 - widthPx, -8 - heightPx],
    [8, 8],
    [-8 - widthPx, 8],
    [18, -18 - heightPx],
    [-18 - widthPx, -18 - heightPx],
    [18, 18],
    [-18 - widthPx, 18],
  ]
  for (const [dx, dy] of offsets) {
    const box = { x: anchorX + dx, y: anchorY + dy, w: widthPx, h: heightPx }
    if (!avoid.some((b) => boxesOverlap(box, b))) return box
  }
  const [dx, dy] = offsets[0]!
  return { x: anchorX + dx, y: anchorY + dy, w: widthPx, h: heightPx }
}

function polarPoint(cx: number, cy: number, radiusPx: number, angleRad: number): [number, number] {
  return [cx + radiusPx * Math.sin(angleRad), cy - radiusPx * Math.cos(angleRad)]
}

function screenAngleRad(trueBearingDeg: number, rotationDeg: number): number {
  return ((trueBearingDeg - rotationDeg) * Math.PI) / 180
}

function formatNm(nm: number): string {
  return nm < 10 ? nm.toFixed(2) : nm.toFixed(1)
}

interface BearingTick {
  bearingDeg: number
  major: boolean
  x1: number
  y1: number
  x2: number
  y2: number
  labelX: number
  labelY: number
  labelText: string
}

/** Ticks every 5°, numerals every 30°. Positions are in the OUTER (rotated) group's local space —
 * the caller wraps them in `<g transform="rotate(rotationDeg)">` and counter-rotates each numeral
 * individually so the glyphs stay upright regardless of the ring's current rotation. */
function bearingTicks(radiusPx: number): BearingTick[] {
  const ticks: BearingTick[] = []
  for (let brg = 0; brg < 360; brg += 5) {
    const major = brg % 30 === 0
    const angle = screenAngleRad(brg, 0)
    const tickLen = major ? 8 : 4
    const [x1, y1] = polarPoint(0, 0, radiusPx, angle)
    const [x2, y2] = polarPoint(0, 0, radiusPx - tickLen, angle)
    const [labelX, labelY] = polarPoint(0, 0, radiusPx + 13, angle)
    ticks.push({ bearingDeg: brg, major, x1, y1, x2, y2, labelX, labelY, labelText: brg === 0 ? 'N' : String(brg).padStart(3, '0') })
  }
  return ticks
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface NavigationRingCanvasBridge {
  showChrome: false
  orientation: NavOrientation
  onOrientationChange: (v: NavOrientation) => void
  motionMode: NavMotionMode
  onMotionModeChange: (v: NavMotionMode) => void
  autoRange: boolean
  onAutoRangeChange: (v: boolean) => void
  manualRangeIndex: number
  onManualRangeIndexChange: (v: number) => void
  vectorMinutes: VectorMinutes
  onVectorMinutesChange: (v: VectorMinutes) => void
  trailKey: TrailKey
  onTrailKeyChange: (v: TrailKey) => void
  selectedTargetId: string | null
  onSelectedTargetIdChange: (v: string | null) => void
  acknowledgedTargetIds: ReadonlySet<string>
}

interface Props {
  own: GeoPosition
  ownHeadingDeg: number
  ownSpeedKn: number
  targets: TargetVessel[]
  /** Standalone mode: NavigationRing draws the target field itself in SVG (triangles, vectors,
   * sleeping/activated distinction). Composed mode (`false`): a canvas child owns the full target
   * field at 60fps and this component draws only the label/selection/dangerous decoration layer
   * for dangerous, caution and selected targets, so the two never draw duplicate full symbols. */
  renderTargets?: boolean
  /** Composed usage: a render-prop child that receives the controlled state bridge so the caller's
   * <NavigationCanvas renderTargets .../> (via `showChrome={false}` on that component) stays in
   * lockstep with this ring's orientation/motion/range/vector/trail/selection state. */
  children?: (bridge: NavigationRingCanvasBridge) => ReactNode
}

const CPA_LIMIT_STEP_NM = 0.25
const CPA_LIMIT_MIN_NM = 0.25
const CPA_LIMIT_MAX_NM = 5
const TCPA_LIMIT_STEP_MIN = 5
const TCPA_LIMIT_MIN_MIN = 5
const TCPA_LIMIT_MAX_MIN = 60

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function NavigationRing({ own, ownHeadingDeg, ownSpeedKn, targets, renderTargets = true, children }: Props) {
  const { cpaLimitNm, tcpaLimitMinutes } = useSimulationStore((s) => s.targetRiskLimits)
  const setTargetRiskLimits = useSimulationStore((s) => s.setTargetRiskLimits)
  const logAudit = useSimulationStore((s) => s.logAudit)

  const [orientation, setOrientation] = useState<NavOrientation>('north_up')
  // True Motion is the landing default (docs/navigation-display-specification.md §3): it is the
  // mode that shows the vessel is actually under way.
  const [motionMode, setMotionMode] = useState<NavMotionMode>('true')
  const [autoRange, setAutoRange] = useState(true)
  const [manualRangeIndex, setManualRangeIndex] = useState(RANGE_SCALES_NM.indexOf(6))
  const [vectorMinutes, setVectorMinutes] = useState<VectorMinutes>(6)
  const [trailKey, setTrailKey] = useState<TrailKey>('3m')
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [acknowledgedTargetIds, setAcknowledgedTargetIds] = useState<Set<string>>(new Set())
  const autoRangeIndexRef = useRef(RANGE_SCALES_NM.indexOf(6))
  const trueMotionAnchorRef = useRef<GeoPosition | null>(null)

  const smoothHeadingDeg = useInterpolatedHeading(ownHeadingDeg)
  const smoothSpeedKn = useInterpolatedNumber(ownSpeedKn)

  const riskById = useMemo(() => {
    const limits = { cpaLimitNm, tcpaLimitMinutes }
    return new Map<string, TargetRiskLevel>(targets.map((t) => [t.id, classifyTargetRisk(t.cpaNm, t.tcpaMinutes, limits)]))
  }, [targets, cpaLimitNm, tcpaLimitMinutes])

  // A dangerous target that is no longer dangerous (passed, or limits changed) is no longer
  // "acknowledged" in any meaningful sense — drop it so a later, unrelated approach to the same
  // target starts from a clean flashing state rather than a stale acknowledgement.
  useEffect(() => {
    setAcknowledgedTargetIds((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const id of prev) {
        if ((riskById.get(id) ?? 'normal') !== 'dangerous') {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [riskById])

  const rangeNm = useMemo(() => (autoRange ? computeAutoRangeNm(own, ownHeadingDeg, ownSpeedKn, targets, riskById, vectorMinutes) : RANGE_SCALES_NM[clampIndex(manualRangeIndex)]!), [autoRange, own, ownHeadingDeg, ownSpeedKn, targets, riskById, vectorMinutes, manualRangeIndex])
  useEffect(() => {
    if (autoRange) autoRangeIndexRef.current = RANGE_SCALES_NM.indexOf(rangeNm)
  }, [autoRange, rangeNm])

  const { originX, originY } = computeOrigin()
  const bearingRingRadiusPx = computeBearingRingRadiusPx()
  const rotationDeg = orientationRotationDeg(orientation, smoothHeadingDeg)
  const pxPerNmValue = pxPerNm(bearingRingRadiusPx, rangeNm)

  // True Motion: own ship travels across the display from a fixed geographic anchor until it
  // nears TRUE_MOTION_RESET_FRACTION of the radius, then the anchor resets to own ship's current
  // position and the picture "resets", exactly mirroring NavigationCanvas's own anchor logic so
  // the SVG own-ship symbol and the composed canvas's own track agree on where own ship sits.
  if (motionMode === 'relative') {
    trueMotionAnchorRef.current = null
  } else if (!trueMotionAnchorRef.current) {
    trueMotionAnchorRef.current = own
  }
  const projectionCentre = motionMode === 'true' ? trueMotionAnchorRef.current! : own
  const project2 = (p: GeoPosition) => project(projectionCentre, p, originX, originY, rotationDeg, pxPerNmValue)
  let [ox, oy] = project2(own)
  if (motionMode === 'true') {
    const dispFromOrigin = Math.hypot(ox - originX, oy - originY)
    if (dispFromOrigin > bearingRingRadiusPx * TRUE_MOTION_RESET_FRACTION) {
      trueMotionAnchorRef.current = own
      ;[ox, oy] = project(own, own, originX, originY, rotationDeg, pxPerNmValue)
    }
  }

  const headingAngleRad = screenAngleRad(smoothHeadingDeg, rotationDeg)
  const ownVectorMaxPx = bearingRingRadiusPx * 0.95
  const ownVectorPx = vectorLengthPx(smoothSpeedKn, vectorMinutes, pxPerNmValue, ownVectorMaxPx)
  const [headingTipX, headingTipY] = polarPoint(ox, oy, bearingRingRadiusPx, headingAngleRad)

  const selectedTarget = targets.find((t) => t.id === selectedTargetId) ?? null
  const trailLabel = TRAIL_OPTIONS.find((o) => o.key === trailKey)!.label

  const acknowledgeSelected = () => {
    if (!selectedTarget) return
    setAcknowledgedTargetIds((prev) => new Set(prev).add(selectedTarget.id))
    logAudit(
      `Dangerous target ${selectedTarget.label} acknowledged by operator (CPA ${formatNm(selectedTarget.cpaNm)} nm, TCPA ${Number.isFinite(selectedTarget.tcpaMinutes) ? `${selectedTarget.tcpaMinutes.toFixed(0)} min` : 'n/a'}; limits in effect: ${cpaLimitNm.toFixed(2)} nm / ${tcpaLimitMinutes} min).`,
      'human_decision',
    )
  }

  const stepRange = (dir: 1 | -1) => {
    const base = autoRange ? autoRangeIndexRef.current : manualRangeIndex
    setAutoRange(false)
    setManualRangeIndex(clampIndex(base + dir))
  }

  const bridge: NavigationRingCanvasBridge = {
    showChrome: false,
    orientation,
    onOrientationChange: setOrientation,
    motionMode,
    onMotionModeChange: setMotionMode,
    autoRange,
    onAutoRangeChange: setAutoRange,
    manualRangeIndex,
    onManualRangeIndexChange: setManualRangeIndex,
    vectorMinutes,
    onVectorMinutesChange: setVectorMinutes,
    trailKey,
    onTrailKeyChange: setTrailKey,
    selectedTargetId,
    onSelectedTargetIdChange: setSelectedTargetId,
    acknowledgedTargetIds,
  }

  const ringRanges = ringRangesNm(rangeNm)
  const ticks = useMemo(() => bearingTicks(bearingRingRadiusPx), [bearingRingRadiusPx])

  // Label/selection decoration layer: dangerous, caution and selected targets only (never
  // overprinting own ship), de-conflicted by placeLabel's deterministic candidate-offset search.
  const decorations = useMemo(() => {
    const placed: LabelBox[] = [{ x: ox + 8, y: oy - 20, w: estimateLabelWidthPx('OWN SHIP'), h: 14 }]
    const items: { target: TargetVessel; risk: TargetRiskLevel; tx: number; ty: number; box: LabelBox | null; labelText: string }[] = []
    const ranked = [...targets].sort((a, b) => {
      const rank = (id: string) => (id === selectedTargetId ? 0 : riskById.get(id) === 'dangerous' ? 1 : riskById.get(id) === 'caution' ? 2 : 3)
      return rank(a.id) - rank(b.id)
    })
    for (const t of ranked) {
      const risk = riskById.get(t.id) ?? 'normal'
      const isSelected = t.id === selectedTargetId
      const [tx, ty] = project2(t.position)
      const shouldLabel = risk !== 'normal' || isSelected
      let box: LabelBox | null = null
      if (shouldLabel) {
        const labelText = `${t.label.replace('Synthetic Target ', '').toUpperCase()} ${formatNm(t.cpaNm)}`
        box = placeLabel(tx, ty, estimateLabelWidthPx(labelText), 14, placed)
        placed.push(box)
        items.push({ target: t, risk, tx, ty, box, labelText })
      } else {
        items.push({ target: t, risk, tx, ty, box: null, labelText: '' })
      }
    }
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, riskById, selectedTargetId, ox, oy, projectionCentre, originX, originY, rotationDeg, pxPerNmValue])

  return (
    <div className="flex flex-col gap-2">
      <ControlStrip
        orientation={orientation}
        setOrientation={setOrientation}
        motionMode={motionMode}
        setMotionMode={setMotionMode}
        autoRange={autoRange}
        onStepRange={stepRange}
        onAuto={() => setAutoRange(true)}
        vectorMinutes={vectorMinutes}
        setVectorMinutes={setVectorMinutes}
        trailKey={trailKey}
        setTrailKey={setTrailKey}
        cpaLimitNm={cpaLimitNm}
        tcpaLimitMinutes={tcpaLimitMinutes}
        onCpaLimitChange={(v) => setTargetRiskLimits({ cpaLimitNm: v, tcpaLimitMinutes })}
        onTcpaLimitChange={(v) => setTargetRiskLimits({ cpaLimitNm, tcpaLimitMinutes: v })}
      />

      <div className="flex gap-2">
        <div className="relative aspect-[4/3] flex-1 overflow-hidden rounded-sm border border-panel-border bg-hull-950" data-testid="navigation-ring" data-range-nm={rangeNm.toFixed(2)} data-orientation={orientation} data-motion-mode={motionMode}>
          {!renderTargets && children && <div className="absolute inset-0">{children(bridge)}</div>}

          <svg viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`} className="pointer-events-none absolute inset-0 h-full w-full" data-testid="navigation-ring-svg" aria-hidden={false} role="img" aria-label="Navigation operating picture">
            <SweepArc originX={originX} originY={originY} radiusPx={bearingRingRadiusPx * 1.07} />

            <RangeRings originX={originX} originY={originY} ranges={ringRanges} pxPerNmValue={pxPerNmValue} />

            <BearingRingSvg originX={originX} originY={originY} radiusPx={bearingRingRadiusPx} rotationDeg={rotationDeg} ticks={ticks} />

            <SafetyDomain cx={ox} cy={oy} radiusPx={0.5 * pxPerNmValue} />

            {renderTargets && (
              <g data-testid="navigation-ring-targets">
                {decorations.map(({ target, risk, tx, ty }) => (
                  <TargetSymbol key={target.id} target={target} risk={risk} tx={tx} ty={ty} rotationDeg={rotationDeg} pxPerNmValue={pxPerNmValue} vectorMinutes={vectorMinutes} bearingRingRadiusPx={bearingRingRadiusPx} isSelected={target.id === selectedTargetId} acknowledged={acknowledgedTargetIds.has(target.id)} />
                ))}
              </g>
            )}

            {/* Always rendered regardless of renderTargets, so selection/risk state is queryable
                (data-testid, data-selected, data-tx/data-ty in viewBox units) even in composed
                mode, where the full triangle/vector symbol itself is drawn by the canvas child. */}
            <g data-testid="navigation-ring-decorations">
              {decorations.map(({ target, risk, tx, ty, box, labelText }) => {
                const isSelected = target.id === selectedTargetId
                return (
                  <g key={target.id} data-testid={`target-decoration-${target.id}`} data-target-id={target.id} data-risk={risk} data-selected={isSelected} data-tx={tx.toFixed(2)} data-ty={ty.toFixed(2)}>
                    {isSelected && <CornerSquare cx={tx} cy={ty} half={renderTargets ? 20 : 16} />}
                    {box && (
                      <text x={box.x + 3} y={box.y + box.h - 3} fontSize={9} fontFamily="var(--font-mono)" fontWeight="bold" fill={risk === 'dangerous' ? 'var(--color-critical-400)' : risk === 'caution' ? 'var(--color-warning-400)' : 'var(--color-ink-100)'}>
                        {labelText}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>

            <OwnShipSymbol ox={ox} oy={oy} headingTipX={headingTipX} headingTipY={headingTipY} headingAngleRad={headingAngleRad} vectorPx={ownVectorPx} maxVectorPx={ownVectorMaxPx} />
          </svg>
        </div>

        <SidePanel
          rangeNm={rangeNm}
          autoRange={autoRange}
          motionMode={motionMode}
          orientation={orientation}
          vectorMinutes={vectorMinutes}
          trailLabel={trailLabel}
          cpaLimitNm={cpaLimitNm}
          tcpaLimitMinutes={tcpaLimitMinutes}
          own={own}
          selectedTarget={selectedTarget}
          selectedRisk={selectedTarget ? (riskById.get(selectedTarget.id) ?? 'normal') : 'normal'}
          onClearSelection={() => setSelectedTargetId(null)}
          onAcknowledge={acknowledgeSelected}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chrome sub-components
// ---------------------------------------------------------------------------

function SweepArc({ originX, originY, radiusPx }: { originX: number; originY: number; radiusPx: number }) {
  const sweepDeg = 26
  const startRad = (-sweepDeg / 2 * Math.PI) / 180
  const endRad = (sweepDeg / 2 * Math.PI) / 180
  const [x1, y1] = polarPoint(0, 0, radiusPx, startRad)
  const [x2, y2] = polarPoint(0, 0, radiusPx, endRad)
  const largeArc = sweepDeg > 180 ? 1 : 0
  const d = `M ${x1} ${y1} A ${radiusPx} ${radiusPx} 0 ${largeArc} 1 ${x2} ${y2}`
  return (
    // A CSS animation targeting `transform` fully replaces any transform set on the SAME element
    // (it does not compose with a static translate) — hence the outer group carries only the
    // static translate to the plot origin, and the inner group carries only the spin animation,
    // rotating around its own local (0,0), which the outer translate has already placed at
    // (originX, originY).
    <g data-testid="nav-sweep-arc" transform={`translate(${originX} ${originY})`}>
      <g className="motion-safe:animate-spin motion-reduce:hidden" style={{ transformOrigin: '0px 0px', animationDuration: '4000ms', animationTimingFunction: 'linear' }}>
        {/* Purely a data-feed liveness cue, drawn OUTSIDE the bearing ring — it carries no bearing
            meaning whatsoever and must never be read as one (correction #1). */}
        <path d={d} fill="none" stroke="var(--color-info-400)" strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" />
      </g>
    </g>
  )
}

function RangeRings({ originX, originY, ranges, pxPerNmValue }: { originX: number; originY: number; ranges: number[]; pxPerNmValue: number }) {
  return (
    <g data-testid="navigation-ring-rings">
      {ranges.map((ringNm) => (
        <g key={ringNm}>
          {/* Range rings are the distance reference — they transition radius only on an actual
              range change (as a confirmation cue), never a continuous pulse (correction #2). */}
          <circle cx={originX} cy={originY} r={ringNm * pxPerNmValue} fill="none" stroke="var(--color-ink-500)" strokeOpacity={0.45} strokeWidth={1} className="transition-[r] duration-700 ease-out motion-reduce:transition-none" data-testid="navigation-ring-range-ring" data-ring-nm={ringNm.toFixed(2)} />
          <text x={originX + 4} y={originY - ringNm * pxPerNmValue + 10} fontSize={8} fontFamily="var(--font-mono)" fill="var(--color-ink-100)" className="tabular-nums">
            {formatNm(ringNm)}
          </text>
        </g>
      ))}
    </g>
  )
}

function BearingRingSvg({ originX, originY, radiusPx, rotationDeg, ticks }: { originX: number; originY: number; radiusPx: number; rotationDeg: number; ticks: BearingTick[] }) {
  return (
    // The whole ring rotates as one rigid disk with orientation/heading (never decoratively) —
    // correction #1. Each numeral is counter-rotated within its own nested group so the glyph
    // itself stays upright no matter how far the ring has turned.
    <g transform={`translate(${originX} ${originY}) rotate(${rotationDeg})`} data-testid="navigation-bearing-ring">
      <circle cx={0} cy={0} r={radiusPx} fill="none" stroke="var(--color-ink-100)" strokeOpacity={0.75} strokeWidth={1.25} />
      {ticks.map((t) => (
        <g key={t.bearingDeg}>
          <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.major ? 'var(--color-ink-000)' : 'var(--color-ink-500)'} strokeOpacity={t.major ? 0.95 : 0.6} strokeWidth={t.major ? 1.75 : 1} />
          {t.major && (
            <g transform={`translate(${t.labelX} ${t.labelY}) rotate(${-rotationDeg})`}>
              <text textAnchor="middle" dominantBaseline="middle" fontSize={t.bearingDeg === 0 ? 12 : 9} fontFamily="var(--font-mono)" fontWeight="bold" fill={t.bearingDeg === 0 ? 'var(--color-info-400)' : 'var(--color-ink-100)'}>
                {t.labelText}
              </text>
            </g>
          )}
        </g>
      ))}
    </g>
  )
}

function SafetyDomain({ cx, cy, radiusPx }: { cx: number; cy: number; radiusPx: number }) {
  const gradientId = 'nav-ring-safety-domain-gradient'
  return (
    <g data-testid="navigation-safety-domain">
      <defs>
        {/* A semi-transparent radial gradient fill conveys proximity legitimately — unlike glow or
            bloom, it does not blur the exact radius the operator is judging distance against
            (correction #3). */}
        <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-warning-500)" stopOpacity={0.28} />
          <stop offset="75%" stopColor="var(--color-warning-500)" stopOpacity={0.1} />
          <stop offset="100%" stopColor="var(--color-warning-500)" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={radiusPx} fill={`url(#${gradientId})`} />
      <circle cx={cx} cy={cy} r={radiusPx} fill="none" stroke="var(--color-warning-400)" strokeOpacity={0.6} strokeWidth={1} strokeDasharray="3 3" />
    </g>
  )
}

function OwnShipSymbol({ ox, oy, headingTipX, headingTipY, headingAngleRad, vectorPx, maxVectorPx }: { ox: number; oy: number; headingTipX: number; headingTipY: number; headingAngleRad: number; vectorPx: number; maxVectorPx: number }) {
  const angleDeg = (headingAngleRad * 180) / Math.PI
  const [vectorMaxTipX, vectorMaxTipY] = polarPoint(ox, oy, maxVectorPx, headingAngleRad)
  const [arrow1X, arrow1Y] = polarPoint(ox, oy, vectorPx, headingAngleRad)
  const [arrow2X, arrow2Y] = polarPoint(ox, oy, vectorPx * 0.65, headingAngleRad)

  return (
    <g data-testid="navigation-own-ship">
      {/* Double circle at the reference position, per SN.1/Circ.243. */}
      <circle cx={ox} cy={oy} r={3.5} fill="none" stroke="var(--color-ink-000)" strokeWidth={1.75} />
      <circle cx={ox} cy={oy} r={7} fill="none" stroke="var(--color-ink-000)" strokeWidth={1.75} />

      {/* Heading line: solid, thinner than the speed vector, drawn to the bearing ring. */}
      <line x1={ox} y1={oy} x2={headingTipX} y2={headingTipY} stroke="var(--color-ink-000)" strokeWidth={1} />

      {/* Course/speed vector: the line's own geometry (x1,y1 -> x2,y2) is FIXED at the maximum
          possible extent and never changes with vector time; only stroke-dasharray's dash length
          (normalised to pixel units via pathLength) carries the actual computed vectorPx. A CSS
          transition on stroke-dasharray then gives a fluid "look-ahead extending" motion with no
          geometry re-layout, and the rendered dash length remains exactly the computed value —
          deterministic, not decorative. Two arrowheads = ground stabilised (this sim sets COG
          equal to heading, so no leeway/drift is modelled). */}
      <line
        x1={ox}
        y1={oy}
        x2={vectorMaxTipX}
        y2={vectorMaxTipY}
        pathLength={maxVectorPx}
        stroke="var(--color-info-400)"
        strokeWidth={2}
        strokeDasharray={`${vectorPx} ${maxVectorPx}`}
        className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
        data-testid="own-speed-vector"
        data-vector-px={vectorPx.toFixed(2)}
      />
      <g className="transition-transform duration-700 ease-out motion-reduce:transition-none" style={{ transform: `translate(${arrow1X}px, ${arrow1Y}px) rotate(${angleDeg}deg)` }}>
        <polygon points="0,0 -3.6,6 3.6,6" fill="var(--color-info-400)" />
      </g>
      <g className="transition-transform duration-700 ease-out motion-reduce:transition-none" style={{ transform: `translate(${arrow2X}px, ${arrow2Y}px) rotate(${angleDeg}deg)` }}>
        <polygon points="0,0 -3,5 3,5" fill="var(--color-info-400)" />
      </g>
    </g>
  )
}

function CornerSquare({ cx, cy, half }: { cx: number; cy: number; half: number }) {
  const len = half * 0.55
  const corners: [number, number, number, number][] = [
    [-half, -half, 1, 1],
    [half, -half, -1, 1],
    [-half, half, 1, -1],
    [half, half, -1, -1],
  ]
  return (
    <g data-testid="target-corner-square">
      {corners.map(([dx, dy, sx, sy], i) => (
        <polyline key={i} points={`${cx + dx},${cy + dy + len * sy} ${cx + dx},${cy + dy} ${cx + dx + len * sx},${cy + dy}`} fill="none" stroke="var(--color-ink-000)" strokeWidth={1.5} />
      ))}
    </g>
  )
}

function TargetSymbol({
  target,
  risk,
  tx,
  ty,
  rotationDeg,
  pxPerNmValue,
  vectorMinutes,
  bearingRingRadiusPx,
  isSelected,
  acknowledged,
}: {
  target: TargetVessel
  risk: TargetRiskLevel
  tx: number
  ty: number
  rotationDeg: number
  pxPerNmValue: number
  vectorMinutes: number
  bearingRingRadiusPx: number
  isSelected: boolean
  acknowledged: boolean
}) {
  const showFull = target.activated || risk !== 'normal'
  const size = showFull ? 8 : 5
  const dangerous = risk === 'dangerous'
  const color = dangerous ? 'var(--color-critical-500)' : risk === 'caution' ? 'var(--color-warning-500)' : 'var(--color-ink-300)'
  const rotation = target.heading - rotationDeg
  const vectorPx = vectorLengthPx(target.speedKn, vectorMinutes, pxPerNmValue, bearingRingRadiusPx * 0.9)
  const headingLen = size * 2

  return (
    <g data-testid={`target-symbol-${target.id}`} data-target-id={target.id} data-risk={risk} data-selected={isSelected} className={dangerous && !acknowledged ? 'motion-safe:animate-pulse' : ''}>
      {showFull && (
        <>
          <line x1={tx} y1={ty} x2={tx + Math.sin((rotation * Math.PI) / 180) * headingLen} y2={ty - Math.cos((rotation * Math.PI) / 180) * headingLen} stroke={color} strokeWidth={1} />
          <line
            x1={tx}
            y1={ty}
            x2={tx + Math.sin((rotation * Math.PI) / 180) * vectorPx}
            y2={ty - Math.cos((rotation * Math.PI) / 180) * vectorPx}
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="2 4"
          />
        </>
      )}
      {/* Isosceles acute triangle, positioned at centre-half height. Dangerous targets are bold
          and filled (never colour alone); sleeping targets are smaller and unfilled — this holds
          in greyscale too, since it is weight/fill, not hue, that carries the distinction. */}
      <polygon
        points={`0,${-size} ${-size * 0.55},${size * 0.6} ${size * 0.55},${size * 0.6}`}
        transform={`translate(${tx} ${ty}) rotate(${rotation})`}
        fill={risk !== 'normal' ? color : 'none'}
        stroke={color}
        strokeWidth={dangerous ? 2.5 : risk === 'caution' ? 1.75 : 1.1}
      />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Controls & readout
// ---------------------------------------------------------------------------

function RingToggle({ active, onClick, testId, children }: { active: boolean; onClick: () => void; testId: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-state={active ? 'active' : 'inactive'}
      aria-pressed={active}
      aria-current={active ? 'true' : undefined}
      className={`relative rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tabular-nums ${active ? 'text-info-400' : 'text-ink-500 hover:text-ink-100'}`}
    >
      {children}
      {active && <span className="absolute inset-x-0.5 -bottom-px h-px bg-info-400" aria-hidden="true" />}
    </button>
  )
}

function ControlGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="mr-1 font-mono text-[9px] font-bold uppercase text-ink-500">{label}</span>
      {children}
    </div>
  )
}

function ControlStrip({
  orientation,
  setOrientation,
  motionMode,
  setMotionMode,
  autoRange,
  onStepRange,
  onAuto,
  vectorMinutes,
  setVectorMinutes,
  trailKey,
  setTrailKey,
  cpaLimitNm,
  tcpaLimitMinutes,
  onCpaLimitChange,
  onTcpaLimitChange,
}: {
  orientation: NavOrientation
  setOrientation: (v: NavOrientation) => void
  motionMode: NavMotionMode
  setMotionMode: (v: NavMotionMode) => void
  autoRange: boolean
  onStepRange: (dir: 1 | -1) => void
  onAuto: () => void
  vectorMinutes: VectorMinutes
  setVectorMinutes: (v: VectorMinutes) => void
  trailKey: TrailKey
  setTrailKey: (v: TrailKey) => void
  cpaLimitNm: number
  tcpaLimitMinutes: number
  onCpaLimitChange: (v: number) => void
  onTcpaLimitChange: (v: number) => void
}) {
  return (
    // One reserved control strip: it never overlaps the plot area or another control, and every
    // toggle carries the state attributes the e2e suite reads (data-state, aria-pressed,
    // aria-current), never CSS classes or colours.
    <div data-testid="navigation-control-strip" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-sm border border-hull-500/40 bg-hull-900/80 px-2 py-1.5 text-[9px]">
      <ControlGroup label="ORIENT">
        {(['north_up', 'course_up'] as NavOrientation[]).map((m) => (
          <RingToggle key={m} active={orientation === m} onClick={() => setOrientation(m)} testId={`nav-orientation-${m}`}>
            {m.replace('_', ' ')}
          </RingToggle>
        ))}
      </ControlGroup>
      <ControlGroup label="MOTION">
        {(['relative', 'true'] as NavMotionMode[]).map((m) => (
          <RingToggle key={m} active={motionMode === m} onClick={() => setMotionMode(m)} testId={`nav-motion-${m}`}>
            {m}
          </RingToggle>
        ))}
      </ControlGroup>
      <ControlGroup label="RANGE">
        <button type="button" data-testid="nav-range-dec" onClick={() => onStepRange(-1)} className="rounded px-1.5 py-0.5 font-mono font-bold text-ink-300 hover:text-ink-100">
          −
        </button>
        <RingToggle active={autoRange} onClick={onAuto} testId="nav-range-auto">
          auto
        </RingToggle>
        <button type="button" data-testid="nav-range-inc" onClick={() => onStepRange(1)} className="rounded px-1.5 py-0.5 font-mono font-bold text-ink-300 hover:text-ink-100">
          +
        </button>
      </ControlGroup>
      <ControlGroup label="VECTOR">
        {VECTOR_MINUTE_OPTIONS.map((m) => (
          <RingToggle key={m} active={vectorMinutes === m} onClick={() => setVectorMinutes(m)} testId={`nav-vector-${m}`}>
            {m}m
          </RingToggle>
        ))}
      </ControlGroup>
      <ControlGroup label="TRAIL">
        {TRAIL_OPTIONS.map((o) => (
          <RingToggle key={o.key} active={trailKey === o.key} onClick={() => setTrailKey(o.key)} testId={`nav-trail-${o.key}`}>
            {o.label}
          </RingToggle>
        ))}
      </ControlGroup>
      <ControlGroup label="CPA LIM">
        <button type="button" data-testid="nav-cpalimit-dec" onClick={() => onCpaLimitChange(clamp(cpaLimitNm - CPA_LIMIT_STEP_NM, CPA_LIMIT_MIN_NM, CPA_LIMIT_MAX_NM))} className="rounded px-1.5 py-0.5 font-mono font-bold text-ink-300 hover:text-ink-100">
          −
        </button>
        <span className="min-w-[2.5em] text-center font-mono font-bold tabular-nums text-info-400" data-testid="nav-cpalimit-value">
          {cpaLimitNm.toFixed(2)}
        </span>
        <button type="button" data-testid="nav-cpalimit-inc" onClick={() => onCpaLimitChange(clamp(cpaLimitNm + CPA_LIMIT_STEP_NM, CPA_LIMIT_MIN_NM, CPA_LIMIT_MAX_NM))} className="rounded px-1.5 py-0.5 font-mono font-bold text-ink-300 hover:text-ink-100">
          +
        </button>
      </ControlGroup>
      <ControlGroup label="TCPA LIM">
        <button type="button" data-testid="nav-tcpalimit-dec" onClick={() => onTcpaLimitChange(clamp(tcpaLimitMinutes - TCPA_LIMIT_STEP_MIN, TCPA_LIMIT_MIN_MIN, TCPA_LIMIT_MAX_MIN))} className="rounded px-1.5 py-0.5 font-mono font-bold text-ink-300 hover:text-ink-100">
          −
        </button>
        <span className="min-w-[2.5em] text-center font-mono font-bold tabular-nums text-info-400" data-testid="nav-tcpalimit-value">
          {tcpaLimitMinutes}
        </span>
        <button type="button" data-testid="nav-tcpalimit-inc" onClick={() => onTcpaLimitChange(clamp(tcpaLimitMinutes + TCPA_LIMIT_STEP_MIN, TCPA_LIMIT_MIN_MIN, TCPA_LIMIT_MAX_MIN))} className="rounded px-1.5 py-0.5 font-mono font-bold text-ink-300 hover:text-ink-100">
          +
        </button>
      </ControlGroup>
    </div>
  )
}

function describeAspect(relBearingDeg: number): string {
  const rounded = Math.round(Math.abs(relBearingDeg))
  if (rounded === 0) return '000 DEAD AHEAD'
  if (rounded === 180) return '180 DEAD ASTERN'
  return `${relBearingDeg > 0 ? 'GREEN' : 'RED'} ${String(rounded).padStart(3, '0')}`
}

function SidePanel({
  rangeNm,
  autoRange,
  motionMode,
  orientation,
  vectorMinutes,
  trailLabel,
  cpaLimitNm,
  tcpaLimitMinutes,
  own,
  selectedTarget,
  selectedRisk,
  onClearSelection,
  onAcknowledge,
}: {
  rangeNm: number
  autoRange: boolean
  motionMode: NavMotionMode
  orientation: NavOrientation
  vectorMinutes: VectorMinutes
  trailLabel: string
  cpaLimitNm: number
  tcpaLimitMinutes: number
  own: GeoPosition
  selectedTarget: TargetVessel | null
  selectedRisk: TargetRiskLevel
  onClearSelection: () => void
  onAcknowledge: () => void
}) {
  const rangeNmDisplay = rangeNm < 10 ? rangeNm.toFixed(2) : rangeNm.toFixed(1)
  const ringSpacingNm = rangeNm / RING_COUNT
  const detail = selectedTarget ? describeTargetDetail(own, selectedTarget) : null

  return (
    <div className="flex w-40 shrink-0 flex-col gap-2 text-[9px]">
      {/* Persistently displayed per MSC.192(79): range, ring spacing, motion mode, orientation,
          vector time, trail time, CPA/TCPA limits. */}
      <div className="rounded-sm border border-panel-border bg-hull-900/70 p-2 font-mono leading-relaxed text-ink-300" data-testid="navigation-readout">
        <div className="font-bold tabular-nums text-ink-100" data-testid="readout-range">
          RANGE {rangeNmDisplay} NM {autoRange ? '(AUTO)' : '(MANUAL)'}
        </div>
        <div className="tabular-nums" data-testid="readout-ring-spacing">
          RINGS {ringSpacingNm < 10 ? ringSpacingNm.toFixed(2) : ringSpacingNm.toFixed(1)} NM
        </div>
        <div className="mt-1 uppercase text-info-400" data-testid="readout-mode">
          {motionMode} · {orientation.replace('_', ' ')}
        </div>
        <div className="tabular-nums" data-testid="readout-vector">
          VECTOR {vectorMinutes} MIN
        </div>
        <div data-testid="readout-trail">TRAIL {trailLabel}</div>
        <div className="mt-1 tabular-nums" data-testid="readout-limits">
          CPA LIM {cpaLimitNm.toFixed(2)} NM
          <br />
          TCPA LIM {tcpaLimitMinutes} MIN
        </div>
      </div>

      {selectedTarget && detail ? (
        <div className="rounded-sm border border-panel-border bg-hull-900/90 p-2 font-mono" data-testid="navigation-selected-panel">
          <div className="mb-1 flex items-center justify-between border-b border-panel-border pb-1">
            <span className="font-bold uppercase text-ink-100">{selectedTarget.label.replace('Synthetic Target ', '')}</span>
            <button type="button" onClick={onClearSelection} className="text-ink-500 hover:text-ink-100">
              ×
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-x-1 gap-y-0.5 tabular-nums text-ink-300">
            <dt className="text-ink-500">Range</dt>
            <dd>{detail.rangeNm < 10 ? detail.rangeNm.toFixed(2) : detail.rangeNm.toFixed(1)} nm</dd>
            <dt className="text-ink-500">Bearing</dt>
            <dd>{detail.bearingDeg.toFixed(0).padStart(3, '0')}°</dd>
            <dt className="text-ink-500">COG</dt>
            <dd>{selectedTarget.heading.toFixed(0).padStart(3, '0')}°</dd>
            <dt className="text-ink-500">SOG</dt>
            <dd>{selectedTarget.speedKn.toFixed(1)} kn</dd>
            <dt className="text-ink-500">CPA</dt>
            <dd>{selectedTarget.cpaNm < 10 ? selectedTarget.cpaNm.toFixed(2) : selectedTarget.cpaNm.toFixed(1)} nm</dd>
            <dt className="text-ink-500">TCPA</dt>
            <dd>{Number.isFinite(selectedTarget.tcpaMinutes) ? `${selectedTarget.tcpaMinutes.toFixed(0)} min` : '—'}</dd>
            <dt className="col-span-2 text-ink-500">Aspect</dt>
            <dd className="col-span-2">{detail.aspect}</dd>
            <dt className="col-span-2 text-ink-500">AIS state</dt>
            <dd className="col-span-2">{selectedTarget.activated ? 'ACTIVATED' : 'SLEEPING'}</dd>
          </dl>
          {selectedRisk === 'dangerous' && (
            <button type="button" onClick={onAcknowledge} data-testid="nav-acknowledge-selected" className="mt-2 w-full rounded bg-critical-500 py-1 text-center font-bold uppercase text-hull-950 hover:bg-critical-400">
              Acknowledge
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-sm border border-panel-border bg-hull-900/50 p-2 font-mono text-ink-600">Click a target for range, bearing, COG/SOG, CPA/TCPA and aspect.</div>
      )}
    </div>
  )
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
