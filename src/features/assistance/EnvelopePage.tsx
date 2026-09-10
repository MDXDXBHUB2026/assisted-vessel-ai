import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { Pill } from '@/components/ui/Badge'
import { assessAllOdd } from '@/safety-engine/oddEngine'
import { SYSTEM_AREA_LABELS } from '@/types'
import { systemStateColor, systemStateLabel } from '@/utils/theme'
import { ScanLine } from 'lucide-react'

export function EnvelopePage() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const assessments = assessAllOdd(snapshot)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <ScanLine size={18} className="text-info-400" /> Operational Envelope (ODD)
        </h1>
        <p className="text-sm text-ink-500">Each assisted function has a defined operating envelope. Recommendations outside envelope are never presented as executable.</p>
      </div>

      <div className="flex flex-col gap-4">
        {assessments.map((a) => (
          <Panel
            key={a.functionId}
            title={a.functionLabel}
            action={
              <span className={`rounded border px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${a.insideEnvelope ? 'border-healthy-500/30 bg-healthy-500/10 text-healthy-400' : 'border-critical-500/30 bg-critical-500/10 text-critical-400'}`}>
                {a.insideEnvelope ? 'Inside Operational Envelope' : 'Outside Operational Envelope'}
              </span>
            }
          >
            {!a.insideEnvelope && (
              <div className="mb-3 rounded-md border border-critical-500/30 bg-critical-500/5 px-3 py-2 text-xs text-critical-400">
                Limiting factor(s): {a.limitingFactors.map((f) => f.label).join(', ')}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {a.parameters.map((p) => (
                <div key={p.label} className="rounded-md border border-panel-border bg-panel-raised px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-ink-500">{p.label}</div>
                  <div className="mt-0.5 text-sm font-medium text-ink-100">{p.value}</div>
                  <Pill tone={p.withinLimit ? 'healthy' : 'critical'}>{p.withinLimit ? 'OK' : 'LIMIT'}</Pill>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>

      <Panel title="System States" subtitle="NORMAL / DEGRADED / FALLBACK / CONTINGENCY">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {snapshot.systemHealth.map((s) => (
            <div key={s.area} className="rounded-md border border-panel-border bg-panel-raised px-3 py-2">
              <div className="text-xs font-medium text-ink-100">{SYSTEM_AREA_LABELS[s.area]}</div>
              <div className={`mt-1 text-xs font-bold uppercase ${systemStateColor[s.state]}`}>{systemStateLabel[s.state]}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
