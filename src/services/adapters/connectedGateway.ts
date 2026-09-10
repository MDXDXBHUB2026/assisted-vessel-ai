import type { AdapterConnectionState } from '@/types'

const DEFAULT_TIMEOUT_MS = 2500

export interface ConnectedAttemptResult<T> {
  ok: boolean
  data?: T
  status: AdapterConnectionState
  reason?: string
}

/**
 * Attempts a real HTTP call to a Connected POC backend endpoint. No API key or secret is ever
 * attached here — a real deployment would authenticate this call at a backend-to-backend layer,
 * not from the browser. If the request fails for any reason (no backend deployed, network
 * error, non-2xx response, timeout), the caller is told plainly so it can fall back to its
 * offline/simulated implementation. Nothing here ever pretends a failed call succeeded.
 */
export async function attemptConnectedCall<T>(url: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ConnectedAttemptResult<T>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) {
      return { ok: false, status: 'unavailable_fallback', reason: `Connected service responded with HTTP ${response.status}.` }
    }
    const data = (await response.json()) as T
    return { ok: true, data, status: 'connected' }
  } catch (error) {
    const reason = error instanceof DOMException && error.name === 'AbortError' ? 'Connected service did not respond within the timeout window.' : 'Connected service is unreachable from this browser.'
    return { ok: false, status: 'unavailable_fallback', reason }
  } finally {
    clearTimeout(timeout)
  }
}
