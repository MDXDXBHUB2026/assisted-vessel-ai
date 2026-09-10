import type { PocExecutionMode } from '@/types'

/**
 * The Connected POC backend boundary. No secret or credential is ever read here — the frontend
 * only knows a base URL for a set of documented REST endpoints. If that backend does not exist
 * or does not respond (as is the case for the public static demonstration), every adapter falls
 * back to its offline/simulated implementation and the UI reports this honestly rather than
 * disguising synthetic data as live.
 */
export const CONNECTED_API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api'

export const CONNECTED_API_ENDPOINTS = {
  telemetry: `${CONNECTED_API_BASE_URL}/telemetry`,
  weather: `${CONNECTED_API_BASE_URL}/weather`,
  recommendations: `${CONNECTED_API_BASE_URL}/recommendations`,
  copilot: `${CONNECTED_API_BASE_URL}/copilot`,
  documentSearch: `${CONNECTED_API_BASE_URL}/documents/search`,
  audit: `${CONNECTED_API_BASE_URL}/audit`,
  shoreCases: `${CONNECTED_API_BASE_URL}/shore-cases`,
  systemHealth: `${CONNECTED_API_BASE_URL}/system-health`,
} as const

const STORAGE_KEY = 'avi.pocMode'

export function readStoredPocMode(): PocExecutionMode {
  if (typeof window === 'undefined') return 'offline'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'connected' ? 'connected' : 'offline'
  } catch {
    return 'offline'
  }
}

export function writeStoredPocMode(mode: PocExecutionMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // best-effort only — POC mode selection is a convenience, not a durable requirement
  }
}
