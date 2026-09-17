import { useEffect } from 'react'
import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { AssuranceBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { buildSystemAssuranceItems } from '@ave/simulator/simulation/systemAssurance'
import { CONNECTED_API_ENDPOINTS } from '@/services/pocMode'
import { Activity, Server } from 'lucide-react'

export function SystemAssurancePage() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const adapterStatuses = useSimulationStore((s) => s.adapterStatuses)
  const pocMode = useSimulationStore((s) => s.pocMode)
  const setPocMode = useSimulationStore((s) => s.setPocMode)
  const probeConnectedAdapters = useSimulationStore((s) => s.probeConnectedAdapters)

  useEffect(() => {
    if (pocMode === 'connected') void probeConnectedAdapters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const items = buildSystemAssuranceItems(snapshot, adapterStatuses, pocMode)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <Activity size={18} className="text-info-400" /> System Assurance
        </h1>
        <p className="text-sm text-ink-500">Live status of every data source and service dependency this platform relies on, distinguishing AVAILABLE, DEGRADED and UNAVAILABLE.</p>
      </div>

      <Panel title="POC Execution Mode">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex overflow-hidden rounded-sm border border-hull-500/40">
            <button onClick={() => setPocMode('offline')} className={`px-3 py-1.5 text-xs font-semibold ${pocMode === 'offline' ? 'bg-info-500 text-hull-950' : 'bg-hull-800 text-ink-400'}`}>
              OFFLINE DEMONSTRATION
            </button>
            <button onClick={() => setPocMode('connected')} className={`px-3 py-1.5 text-xs font-semibold ${pocMode === 'connected' ? 'bg-info-500 text-hull-950' : 'bg-hull-800 text-ink-400'}`}>
              CONNECTED POC
            </button>
          </div>
          {pocMode === 'connected' && (
            <Button size="sm" variant="secondary" icon={<Server size={13} />} onClick={() => void probeConnectedAdapters()}>
              RE-CHECK CONNECTED SERVICES
            </Button>
          )}
          <span className="text-xs text-ink-500">
            {pocMode === 'offline'
              ? 'Runs entirely from simulated vessel data and deterministic local logic. No network calls are made.'
              : `Attempts real calls to a backend at ${CONNECTED_API_ENDPOINTS.telemetry.replace('/telemetry', '')}. None is deployed for this public demonstration, so every service falls back to its offline implementation — shown honestly below rather than disguised as live.`}
          </span>
        </div>
      </Panel>

      <Panel title="Service &amp; Data Source Status">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-ink-500">
              <th className="pb-2 font-medium">Component</th>
              <th className="pb-2 font-medium">Availability</th>
              <th className="pb-2 font-medium">Detail</th>
              <th className="pb-2 font-medium">Last Checked</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-panel-border">
                <td className="py-2 font-medium text-ink-100">{item.label}</td>
                <td className="py-2">
                  <AssuranceBadge availability={item.availability} />
                </td>
                <td className="py-2 text-ink-400">{item.detail}</td>
                <td className="py-2 tabular-nums text-ink-500">{item.lastCheckedIso.slice(11, 19)} UTC</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
