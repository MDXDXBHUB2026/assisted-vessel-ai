import type { AdapterConnectionState, AssuranceAvailability, SystemAssuranceItem } from '@ave/core-domain/types'
import type { AdapterStatuses } from './state'
import type { VesselSnapshot } from '@ave/core-domain/types'

function fromAdapterState(state: AdapterConnectionState): AssuranceAvailability {
  if (state === 'connected' || state === 'simulated') return 'available'
  if (state === 'connecting' || state === 'unavailable_fallback') return 'degraded'
  return 'unavailable'
}

export function buildSystemAssuranceItems(snapshot: VesselSnapshot, adapterStatuses: AdapterStatuses, pocMode: 'offline' | 'connected'): SystemAssuranceItem[] {
  const t = snapshot.simTimeIso
  const navConfidence = snapshot.navigation.gnssConfidence
  const overallConfidence = Math.min(navConfidence, snapshot.communications.satelliteConfidence, snapshot.systemHealth.find((s) => s.area === 'main_engine')?.confidence ?? 100)
  const latency = snapshot.communications.shoreSyncLatencySec

  return [
    {
      id: 'nav_data_health',
      label: 'Navigation Data Health',
      availability: snapshot.navigation.gnssAvailable && navConfidence > 60 ? 'available' : navConfidence > 25 ? 'degraded' : 'unavailable',
      detail: `GNSS confidence ${navConfidence.toFixed(0)}%, radar ${snapshot.navigation.radarAvailable ? 'up' : 'down'}, AIS ${snapshot.navigation.aisAvailable ? 'up' : 'down'}.`,
      lastCheckedIso: t,
    },
    {
      id: 'sensor_integrity',
      label: 'Sensor Integrity',
      availability: overallConfidence > 70 ? 'available' : overallConfidence > 35 ? 'degraded' : 'unavailable',
      detail: `Fused sensor confidence ${overallConfidence.toFixed(0)}% across navigation, machinery and communications sources.`,
      lastCheckedIso: t,
    },
    {
      id: 'machinery_gateway',
      label: 'Machinery Gateway',
      availability: fromAdapterState(adapterStatuses.telemetry),
      detail: pocMode === 'offline' ? 'Simulated telemetry — Offline Demonstration Mode.' : `Connected telemetry status: ${adapterStatuses.telemetry.replace(/_/g, ' ')}.`,
      lastCheckedIso: t,
    },
    {
      id: 'network_health',
      label: 'Network Health',
      availability: snapshot.communications.satelliteLinkUp ? 'available' : 'unavailable',
      detail: `Satellite confidence ${snapshot.communications.satelliteConfidence.toFixed(0)}%.`,
      lastCheckedIso: t,
    },
    {
      id: 'ship_shore_link',
      label: 'Ship/Shore Link',
      availability: snapshot.communications.satelliteLinkUp ? 'available' : 'unavailable',
      detail: snapshot.communications.satelliteLinkUp ? `Last sync ${snapshot.communications.lastShoreSyncIso.slice(11, 16)} UTC.` : `Link down — last successful sync ${snapshot.communications.lastShoreSyncIso.slice(11, 16)} UTC.`,
      lastCheckedIso: t,
    },
    {
      id: 'ai_service',
      label: 'AI Service Availability',
      availability: fromAdapterState(adapterStatuses.copilot),
      detail: pocMode === 'offline' ? 'Deterministic offline Copilot adapter active.' : `Connected AI Copilot status: ${adapterStatuses.copilot.replace(/_/g, ' ')}.`,
      lastCheckedIso: t,
    },
    {
      id: 'rules_engine',
      label: 'Rules Engine',
      availability: 'available',
      detail: 'Deterministic safety-validation and ODD rules engine — always local, never dependent on connectivity.',
      lastCheckedIso: t,
    },
    {
      id: 'model_version',
      label: 'Model Version',
      availability: 'available',
      detail: 'ME-Anomaly-Detector v2.3.1 · CPA-Risk-Model v1.4.0 · Voyage-Optimiser v3.0.2',
      lastCheckedIso: t,
    },
    {
      id: 'rules_version',
      label: 'Rules Version',
      availability: 'available',
      detail: 'Safety Engine ruleset v1.0 · Operational Envelope definitions v1.0',
      lastCheckedIso: t,
    },
    {
      id: 'data_latency',
      label: 'Data Latency',
      availability: latency < 5 ? 'available' : latency < 20 ? 'degraded' : 'unavailable',
      detail: `${latency.toFixed(1)}s round-trip ship-shore latency.`,
      lastCheckedIso: t,
    },
    {
      id: 'data_quality',
      label: 'Data Quality',
      availability: overallConfidence > 70 ? 'available' : overallConfidence > 35 ? 'degraded' : 'unavailable',
      detail: `Overall data-quality confidence ${overallConfidence.toFixed(0)}%.`,
      lastCheckedIso: t,
    },
    {
      id: 'audit_service',
      label: 'Audit Service',
      availability: fromAdapterState(adapterStatuses.audit),
      detail: pocMode === 'offline' ? 'In-session audit trail — persists for this browser session.' : `Connected persistent audit mirror: ${adapterStatuses.audit.replace(/_/g, ' ')}.`,
      lastCheckedIso: t,
    },
  ]
}
