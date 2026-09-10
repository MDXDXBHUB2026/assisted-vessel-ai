import type { GeoPosition, TargetVessel } from '@/types'

const SIZE = 420

export function NavPlot({ own, ownHeading, targets, routeWaypoints }: { own: GeoPosition; ownHeading: number; targets: TargetVessel[]; routeWaypoints: GeoPosition[] }) {
  const points = [own, ...targets.map((t) => t.position), ...routeWaypoints]
  const lats = points.map((p) => p.latitude)
  const lons = points.map((p) => p.longitude)
  const padDeg = 0.35
  const minLat = Math.min(...lats) - padDeg
  const maxLat = Math.max(...lats) + padDeg
  const minLon = Math.min(...lons) - padDeg
  const maxLon = Math.max(...lons) + padDeg

  const toXY = (p: GeoPosition) => {
    const x = ((p.longitude - minLon) / (maxLon - minLon)) * SIZE
    const y = SIZE - ((p.latitude - minLat) / (maxLat - minLat)) * SIZE
    return { x, y }
  }

  const ownXY = toXY(own)
  const riskColor = { low: '#22c26c', medium: '#eda528', high: '#f0473a' }

  const routePoints = routeWaypoints.map(toXY)

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full rounded-md bg-hull-950">
      <defs>
        <pattern id="navgrid" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#182233" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={SIZE} height={SIZE} fill="url(#navgrid)" />

      <polyline points={routePoints.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#5BC0BE" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.5} />

      {targets.map((t) => {
        const p = toXY(t.position)
        return (
          <g key={t.id}>
            <circle cx={p.x} cy={p.y} r={5} fill={riskColor[t.relativeRisk]} opacity={0.9} />
            <line x1={p.x} y1={p.y} x2={p.x + 14 * Math.sin((t.heading * Math.PI) / 180)} y2={p.y - 14 * Math.cos((t.heading * Math.PI) / 180)} stroke={riskColor[t.relativeRisk]} strokeWidth={1.5} />
            <text x={p.x + 8} y={p.y - 8} fontSize={10} fill="#b7c2d3">
              {t.label.replace('Synthetic Target ', '')}
            </text>
          </g>
        )
      })}

      <g>
        <polygon
          points={`${ownXY.x},${ownXY.y - 9} ${ownXY.x - 6},${ownXY.y + 7} ${ownXY.x + 6},${ownXY.y + 7}`}
          fill="#5BC0BE"
          transform={`rotate(${ownHeading}, ${ownXY.x}, ${ownXY.y})`}
        />
        <text
          x={ownXY.x > SIZE - 70 ? ownXY.x - 10 : ownXY.x + 10}
          y={ownXY.y + 4}
          textAnchor={ownXY.x > SIZE - 70 ? 'end' : 'start'}
          fontSize={11}
          fontWeight={600}
          fill="#f4f6f9"
        >
          OWN SHIP
        </text>
      </g>
    </svg>
  )
}
