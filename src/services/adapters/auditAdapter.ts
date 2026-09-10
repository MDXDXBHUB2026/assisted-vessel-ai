import type { AuditEvent } from '@/types'
import { attemptConnectedCall } from './connectedGateway'
import { CONNECTED_API_ENDPOINTS } from '../pocMode'

/** Persistent audit history boundary. The simulated implementation is the in-memory, per-session
 * audit trail already held in the application store. A connected implementation would durably
 * persist every event server-side (surviving a page refresh or crew handover) — this adapter
 * makes that swap a non-breaking, additive change: it best-effort mirrors new events to the
 * backend without ever blocking or altering the local (always-available) audit trail. */
export interface AuditAdapter {
  readonly kind: 'simulated' | 'connected'
  append(event: AuditEvent): Promise<void>
}

export const simulatedAuditAdapter: AuditAdapter = {
  kind: 'simulated',
  append: async () => {
    // No-op: the event already lives in the in-session store, which is the durable record
    // for Offline Demonstration Mode.
  },
}

export const connectedAuditAdapter: AuditAdapter = {
  kind: 'connected',
  append: async (event) => {
    await attemptConnectedCall(CONNECTED_API_ENDPOINTS.audit, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })
    // Best-effort only — failure to persist to a connected backend never blocks or removes the
    // local audit record, and is not surfaced as an error to the operator.
  },
}

export function resolveAuditAdapter(mode: 'offline' | 'connected'): AuditAdapter {
  return mode === 'connected' ? connectedAuditAdapter : simulatedAuditAdapter
}
