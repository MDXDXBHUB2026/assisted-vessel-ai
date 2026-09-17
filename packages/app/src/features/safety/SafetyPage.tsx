import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { RiskBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { RiskMatrix } from '@/components/charts/RiskMatrix'
import { allTransitions, ageMinutes, escalationPath, HAZARD_ACTION_LABELS, HAZARD_STATUS_LABELS, nextRequiredAction, type HazardAction } from '@ave/decision-engine/hazardLifecycle'
import { riskBand, riskBandToRiskLevel, targetResponseLabel, RISK_BAND_THRESHOLDS, type RiskBand } from '@ave/decision-engine/riskMatrix'
import { AUTHORITY_LABELS, REQUIRED_AUTHORITIES, type HazardCategory, type HazardStatus, type RequiredAuthority } from '@/types'
import { formatDuration } from '@/utils/format'
import { ShieldAlert, AlertTriangle, ArrowUpRight } from 'lucide-react'

const CATEGORY_LABELS: Record<HazardCategory, string> = {
  navigation: 'Navigation',
  machinery: 'Machinery',
  cargo: 'Cargo',
  personnel: 'Personnel',
  environmental: 'Environmental',
  security: 'Security',
}

const STATUS_FILTERS: (HazardStatus | 'all')[] = ['all', 'identified', 'acknowledged', 'assigned', 'under_investigation', 'corrective_action', 'escalated', 'closed']
const BAND_FILTERS: (RiskBand | 'all')[] = ['all', 'acceptable', 'alarp', 'intolerable']
const SORT_KEYS = ['risk', 'age', 'status'] as const
type SortKey = (typeof SORT_KEYS)[number]

export function SafetyPage() {
  const hazards = useSimulationStore((s) => s.hazards)
  const recommendations = useSimulationStore((s) => s.recommendations)
  const rawAlarms = useSimulationStore((s) => s.rawAlarms)
  const auditEvents = useSimulationStore((s) => s.auditEvents)
  const simTimeIso = useSimulationStore((s) => s.snapshot.simTimeIso)
  const transitionHazard = useSimulationStore((s) => s.transitionHazard)

  const [selectedId, setSelectedId] = useState<string | null>(hazards[0]?.id ?? null)
  const [statusFilter, setStatusFilter] = useState<HazardStatus | 'all'>('all')
  const [bandFilter, setBandFilter] = useState<RiskBand | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<HazardCategory | 'all'>('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [ownerFilter, setOwnerFilter] = useState<RequiredAuthority | 'unassigned' | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('risk')
  const [actorRole, setActorRole] = useState<RequiredAuthority>('officer_of_the_watch')
  const [noteDraft, setNoteDraft] = useState('')
  const [targetRoleDraft, setTargetRoleDraft] = useState<RequiredAuthority>('master')

  const enriched = useMemo(
    () =>
      hazards.map((h) => ({
        hazard: h,
        band: riskBand(h.residualRisk.riskIndex),
        age: ageMinutes(h.raisedAtIso, simTimeIso),
        next: nextRequiredAction(h, simTimeIso),
      })),
    [hazards, simTimeIso],
  )

  const filtered = enriched.filter(({ hazard, band, next }) => {
    if (statusFilter !== 'all' && hazard.status !== statusFilter) return false
    if (bandFilter !== 'all' && band !== bandFilter) return false
    if (categoryFilter !== 'all' && hazard.category !== categoryFilter) return false
    if (overdueOnly && !next?.overdue) return false
    if (ownerFilter !== 'all' && (hazard.owner?.role ?? 'unassigned') !== ownerFilter) return false
    return true
  })

  const ownerOptions: (RequiredAuthority | 'unassigned')[] = [...new Set(hazards.map((h) => h.owner?.role ?? 'unassigned'))]

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'risk') return b.hazard.residualRisk.riskIndex - a.hazard.residualRisk.riskIndex
    if (sortKey === 'age') return b.age - a.age
    return a.hazard.status.localeCompare(b.hazard.status)
  })

  const bandCounts: Record<RiskBand, number> = { acceptable: 0, alarp: 0, intolerable: 0 }
  const statusCounts: Partial<Record<HazardStatus, number>> = {}
  let overdueCount = 0
  for (const { hazard, band, next } of enriched) {
    bandCounts[band]++
    statusCounts[hazard.status] = (statusCounts[hazard.status] ?? 0) + 1
    if (next?.overdue) overdueCount++
  }

  const selected = hazards.find((h) => h.id === selectedId) ?? null
  const selectedRec = selected?.recommendationId ? recommendations.find((r) => r.id === selected.recommendationId) : undefined
  const selectedAlarms = selected ? rawAlarms.filter((a) => selected.correlatedAlarmTags?.includes(a.tag)) : []
  const selectedAudit = selected ? auditEvents.filter((e) => e.hazardId === selected.id) : []
  const selectedNext = selected ? nextRequiredAction(selected, simTimeIso) : null
  const selectedAge = selected ? ageMinutes(selected.raisedAtIso, simTimeIso) : 0
  const selectedIntolerable = selected ? riskBand(selected.residualRisk.riskIndex) === 'intolerable' : false

  const performAction = (action: HazardAction) => {
    if (!selected) return
    transitionHazard(selected.id, action, actorRole, {
      note: noteDraft || undefined,
      ownerRole: targetRoleDraft,
      correctiveActionDescription: noteDraft || undefined,
      verificationNote: noteDraft || undefined,
      escalatedToRole: targetRoleDraft,
    })
    setNoteDraft('')
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <ShieldAlert size={18} className="text-info-400" /> Safety Intelligence
        </h1>
        <p className="text-sm text-ink-500">
          IMO Formal Safety Assessment (MSC-MEPC.2/Circ.12/Rev.2) risk indices and the ISM Code hazard lifecycle, applied to synthetic hazards for legibility and credibility only — not a certified safety management system.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <SummaryTile label="Acceptable" value={bandCounts.acceptable} tone="healthy" />
        <SummaryTile label="ALARP" value={bandCounts.alarp} tone="warning" />
        <SummaryTile label="Intolerable" value={bandCounts.intolerable} tone="critical" />
        <SummaryTile label="Open" value={hazards.filter((h) => h.status !== 'closed').length} tone="info" />
        <SummaryTile label="Escalated" value={statusCounts.escalated ?? 0} tone="warning" />
        <SummaryTile label="Closed" value={statusCounts.closed ?? 0} tone="healthy" />
        <SummaryTile label="Overdue" value={overdueCount} tone={overdueCount > 0 ? 'critical' : 'healthy'} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Register */}
        <Panel title="Hazard Register" subtitle={`${sorted.length} of ${hazards.length} hazards`} dense>
          <div className="mb-3 flex flex-wrap gap-2 text-[10px]">
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTERS.map((s) => ({ value: s, label: s === 'all' ? 'All' : HAZARD_STATUS_LABELS[s] }))} />
            <FilterSelect label="Band" value={bandFilter} onChange={setBandFilter} options={BAND_FILTERS.map((b) => ({ value: b, label: b === 'all' ? 'All' : RISK_BAND_THRESHOLDS[b].label }))} />
            <FilterSelect<HazardCategory | 'all'>
              label="Category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[{ value: 'all', label: 'All' }, ...(Object.entries(CATEGORY_LABELS) as [HazardCategory, string][]).map(([value, label]) => ({ value, label }))]}
            />
            <FilterSelect<RequiredAuthority | 'unassigned' | 'all'>
              label="Owner"
              value={ownerFilter}
              onChange={setOwnerFilter}
              options={[{ value: 'all', label: 'All' }, ...ownerOptions.map((o) => ({ value: o, label: o === 'unassigned' ? 'Unassigned' : AUTHORITY_LABELS[o] }))]}
            />
            <FilterSelect label="Sort" value={sortKey} onChange={setSortKey} options={SORT_KEYS.map((k) => ({ value: k, label: k === 'risk' ? 'Risk (RI)' : k === 'age' ? 'Age' : 'Status' }))} />
            <label className="flex items-center gap-1 rounded border border-panel-border px-2 py-1 text-ink-300">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Overdue only
            </label>
          </div>

          {sorted.length === 0 ? (
            <p className="text-xs text-ink-500">No hazards match the current filters.</p>
          ) : (
            <div className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto pr-1">
              {sorted.map(({ hazard, band, age, next }) => (
                <button
                  key={hazard.id}
                  onClick={() => setSelectedId(hazard.id)}
                  data-testid={`hazard-row-${hazard.id}`}
                  data-selected={hazard.id === selectedId}
                  className={`flex flex-col gap-1 rounded-sm border px-2.5 py-2 text-left text-xs transition-colors ${hazard.id === selectedId ? 'border-info-500/60 bg-info-500/10' : 'border-panel-border bg-panel-raised hover:border-hull-400'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-ink-100">{hazard.title}</span>
                    <RiskBadge level={riskBandToRiskLevel(hazard.residualRisk.riskIndex)} label={`RI ${hazard.residualRisk.riskIndex}`} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-ink-500">
                    <span>{CATEGORY_LABELS[hazard.category]}</span>
                    <span>{HAZARD_STATUS_LABELS[hazard.status]}</span>
                    <span>Age {formatDuration(age)}</span>
                    {next?.overdue && (
                      <span className="flex items-center gap-0.5 font-semibold text-critical-400">
                        <AlertTriangle size={10} /> OVERDUE
                      </span>
                    )}
                    {band === 'intolerable' && <span className="font-semibold text-critical-400">MASTER DECISION</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* Matrix */}
        <Panel title="Risk Matrix" subtitle="FSA Frequency Index x Severity Index — every open hazard plotted" dense>
          <div className="aspect-[720/430] w-full">
            {/* Every OPEN hazard is plotted (spec §3.4/§7.3) — a closed hazard's history doesn't
                belong on the live risk picture, though it remains visible in the register list. */}
            <RiskMatrix hazards={hazards.filter((h) => h.status !== 'closed')} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </Panel>
      </div>

      {/* Selected hazard detail */}
      {selected && selectedNext ? (
        <Panel
          title={selected.title}
          subtitle={`${CATEGORY_LABELS[selected.category]} · Raised ${selected.raisedAtIso.slice(0, 16).replace('T', ' ')} UTC · Age ${formatDuration(selectedAge)}`}
          action={
            <div className="flex items-center gap-2">
              <RiskBadge level={riskBandToRiskLevel(selected.initialRisk.riskIndex)} label={`Initial RI ${selected.initialRisk.riskIndex}`} />
              <ArrowUpRight size={12} className="text-ink-500" />
              <RiskBadge level={riskBandToRiskLevel(selected.residualRisk.riskIndex)} label={`Residual RI ${selected.residualRisk.riskIndex}`} />
            </div>
          }
        >
          {selectedIntolerable && (
            <div className="mb-3 rounded-sm border border-critical-500/40 bg-critical-500/10 px-3 py-2 text-xs font-medium text-critical-400">
              Residual risk is in the Intolerable band (RI {selected.residualRisk.riskIndex}) — ISM 5.2 gives the Master overriding authority. Escalation and closure require the Master's decision.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Time / ownership / next steps */}
            <div className="flex flex-col gap-2 text-xs">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Time &amp; Ownership</div>
              <Row label="Target response" value={targetResponseLabel(selected.residualRisk.riskIndex)} />
              <Row label="Due" value={selectedNext.overdue ? 'OVERDUE' : selectedNext.dueAtIso.slice(0, 16).replace('T', ' ') + ' UTC'} tone={selectedNext.overdue ? 'critical' : undefined} />
              <Row label="Owner" value={selected.owner ? `${AUTHORITY_LABELS[selected.owner.role]} (assigned ${selected.owner.assignedAtIso.slice(0, 16).replace('T', ' ')})` : 'Unassigned'} />
              <div className="rounded-sm border border-info-500/30 bg-info-500/5 px-2 py-1.5 text-info-400">
                <span className="font-semibold uppercase">Next required action:</span> {selectedNext.imperative || 'None — closed.'}
                {selectedNext.ownerRole !== 'unassigned' && <span> ({AUTHORITY_LABELS[selectedNext.ownerRole]})</span>}
              </div>
              <Row label="Escalation path" value={AUTHORITY_LABELS[escalationPath(selected)]} />
              {selected.escalation && <Row label="Escalated to" value={`${AUTHORITY_LABELS[selected.escalation.escalatedToRole]} — "${selected.escalation.note}"`} />}
              {selected.correctiveAction && <Row label="Corrective action" value={selected.correctiveAction.description} />}
              {selected.verification && <Row label="Verification" value={selected.verification.note} />}
              <Row label="Immediate mitigation" value={selected.immediateMitigation} />
              <Row label="Recommended corrective action" value={selected.recommendedCorrectiveAction} />
            </div>

            {/* Linkage */}
            <div className="flex flex-col gap-2 text-xs">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Decision Chain</div>
              {selectedRec ? (
                <Link to="/vessel/decisions" className="flex items-center gap-1 rounded-sm border border-panel-border bg-panel-raised px-2 py-1.5 text-info-400 hover:border-info-500/50">
                  <ArrowUpRight size={11} /> Recommendation: {selectedRec.title}
                </Link>
              ) : (
                <p className="text-ink-600">No recommendation linked.</p>
              )}
              {selectedAlarms.length > 0 ? (
                <Link to="/vessel/alarms" className="flex flex-col gap-1 rounded-sm border border-panel-border bg-panel-raised px-2 py-1.5 text-info-400 hover:border-info-500/50">
                  {selectedAlarms.map((a) => (
                    <span key={a.id} className="flex items-center gap-1">
                      <ArrowUpRight size={11} /> Alarm: {a.description}
                    </span>
                  ))}
                </Link>
              ) : (
                <p className="text-ink-600">No correlated alarms.</p>
              )}
              <Link to="/vessel/audit" className="flex items-center gap-1 rounded-sm border border-panel-border bg-panel-raised px-2 py-1.5 text-info-400 hover:border-info-500/50">
                <ArrowUpRight size={11} /> {selectedAudit.length} audit {selectedAudit.length === 1 ? 'entry' : 'entries'} for this hazard
              </Link>
            </div>

            {/* Lifecycle actions */}
            <div className="flex flex-col gap-2 text-xs">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Lifecycle</div>
              <div className="flex items-center gap-1">
                <span className="text-ink-500">Acting as</span>
                <select value={actorRole} onChange={(e) => setActorRole(e.target.value as RequiredAuthority)} className="rounded border border-panel-border bg-hull-800 px-1 py-0.5 text-ink-100" data-testid="hazard-actor-role">
                  {REQUIRED_AUTHORITIES.map((r) => (
                    <option key={r} value={r}>
                      {AUTHORITY_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Note / corrective action description / verification note — used by whichever action below you take"
                className="min-h-[52px] rounded-sm border border-panel-border bg-hull-800 px-2 py-1 text-ink-100 placeholder:text-ink-700"
              />
              <div className="flex items-center gap-1">
                <span className="text-ink-500">Target role (assign / escalate)</span>
                <select value={targetRoleDraft} onChange={(e) => setTargetRoleDraft(e.target.value as RequiredAuthority)} className="rounded border border-panel-border bg-hull-800 px-1 py-0.5 text-ink-100">
                  {REQUIRED_AUTHORITIES.map((r) => (
                    <option key={r} value={r}>
                      {AUTHORITY_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                {allTransitions(selected, actorRole).map((t) => (
                  <div key={t.action}>
                    <Button size="sm" variant={t.action === 'escalate' ? 'danger' : t.action === 'verify_effectiveness' ? 'success' : 'secondary'} disabled={!t.allowed} onClick={() => performAction(t.action)} className="w-full justify-center" data-testid={`hazard-action-${t.action}`}>
                      {HAZARD_ACTION_LABELS[t.action]}
                    </Button>
                    {!t.allowed && (
                      <p className="mt-0.5 text-[10px] text-ink-600" data-testid={`hazard-action-${t.action}-reason`}>
                        {t.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel>
          <p className="text-sm text-ink-500">Select a hazard from the register or the matrix to see its full lifecycle, ownership and decision-chain linkage.</p>
        </Panel>
      )}
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'critical' }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-panel-border/60 pb-1.5 last:border-0">
      <span className="shrink-0 text-ink-500">{label}</span>
      <span className={`text-right font-medium ${tone === 'critical' ? 'text-critical-400' : 'text-ink-100'}`}>{value}</span>
    </div>
  )
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: 'healthy' | 'warning' | 'critical' | 'info' }) {
  const tones: Record<string, string> = { healthy: 'text-healthy-400', warning: 'text-warning-400', critical: 'text-critical-400', info: 'text-info-400' }
  return (
    <div className="rounded-sm border border-panel-border bg-panel px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  )
}

function FilterSelect<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <label className="flex items-center gap-1 rounded border border-panel-border px-2 py-1 text-ink-300">
      <span className="text-ink-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="bg-transparent text-ink-100">
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-hull-800">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
