import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { OddStatusBadge, AssistanceLevelTag } from '@/components/ui/Badge'
import { InstrumentRow } from '@/components/ui/InstrumentRow'
import { assessAllOdd } from '@ave/safety-engine/oddEngine'
import { activeIntolerableHazardCategories } from '@ave/decision-engine/hazardLifecycle'
import { SYSTEM_AREA_LABELS } from '@/types'
import { systemStateColor, systemStateLabel } from '@/utils/theme'
import { ScanLine } from 'lucide-react'

export function EnvelopePage() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const hazards = useSimulationStore((s) => s.hazards)
  const assessments = assessAllOdd(snapshot, activeIntolerableHazardCategories(hazards))

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <ScanLine size={18} className="text-info-400" /> Operational Envelope &amp; Assistance Levels
        </h1>
        <p className="text-sm text-ink-500">
          Each assisted function has an independent operating envelope (ODD) and an assistance level (L0–L4). A recommendation outside its envelope is never
          presented as executable, and assistance automatically steps down before a limit is reached.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {assessments.map((a) => (
          <Panel
            key={a.functionId}
            title={a.functionLabel}
            action={
              <div className="flex items-center gap-2">
                <AssistanceLevelTag level={a.availableAssistanceLevel} />
                {a.availableAssistanceLevel !== a.configuredAssistanceLevel && <AssistanceLevelTag level={a.configuredAssistanceLevel} muted />}
                <OddStatusBadge status={a.status} />
              </div>
            }
          >
            {a.status !== 'inside' && (
              <div className={`mb-3 rounded-sm border px-3 py-2 text-xs ${a.status === 'outside' ? 'border-critical-500/30 bg-critical-500/5 text-critical-400' : 'border-warning-500/30 bg-warning-500/5 text-warning-400'}`}>
                {a.assistanceLimitingReason ?? 'Envelope constraint active.'}
              </div>
            )}
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
              {a.parameters.map((p) => (
                <InstrumentRow
                  key={p.label}
                  label={p.label}
                  value={p.value}
                  tone={p.status === 'inside' ? 'healthy' : p.status === 'near_limit' ? 'warning' : 'critical'}
                  trailing={<span className="text-[9px] uppercase tracking-wide text-ink-700">{p.detail}</span>}
                />
              ))}
            </div>
          </Panel>
        ))}
      </div>

      <Panel title="System States" subtitle="NORMAL / DEGRADED / FALLBACK / CONTINGENCY">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {snapshot.systemHealth.map((s) => (
            <div key={s.area} className="rounded-sm border border-panel-border bg-panel-raised px-3 py-2">
              <div className="text-xs font-medium text-ink-100">{SYSTEM_AREA_LABELS[s.area]}</div>
              <div className={`mt-1 text-xs font-bold uppercase ${systemStateColor[s.state]}`}>{systemStateLabel[s.state]}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
