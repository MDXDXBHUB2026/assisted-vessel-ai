export function formatNumber(value: number, decimals = 1): string {
  return value.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatUtc(iso: string): string {
  const d = new Date(iso)
  return `${d.toISOString().slice(11, 16)} UTC`
}

export function formatDateUtc(iso: string): string {
  const d = new Date(iso)
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`
}

export function formatLatLon(lat: number, lon: number): string {
  const latDeg = Math.abs(lat).toFixed(3)
  const lonDeg = Math.abs(lon).toFixed(3)
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${latDeg}°${ns} ${lonDeg}°${ew}`
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—'
  if (minutes < 0) return 'passed'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

export function percent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`
}
