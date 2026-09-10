import { useEffect, useRef, useState } from 'react'
import type { GeoPosition, TargetVessel } from '@/types'
import { projectPosition } from '@/utils/geo'

type NavViewMode = 'north_up' | 'course_up' | 'vessel_centred'

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

const TRANSITION_MS = 950

function angleDelta(from: number, to: number): number {
  let d = (to - from) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

export function NavigationCanvas({ own, ownHeadingDeg, ownSpeedKn, targets, routeWaypoints, historicalTrack, windSpeedKn, windDirectionDeg, visibilityNm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewMode, setViewMode] = useState<NavViewMode>('north_up')
  const [layers, setLayers] = useState<NavLayerToggles>(DEFAULT_NAV_LAYERS)

  const ownAnimRef = useRef<AnimatedEntity>({ fromLat: own.latitude, fromLon: own.longitude, toLat: own.latitude, toLon: own.longitude, fromHeading: ownHeadingDeg, toHeading: ownHeadingDeg, updatedAtMs: performance.now() })
  const targetAnimRef = useRef<Map<string, AnimatedEntity>>(new Map())
  const rafRef = useRef<number | undefined>(undefined)

  // Latest props, read imperatively by the render loop so the loop itself never restarts.
  const latestRef = useRef({ own, ownHeadingDeg, ownSpeedKn, targets, routeWaypoints, historicalTrack, windSpeedKn, windDirectionDeg, visibilityNm, viewMode, layers })
  latestRef.current = { own, ownHeadingDeg, ownSpeedKn, targets, routeWaypoints, historicalTrack, windSpeedKn, windDirectionDeg, visibilityNm, viewMode, layers }

  // Register a new animation leg whenever the engine tick produces new own-ship/target values.
  useEffect(() => {
    const now = performance.now()
    const prevOwn = ownAnimRef.current
    const ownInterpNow = interpolateEntity(prevOwn, now)
    ownAnimRef.current = { fromLat: ownInterpNow.lat, fromLon: ownInterpNow.lon, toLat: own.latitude, toLon: own.longitude, fromHeading: ownInterpNow.heading, toHeading: ownHeadingDeg, updatedAtMs: now }

    for (const t of targets) {
      const prev = targetAnimRef.current.get(t.id)
      const base = prev ?? { fromLat: t.position.latitude, fromLon: t.position.longitude, toLat: t.position.latitude, toLon: t.position.longitude, fromHeading: t.heading, toHeading: t.heading, updatedAtMs: now }
      const interpNow = interpolateEntity(base, now)
      targetAnimRef.current.set(t.id, { fromLat: interpNow.lat, fromLon: interpNow.lon, toLat: t.position.latitude, toLon: t.position.longitude, fromHeading: interpNow.heading, toHeading: t.heading, updatedAtMs: now })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own.latitude, own.longitude, ownHeadingDeg, targets])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const render = () => {
      const now = performance.now()
      const { ownSpeedKn: curSpeed, targets: curTargets, routeWaypoints: curRoute, historicalTrack: curTrack, windSpeedKn: curWind, windDirectionDeg: curWindDir, visibilityNm: curVis, viewMode: curViewMode, layers: curLayers } = latestRef.current

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

      const ownNow = interpolateEntity(ownAnimRef.current, now)
      const targetsNow = curTargets.map((t) => {
        const anim = targetAnimRef.current.get(t.id)
        const interp = anim ? interpolateEntity(anim, now) : { lat: t.position.latitude, lon: t.position.longitude, heading: t.heading }
        return { ...t, position: { latitude: interp.lat, longitude: interp.lon }, heading: interp.heading }
      })

      // --- projection setup ---
      const allPoints = [{ latitude: ownNow.lat, longitude: ownNow.lon }, ...targetsNow.map((t) => t.position), ...curRoute, ...curTrack]
      const centre = curViewMode === 'vessel_centred' ? { latitude: ownNow.lat, longitude: ownNow.lon } : centroid(allPoints)
      const spanNm = curViewMode === 'vessel_centred' ? 14 : boundingSpanNm(allPoints, centre)
      const rotationDeg = curViewMode === 'course_up' ? -ownNow.heading : 0
      const pxPerNm = Math.min(W, H) / (spanNm * 2.2)

      const project = (p: GeoPosition): [number, number] => {
        const dLatNm = (p.latitude - centre.latitude) * 60
        const dLonNm = (p.longitude - centre.longitude) * 60 * Math.cos((centre.latitude * Math.PI) / 180)
        const rot = (rotationDeg * Math.PI) / 180
        const rx = dLonNm * Math.cos(rot) - dLatNm * Math.sin(rot)
        const ry = dLonNm * Math.sin(rot) + dLatNm * Math.cos(rot)
        return [W / 2 + rx * pxPerNm, H / 2 - ry * pxPerNm]
      }

      // background
      ctx.fillStyle = '#0b132b'
      ctx.fillRect(0, 0, W, H)
      drawGrid(ctx, W, H)

      // visibility haze — reduced visibility narrows the "known clear" radius
      if (curLayers.weather) {
        const visPx = Math.min(W, H) * 0.48 * clamp01(curVis / 10)
        const grad = ctx.createRadialGradient(W / 2, H / 2, visPx * 0.5, W / 2, H / 2, Math.max(W, H) * 0.75)
        grad.addColorStop(0, 'rgba(11,19,43,0)')
        grad.addColorStop(1, 'rgba(11,19,43,0.55)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)
      }

      // route
      if (curLayers.route && curRoute.length > 1) {
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

      // historical track (fading trail)
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

      // predicted own-ship track
      if (curLayers.predicted) {
        const predicted = [10, 20, 30].map((min) => projectPosition({ latitude: ownNow.lat, longitude: ownNow.lon }, ownNow.heading, curSpeed * (min / 60)))
        ctx.beginPath()
        const [sx, sy] = project({ latitude: ownNow.lat, longitude: ownNow.lon })
        ctx.moveTo(sx, sy)
        predicted.forEach((p) => {
          const [x, y] = project(p)
          ctx.lineTo(x, y)
        })
        ctx.strokeStyle = 'rgba(91,192,190,0.9)'
        ctx.setLineDash([2, 4])
        ctx.lineWidth = 1.25
        ctx.stroke()
        ctx.setLineDash([])
        predicted.forEach((p, i) => {
          const [x, y] = project(p)
          ctx.beginPath()
          ctx.arc(x, y, 2, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(91,192,190,0.8)'
          ctx.fill()
          ctx.font = '9px monospace'
          ctx.fillStyle = 'rgba(148,163,184,0.8)'
          ctx.fillText(`${[10, 20, 30][i]}m`, x + 4, y - 4)
        })
      }

      // safety domain around own ship (illustrative minimum-distance ring)
      if (curLayers.safetyDomain) {
        const [ox, oy] = project({ latitude: ownNow.lat, longitude: ownNow.lon })
        ctx.beginPath()
        ctx.arc(ox, oy, 0.5 * pxPerNm, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(237,165,40,0.35)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // targets: vector, CPA line, marker
      if (curLayers.targets) {
        for (const t of targetsNow) {
          const [tx, ty] = project(t.position)
          const riskColor = t.relativeRisk === 'high' ? '#f0473a' : t.relativeRisk === 'medium' ? '#eda528' : '#3ee08a'

          if (curLayers.cpaTcpa && t.cpaNm < 8 && t.tcpaMinutes > 0 && Number.isFinite(t.tcpaMinutes)) {
            const ownFuture = projectPosition({ latitude: ownNow.lat, longitude: ownNow.lon }, ownNow.heading, curSpeed * (t.tcpaMinutes / 60))
            const targetFuture = projectPosition(t.position, t.heading, t.speedKn * (t.tcpaMinutes / 60))
            const [fx1, fy1] = project(ownFuture)
            const [fx2, fy2] = project(targetFuture)
            ctx.beginPath()
            ctx.moveTo(fx1, fy1)
            ctx.lineTo(fx2, fy2)
            ctx.strokeStyle = `${riskColor}99`
            ctx.setLineDash([3, 3])
            ctx.lineWidth = 1
            ctx.stroke()
            ctx.setLineDash([])
            ctx.beginPath()
            ctx.arc(fx2, fy2, 3, 0, Math.PI * 2)
            ctx.fillStyle = riskColor
            ctx.fill()
          }

          // vector (6 min ahead)
          const vecTarget = projectPosition(t.position, t.heading, t.speedKn * 0.1)
          const [vx, vy] = project(vecTarget)
          ctx.beginPath()
          ctx.moveTo(tx, ty)
          ctx.lineTo(vx, vy)
          ctx.strokeStyle = riskColor
          ctx.lineWidth = 1.5
          ctx.stroke()

          ctx.beginPath()
          ctx.arc(tx, ty, 5, 0, Math.PI * 2)
          ctx.fillStyle = riskColor
          ctx.fill()
          ctx.font = '10px Inter, sans-serif'
          ctx.fillStyle = '#cbd5e1'
          ctx.fillText(`${t.label.replace('Synthetic Target ', '')} · CPA ${t.cpaNm.toFixed(1)}nm`, tx + 8, ty - 8)
        }
      }

      // own ship
      {
        const [ox, oy] = project({ latitude: ownNow.lat, longitude: ownNow.lon })
        const drawHeading = ownNow.heading - rotationDeg
        ctx.save()
        ctx.translate(ox, oy)
        ctx.rotate((drawHeading * Math.PI) / 180)
        ctx.beginPath()
        ctx.moveTo(0, -10)
        ctx.lineTo(-6, 8)
        ctx.lineTo(6, 8)
        ctx.closePath()
        ctx.fillStyle = '#5BC0BE'
        ctx.fill()
        ctx.restore()
        ctx.font = 'bold 10px Inter, sans-serif'
        ctx.fillStyle = '#f1f5f9'
        ctx.fillText('OWN SHIP', ox + 10, oy + 4)
      }

      // wind indicator
      if (curLayers.weather) {
        const cx = W - 44
        const cy = 44
        ctx.beginPath()
        ctx.arc(cx, cy, 26, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(148,163,184,0.3)'
        ctx.stroke()
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate((curWindDir * Math.PI) / 180)
        ctx.beginPath()
        ctx.moveTo(0, -18)
        ctx.lineTo(-4, -8)
        ctx.lineTo(4, -8)
        ctx.closePath()
        ctx.fillStyle = '#5BC0BE'
        ctx.fill()
        ctx.restore()
        ctx.font = '9px monospace'
        ctx.fillStyle = '#94a3b8'
        ctx.textAlign = 'center'
        ctx.fillText(`${curWind.toFixed(0)}kn`, cx, cy + 40)
        ctx.textAlign = 'left'
      }

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-sm border border-panel-border">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="absolute left-2 top-2 flex gap-1 rounded-sm border border-hull-500/40 bg-hull-900/80 p-0.5 backdrop-blur-sm">
        {(['north_up', 'course_up', 'vessel_centred'] as NavViewMode[]).map((m) => (
          <button key={m} onClick={() => setViewMode(m)} className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${viewMode === m ? 'bg-info-500 text-hull-950' : 'text-ink-400 hover:text-ink-100'}`}>
            {m.replace('_', ' ')}
          </button>
        ))}
      </div>
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 rounded-sm border border-hull-500/40 bg-hull-900/80 p-1 text-[9px] backdrop-blur-sm">
        {(Object.keys(layers) as (keyof NavLayerToggles)[]).map((key) => (
          <button
            key={key}
            onClick={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
            className={`rounded px-1.5 py-0.5 font-medium uppercase ${layers[key] ? 'bg-hull-700 text-info-400' : 'text-ink-700'}`}
          >
            {key.replace(/([A-Z])/g, ' $1')}
          </button>
        ))}
      </div>
    </div>
  )
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

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function centroid(points: GeoPosition[]): GeoPosition {
  const lat = points.reduce((s, p) => s + p.latitude, 0) / points.length
  const lon = points.reduce((s, p) => s + p.longitude, 0) / points.length
  return { latitude: lat, longitude: lon }
}

function boundingSpanNm(points: GeoPosition[], centre: GeoPosition): number {
  let maxNm = 5
  for (const p of points) {
    const dLatNm = Math.abs(p.latitude - centre.latitude) * 60
    const dLonNm = Math.abs(p.longitude - centre.longitude) * 60 * Math.cos((centre.latitude * Math.PI) / 180)
    maxNm = Math.max(maxNm, dLatNm, dLonNm)
  }
  return maxNm
}

function drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.strokeStyle = '#182233'
  ctx.lineWidth = 1
  const step = 40
  for (let x = 0; x < W; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = 0; y < H; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
}
