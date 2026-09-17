import type { ShoreCase } from '@/types'
import { attemptConnectedCall } from './connectedGateway'
import { CONNECTED_API_ENDPOINTS } from '../pocMode'

/** Shore-case synchronisation boundary. Simulated keeps cases in the local store only (fine for
 * a single-session demonstration). Connected would synchronise cases to a shared backend so
 * shore and vessel see a consistent case list across separate sessions/devices. */
export interface ShoreCaseAdapter {
  readonly kind: 'simulated' | 'connected'
  sync(caseRecord: ShoreCase): Promise<void>
}

export const simulatedShoreCaseAdapter: ShoreCaseAdapter = {
  kind: 'simulated',
  sync: async () => {},
}

export const connectedShoreCaseAdapter: ShoreCaseAdapter = {
  kind: 'connected',
  sync: async (caseRecord) => {
    await attemptConnectedCall(CONNECTED_API_ENDPOINTS.shoreCases, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(caseRecord),
    })
  },
}

export function resolveShoreCaseAdapter(mode: 'offline' | 'connected'): ShoreCaseAdapter {
  return mode === 'connected' ? connectedShoreCaseAdapter : simulatedShoreCaseAdapter
}
