import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { RiskBadge, Pill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ShieldAlert } from 'lucide-react'

export function SafetyPage() {
  const hazards = useSimulationStore((s) => s.hazards)
  const updateHazardStatus = useSimulationStore((s) => s.updateHazardStatus)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <ShieldAlert size={18} className="text-info-400" /> Safety Intelligence
        </h1>
        <p className="text-sm text-ink-500">Active hazards, risk assessment and structured corrective-action workflow.</p>
      </div>

      {hazards.length === 0 ? (
        <Panel>
          <p className="text-sm text-ink-500">No active safety hazards. Trigger the SAFETY EVENT scenario from Scenario Control to see the workflow in action.</p>
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {hazards.map((h) => (
            <Panel key={h.id} title={h.title} subtitle={`Raised ${h.raisedAtIso.slice(0, 16).replace('T', ' ')} UTC`} action={<RiskBadge level={h.riskLevel} />}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2 text-xs">
                  <Row label="Category" value={h.category} />
                  <Row label="Likelihood" value={h.likelihood.replace(/_/g, ' ')} />
                  <Row label="Severity" value={h.severity} />
                  <Row label="People potentially exposed" value={String(h.peopleExposed)} />
                  <Row label="Residual risk" value={h.residualRisk} />
                  <Row label="Responsible role" value={h.responsibleRole} />
                </div>
                <div className="flex flex-col gap-2 text-xs">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-ink-500">Immediate mitigation</div>
                    <p className="mt-0.5 text-ink-100">{h.immediateMitigation}</p>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-ink-500">Recommended corrective action</div>
                    <p className="mt-0.5 text-ink-100">{h.recommendedCorrectiveAction}</p>
                  </div>
                  <div className="mt-1">
                    Status: <Pill tone={h.status === 'closed' ? 'healthy' : h.status === 'open' ? 'critical' : 'warning'}>{h.status.replace(/_/g, ' ')}</Pill>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-panel-border pt-3">
                <Button size="sm" variant="secondary" onClick={() => updateHazardStatus(h.id, 'acknowledged')}>ACKNOWLEDGE</Button>
                <Button size="sm" variant="secondary" onClick={() => updateHazardStatus(h.id, 'assigned', h.responsibleRole)}>ASSIGN</Button>
                <Button size="sm" variant="secondary" onClick={() => updateHazardStatus(h.id, 'investigating')}>INVESTIGATE</Button>
                <Button size="sm" variant="danger" onClick={() => updateHazardStatus(h.id, 'escalated')}>ESCALATE</Button>
                <Button size="sm" variant="success" onClick={() => updateHazardStatus(h.id, 'closed')}>CLOSE</Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-panel-border/60 pb-1.5 last:border-0">
      <span className="text-ink-500">{label}</span>
      <span className="font-medium capitalize text-ink-100">{value}</span>
    </div>
  )
}
