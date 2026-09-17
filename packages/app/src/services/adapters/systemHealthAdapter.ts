import type { AdapterConnectionState } from '@/types'
import { attemptConnectedCall } from './connectedGateway'
import { CONNECTED_API_ENDPOINTS } from '../pocMode'

export interface SystemHealthAdapter {
  readonly kind: 'simulated' | 'connected'
  checkStatus(): Promise<AdapterConnectionState>
}

export const simulatedSystemHealthAdapter: SystemHealthAdapter = {
  kind: 'simulated',
  checkStatus: async () => 'simulated',
}

export const connectedSystemHealthAdapter: SystemHealthAdapter = {
  kind: 'connected',
  checkStatus: async () => {
    const result = await attemptConnectedCall(CONNECTED_API_ENDPOINTS.systemHealth, { method: 'GET' })
    return result.status
  },
}

export function resolveSystemHealthAdapter(mode: 'offline' | 'connected'): SystemHealthAdapter {
  return mode === 'connected' ? connectedSystemHealthAdapter : simulatedSystemHealthAdapter
}
