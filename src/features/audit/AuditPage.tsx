import { useMemo, useState } from 'react'
import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { Pill } from '@/components/ui/Badge'
import type { AuditEventKind } from '@/types'
import { History } from 'lucide-react'

const KIND_LABELS: Record<AuditEventKind, string> = {
  scenario: 'Scenario',
  mode_change: 'Mode Change',
  recommendation_generated: 'Recommendation',
  safety_validation: 'Safety Validation',
  human_decision: 'Human Decision',
  alarm: 'Alarm',
  system_state_change: 'System State',
  shore_case: 'Shore Case',
  simulation: 'Simulation',
  assistance_level_change: 'Assistance Level',
  fallback_transition: 'Fallback',
}

const KIND_TONE: Record<AuditEventKind, 'neutral' | 'info' | 'healthy' | 'warning' | 'critical'> = {
  scenario: 'info',
  mode_change: 'neutral',
  recommendation_generated: 'info',
  safety_validation: 'warning',
  human_decision: 'healthy',
  alarm: 'critical',
  system_state_change: 'warning',
  shore_case: 'info',
  simulation: 'neutral',
  assistance_level_change: 'info',
  fallback_transition: 'warning',
}

export function AuditPage() {
  const events = useSimulationStore((s) => s.auditEvents)
  const [filter, setFilter] = useState<AuditEventKind | 'all'>('all')

  const filtered = useMemo(() => (filter === 'all' ? events : events.filter((e) => e.kind === filter)), [events, filter])

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <History size={18} className="text-info-400" /> Decision Audit Trail
        </h1>
        <p className="text-sm text-ink-500">Persistent chronological record of scenarios, recommendations, safety validation and human decisions for this session.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
        {(Object.keys(KIND_LABELS) as AuditEventKind[]).map((k) => (
          <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)} label={KIND_LABELS[k]} />
        ))}
      </div>

      <Panel title={`Timeline (${filtered.length} events)`}>
        <ol className="flex flex-col gap-3">
          {filtered.map((e) => (
            <li key={e.id} className="flex gap-3 border-b border-panel-border/60 pb-3 last:border-0">
              <div className="w-24 shrink-0 text-[11px] tabular-nums text-ink-500">{e.timestampIso.slice(0, 16).replace('T', ' ')}</div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={KIND_TONE[e.kind]}>{KIND_LABELS[e.kind]}</Pill>
                  <span className="text-xs text-ink-500">{e.operatingMode}</span>
                  {e.scenarioId && <span className="text-xs text-ink-700">· {e.scenarioId.replace(/_/g, ' ')}</span>}
                </div>
                <p className="mt-1 text-sm text-ink-100">{e.event}</p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-500">
                  {e.modelOrRuleId && <span>Model: {e.modelOrRuleId}</span>}
                  {e.confidencePercent !== undefined && <span>Confidence: {e.confidencePercent}%</span>}
                  {e.safetyValidationResult && <span>Safety: {e.safetyValidationResult}</span>}
                  {e.humanDecision && <span>Decision: {e.humanDecision.replace(/_/g, ' ')}</span>}
                  {e.responsibleRole && <span>Role: {e.responsibleRole.replace(/_/g, ' ')}</span>}
                  {e.outcome && <span>Outcome: {e.outcome}</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  )
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active ? 'border-info-500/50 bg-info-500/10 text-info-400' : 'border-hull-500/40 text-ink-400 hover:text-ink-100'}`}
    >
      {label}
    </button>
  )
}
