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
export async function attemptConnectedCall<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  /**
   * Runtime validator for the response body. Without one, `response.json() as T` is a
   * compile-time lie: the shape is asserted, never checked. A malformed or hostile response
   * then flows straight into the UI, where a wrong type throws during render and — with no
   * error boundary — takes the whole console down mid-scenario. A failed validation is treated
   * exactly like a network failure: fall back honestly, never render unvalidated data.
   */
  validate?: (value: unknown) => value is T,
): Promise<ConnectedAttemptResult<T>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...init,
      // Explicit, so a future edit cannot quietly widen it: never send cookies or credentials to
      // a backend, least of all a cross-origin one.
      credentials: 'omit',
      signal: controller.signal,
    })
    if (!response.ok) {
      return { ok: false, status: 'unavailable_fallback', reason: `Connected service responded with HTTP ${response.status}.` }
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('application/json')) {
      return { ok: false, status: 'unavailable_fallback', reason: 'Connected service returned a non-JSON response.' }
    }
    const raw: unknown = await response.json()
    if (validate && !validate(raw)) {
      return { ok: false, status: 'unavailable_fallback', reason: 'Connected service returned a response that failed validation.' }
    }
    return { ok: true, data: raw as T, status: 'connected' }
  } catch (error) {
    const reason = error instanceof DOMException && error.name === 'AbortError' ? 'Connected service did not respond within the timeout window.' : 'Connected service is unreachable from this browser.'
    return { ok: false, status: 'unavailable_fallback', reason }
  } finally {
    clearTimeout(timeout)
  }
}
