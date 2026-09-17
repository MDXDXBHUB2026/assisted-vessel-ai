import type { AdapterConnectionState } from '@/types'
import { attemptConnectedCall } from './connectedGateway'
import { CONNECTED_API_ENDPOINTS } from '../pocMode'

/**
 * The vessel snapshot itself is always produced by the local deterministic simulation engine —
 * that is the Offline Demonstration Mode requirement, and it is what keeps the public
 * demonstration working with no backend at all. This adapter's role is narrower: it reports
 * whether a real streamed-telemetry backend is reachable, so the Command Ribbon and System
 * Assurance view can show the vessel's data source honestly rather than implying a live feed
 * that does not exist for this static deployment.
 */
export interface TelemetryAdapter {
  readonly kind: 'simulated' | 'connected'
  checkStatus(): Promise<AdapterConnectionState>
}

export const simulatedTelemetryAdapter: TelemetryAdapter = {
  kind: 'simulated',
  checkStatus: async () => 'simulated',
}

export const connectedTelemetryAdapter: TelemetryAdapter = {
  kind: 'connected',
  checkStatus: async () => {
    const result = await attemptConnectedCall(CONNECTED_API_ENDPOINTS.telemetry, { method: 'HEAD' })
    return result.status
  },
}

export function resolveTelemetryAdapter(mode: 'offline' | 'connected'): TelemetryAdapter {
  return mode === 'connected' ? connectedTelemetryAdapter : simulatedTelemetryAdapter
}
