import type { AdapterConnectionState, DataProvenance } from '@/types'
import { attemptConnectedCall } from './connectedGateway'
import { CONNECTED_API_ENDPOINTS } from '../pocMode'

export interface DocumentSearchResult {
  documentTitle: string
  excerpt: string
  provenance: DataProvenance
}

/** Generative-AI evidence synthesis and procedure/document retrieval boundary. The simulated
 * implementation returns a small canned reference set illustrating the interaction pattern; a
 * connected implementation would query a real RAG/document-retrieval backend. */
export interface DocumentSearchAdapter {
  readonly kind: 'simulated' | 'connected'
  search(query: string): Promise<DocumentSearchResult[]>
  checkStatus(): Promise<AdapterConnectionState>
}

const CANNED_REFERENCES: DocumentSearchResult[] = [
  { documentTitle: 'Safety Management System — Machinery Casualty Procedure (illustrative)', excerpt: 'On detection of a developing thermal anomaly, reduce load and notify the Chief Engineer before continuing at full power.', provenance: 'simulated' },
  { documentTitle: 'Bridge Procedures Manual — Collision Avoidance (illustrative)', excerpt: 'Early and substantial action should be taken to keep well clear, in accordance with the COLREGs.', provenance: 'simulated' },
  { documentTitle: 'Reefer Cargo Care Manual — Temperature Excursion Response (illustrative)', excerpt: 'Verify power supply and setpoint before assuming unit failure; log actual vs set-point readings at 15-minute intervals.', provenance: 'simulated' },
]

export const simulatedDocumentSearchAdapter: DocumentSearchAdapter = {
  kind: 'simulated',
  search: async (query) => {
    const q = query.toLowerCase()
    const matched = CANNED_REFERENCES.filter((r) => r.documentTitle.toLowerCase().includes(q) || r.excerpt.toLowerCase().includes(q))
    return matched.length > 0 ? matched : CANNED_REFERENCES.slice(0, 1)
  },
  checkStatus: async () => 'simulated',
}

/** A non-array body previously produced an unhandled rejection at the `.map()` call site. */
function isDocumentSearchResults(value: unknown): value is DocumentSearchResult[] {
  if (!Array.isArray(value) || value.length > 50) return false
  return value.every((item) => {
    if (typeof item !== 'object' || item === null) return false
    const c = item as Record<string, unknown>
    return typeof c.documentTitle === 'string' && typeof c.excerpt === 'string' && c.excerpt.length <= 4000
  })
}

export const connectedDocumentSearchAdapter: DocumentSearchAdapter = {
  kind: 'connected',
  search: async (query) => {
    const result = await attemptConnectedCall<DocumentSearchResult[]>(
      `${CONNECTED_API_ENDPOINTS.documentSearch}?q=${encodeURIComponent(query)}`,
      undefined,
      undefined,
      isDocumentSearchResults,
    )
    if (result.ok && result.data) return result.data.map((r) => ({ ...r, provenance: 'ai_generated' as const }))
    return simulatedDocumentSearchAdapter.search(query)
  },
  checkStatus: async () => (await attemptConnectedCall(CONNECTED_API_ENDPOINTS.documentSearch)).status,
}

export function resolveDocumentSearchAdapter(mode: 'offline' | 'connected'): DocumentSearchAdapter {
  return mode === 'connected' ? connectedDocumentSearchAdapter : simulatedDocumentSearchAdapter
}
