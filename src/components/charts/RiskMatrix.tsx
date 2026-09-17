import type { HazardRiskAssessment, HazardStatus } from '@/types'
import {
  FREQUENCY_INDEX_LABELS,
  FREQUENCY_INDEX_MAX,
  FREQUENCY_INDEX_MIN,
  RISK_BAND_THRESHOLDS,
  SEVERITY_INDEX_LABELS,
  SEVERITY_INDEX_MAX,
  SEVERITY_INDEX_MIN,
  isoRiskValues,
  markerShapeForBand,
  riskBand,
  type MarkerShape,
} from '@/decision-engine/riskMatrix'

const VIEW_W = 720
const VIEW_H = 430
const GRID_LEFT = 108
const GRID_RIGHT = 700
const GRID_TOP = 22
const GRID_BOTTOM = 350
const FI_COUNT = FREQUENCY_INDEX_MAX - FREQUENCY_INDEX_MIN + 1
const SI_COUNT = SEVERITY_INDEX_MAX - SEVERITY_INDEX_MIN + 1
const CELL_W = (GRID_RIGHT - GRID_LEFT) / FI_COUNT
const CELL_H = (GRID_BOTTOM - GRID_TOP) / SI_COUNT

function cellCenter(fi: number, si: number): [number, number] {
  const x = GRID_LEFT + (fi - FREQUENCY_INDEX_MIN + 0.5) * CELL_W
  const y = GRID_BOTTOM - (si - SEVERITY_INDEX_MIN + 0.5) * CELL_H
  return [x, y]
}

const BAND_FILL: Record<string, string> = {
  acceptable: 'var(--color-healthy-500)',
  alarp: 'var(--color-warning-500)',
  intolerable: 'var(--color-critical-500)',
}

const BAND_STROKE: Record<string, string> = {
  acceptable: 'var(--color-healthy-400)',
  alarp: 'var(--color-warning-400)',
  intolerable: 'var(--color-critical-400)',
}

function Marker({ shape, size, fill, stroke, strokeWidth = 2 }: { shape: MarkerShape; size: number; fill: string; stroke: string; strokeWidth?: number }) {
  if (shape === 'circle') return <circle r={size} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
  if (shape === 'diamond') return <polygon points={`0,${-size} ${size},0 0,${size} ${-size},0`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
  return <polygon points={`0,${-size} ${size * 0.95},${size * 0.75} ${-size * 0.95},${size * 0.75}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
}

export interface RiskMatrixHazard {
  id: string
  title: string
  initialRisk: HazardRiskAssessment
  residualRisk: HazardRiskAssessment
  status: HazardStatus
}

interface Props {
  hazards: RiskMatrixHazard[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/**
 * The IMO FSA 7 (FI) x 4 (SI) risk matrix, rendered as a quantified instrument per
 * docs/safety-intelligence-specification.md §3: iso-risk diagonals (equal-RI cells are collinear
 * because RI = FI + SI is additive over a logarithmic scale), a shaded/labelled ALARP band, every
 * open hazard plotted with an initial-to-residual arrow, cell occupancy counts, and marker shape
 * varying by band so risk band is never colour-only.
 */
export function RiskMatrix({ hazards, selectedId, onSelect }: Props) {
  const cells: { fi: number; si: number }[] = []
  for (let fi = FREQUENCY_INDEX_MIN; fi <= FREQUENCY_INDEX_MAX; fi++) {
    for (let si = SEVERITY_INDEX_MIN; si <= SEVERITY_INDEX_MAX; si++) cells.push({ fi, si })
  }

  // Deterministic small offset so hazards sharing a cell don't fully overlap, plus a corner
  // occupancy count (spec §3.7).
  const residualCellCounts = new Map<string, number>()
  for (const h of hazards) {
    const key = `${h.residualRisk.frequencyIndex}:${h.residualRisk.severityIndex}`
    residualCellCounts.set(key, (residualCellCounts.get(key) ?? 0) + 1)
  }
  const residualCellIndex = new Map<string, number>()
  function nextIndexInCell(fi: number, si: number): number {
    const key = `${fi}:${si}`
    const idx = residualCellIndex.get(key) ?? 0
    residualCellIndex.set(key, idx + 1)
    return idx
  }
  function jitter(index: number): [number, number] {
    const offsets: [number, number][] = [
      [0, 0],
      [-10, -8],
      [10, 8],
      [10, -8],
      [-10, 8],
      [-16, 0],
      [16, 0],
    ]
    return offsets[index % offsets.length]!
  }

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full" role="img" aria-label="FSA risk matrix" data-testid="risk-matrix">
      {/* Cell shading by band — colour reinforces but never carries the classification alone;
          every marker also prints its RI value and varies shape by band. */}
      {cells.map(({ fi, si }) => {
        const ri = fi + si
        const band = riskBand(ri)
        const [cx, cy] = cellCenter(fi, si)
        return (
          <rect
            key={`${fi}-${si}`}
            x={cx - CELL_W / 2}
            y={cy - CELL_H / 2}
            width={CELL_W}
            height={CELL_H}
            fill={BAND_FILL[band]}
            fillOpacity={band === 'acceptable' ? 0.04 : band === 'alarp' ? 0.1 : 0.14}
            stroke="var(--color-panel-border)"
            strokeWidth={1}
          />
        )
      })}

      {/* Iso-risk diagonals — the property that makes this an FSA instrument, not a heat map. */}
      {isoRiskValues().map((ri) => {
        const fiMin = Math.max(FREQUENCY_INDEX_MIN, ri - SEVERITY_INDEX_MAX)
        const fiMax = Math.min(FREQUENCY_INDEX_MAX, ri - SEVERITY_INDEX_MIN)
        const [x1, y1] = cellCenter(fiMin, ri - fiMin)
        const [x2, y2] = cellCenter(fiMax, ri - fiMax)
        const isPoint = fiMin === fiMax
        return (
          <g key={`ri-${ri}`}>
            {!isPoint && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-ink-500)" strokeOpacity={0.35} strokeDasharray="3 3" strokeWidth={1} />}
            <circle cx={isPoint ? x1 : x2} cy={isPoint ? y1 : y2} r={9} fill="var(--color-hull-900)" stroke="var(--color-ink-500)" strokeOpacity={0.6} strokeWidth={1} />
            <text x={isPoint ? x1 : x2} y={(isPoint ? y1 : y2) + 3} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fontWeight="bold" fill="var(--color-ink-300)">
              {ri}
            </text>
          </g>
        )
      })}

      {/* ALARP band label */}
      <text x={(GRID_LEFT + GRID_RIGHT) / 2} y={GRID_TOP + 14} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" fontWeight="bold" fill="var(--color-warning-400)" opacity={0.85}>
        ALARP — {RISK_BAND_THRESHOLDS.alarp.requiredResponse}
      </text>

      {/* Axes */}
      <text x={(GRID_LEFT + GRID_RIGHT) / 2} y={VIEW_H - 6} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" fontWeight="bold" fill="var(--color-ink-100)">
        Frequency Index (FI) — likelihood
      </text>
      {Array.from({ length: FI_COUNT }, (_, i) => FREQUENCY_INDEX_MIN + i).map((fi) => {
        const [cx] = cellCenter(fi, SEVERITY_INDEX_MIN)
        return (
          <text key={fi} x={cx} y={GRID_BOTTOM + 16} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fill="var(--color-ink-300)">
            {fi} {FREQUENCY_INDEX_LABELS[fi]?.split('–')[0]}
          </text>
        )
      })}

      <text x={16} y={(GRID_TOP + GRID_BOTTOM) / 2} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" fontWeight="bold" fill="var(--color-ink-100)" transform={`rotate(-90 16 ${(GRID_TOP + GRID_BOTTOM) / 2})`}>
        Severity Index (SI) — consequence
      </text>
      {Array.from({ length: SI_COUNT }, (_, i) => SEVERITY_INDEX_MIN + i).map((si) => {
        const [, cy] = cellCenter(FREQUENCY_INDEX_MIN, si)
        return (
          <text key={si} x={GRID_LEFT - 8} y={cy + 3} textAnchor="end" fontSize={9} fontFamily="var(--font-mono)" fill="var(--color-ink-300)">
            SI {si} — {SEVERITY_INDEX_LABELS[si]}
          </text>
        )
      })}

      {/* Cell occupancy counts */}
      {[...residualCellCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([key, count]) => {
          const [fi, si] = key.split(':').map(Number)
          const [cx, cy] = cellCenter(fi!, si!)
          return (
            <text key={key} x={cx + CELL_W / 2 - 6} y={cy - CELL_H / 2 + 12} textAnchor="end" fontSize={9} fontFamily="var(--font-mono)" fontWeight="bold" fill="var(--color-ink-500)">
              ×{count}
            </text>
          )
        })}

      {/* Hazard markers: initial (faint, only if it differs from residual) -> residual (solid),
          joined by an arrow — the arrow IS the value the mitigation bought. Keyed by hazard id
          (not by cell) so a risk change animates the marker moving, not a remount. */}
      {hazards.map((h) => {
        const idx = nextIndexInCell(h.residualRisk.frequencyIndex, h.residualRisk.severityIndex)
        const [jx, jy] = jitter(idx)
        const [rx, ry] = cellCenter(h.residualRisk.frequencyIndex, h.residualRisk.severityIndex)
        const residualX = rx + jx
        const residualY = ry + jy
        const residualBand = riskBand(h.residualRisk.riskIndex)
        const hasMitigation = h.initialRisk.riskIndex !== h.residualRisk.riskIndex
        const [ix, iy] = cellCenter(h.initialRisk.frequencyIndex, h.initialRisk.severityIndex)
        const initialX = ix + (hasMitigation ? jx * 0.4 : jx)
        const initialY = iy + (hasMitigation ? jy * 0.4 : jy)
        const isSelected = h.id === selectedId

        return (
          <g key={h.id} data-testid={`risk-matrix-hazard-${h.id}`} data-selected={isSelected} className="cursor-pointer" onClick={() => onSelect(h.id)}>
            {hasMitigation && (
              <>
                <line
                  x1={initialX}
                  y1={initialY}
                  x2={residualX}
                  y2={residualY}
                  stroke="var(--color-info-400)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  markerEnd="url(#risk-matrix-arrowhead)"
                  className="transition-all duration-700 ease-out motion-reduce:transition-none"
                />
                <g transform={`translate(${initialX} ${initialY})`} opacity={0.45} className="transition-transform duration-700 ease-out motion-reduce:transition-none">
                  <Marker shape={markerShapeForBand(riskBand(h.initialRisk.riskIndex))} size={7} fill="none" stroke="var(--color-ink-500)" strokeWidth={1.5} />
                </g>
              </>
            )}
            <g transform={`translate(${residualX} ${residualY})`} className="transition-transform duration-700 ease-out motion-reduce:transition-none">
              <Marker shape={markerShapeForBand(residualBand)} size={isSelected ? 13 : 10} fill={BAND_FILL[residualBand]} stroke={isSelected ? 'var(--color-ink-000)' : BAND_STROKE[residualBand]} strokeWidth={isSelected ? 2.5 : 1.5} />
              <text y={3} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fontWeight="bold" fill="var(--color-hull-950)">
                {h.residualRisk.riskIndex}
              </text>
            </g>
          </g>
        )
      })}

      <defs>
        <marker id="risk-matrix-arrowhead" markerWidth={8} markerHeight={8} refX={6} refY={4} orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--color-info-400)" />
        </marker>
      </defs>
    </svg>
  )
}
