import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { Pill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { AuditEventKind } from '@/types'
import { PENDING_HASH, verifyChain, type ChainVerification } from '@ave/core-domain/auditChain'
import { History, ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react'

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
  hazard_lifecycle: 'Hazard Lifecycle',
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
  hazard_lifecycle: 'warning',
}

/** Short, human-checkable hash prefix — enough to see the chain is real without printing 64 hex
 * characters per row. `PENDING_HASH` renders as "pending", never as a misleadingly short hash. */
function hashPrefix(hash: string): string {
  return hash === PENDING_HASH ? 'pending' : hash.slice(0, 8)
}

function ChainIntegrityPanel() {
  const events = useSimulationStore((s) => s.auditEvents)
  const checkpoint = useSimulationStore((s) => s.auditChainCheckpoint)
  const evictedThroughSeq = useSimulationStore((s) => s.evictedThroughSeq)
  const [verification, setVerification] = useState<ChainVerification | null>(null)
  const [verifying, setVerifying] = useState(false)

  const sealedInWindow = useMemo(() => events.filter((e) => e.hash !== PENDING_HASH).length, [events])
  const pending = events.length - sealedInWindow

  // A generation counter is what makes overlapping passes SAFE (a superseded pass's result is
  // discarded rather than momentarily flashing a stale verdict) — deliberately the ONLY guard.
  // An earlier draft also gated on `verifying` ("don't start a second pass while one is in
  // flight"), but that just re-creates H2's dropped-trigger bug one layer up: a trigger arriving
  // mid-verification was silently discarded rather than queued, so the indicator could keep
  // showing a verdict computed against an older chain. The generation counter alone already
  // makes running concurrently safe — there is no shared mutable state to corrupt, only a
  // result to keep or discard — so there is nothing to gate.
  const generationRef = useRef(0)

  const runVerification = useCallback(async () => {
    const generation = ++generationRef.current
    setVerifying(true)
    try {
      const result = await verifyChain(events, checkpoint, evictedThroughSeq)
      if (generation === generationRef.current) setVerification(result)
    } finally {
      if (generation === generationRef.current) setVerifying(false)
    }
  }, [events, checkpoint, evictedThroughSeq])

  // Re-verify automatically on any change to the trail's content — keyed on `events`/`checkpoint`
  // IDENTITY, not on a narrower summary like `events.length`/`checkpoint.sealedThroughSeq`: an
  // in-place mutation of an already-sealed record (exactly what acceptance tests (a)/(d2)/(d3)
  // simulate — the actual threat model this panel exists to catch) changes neither of those
  // counters, so keying on them would make the panel blind to the one thing it is for. The real
  // cost problem is that engine.ts rebuilds `auditEvents` every 1Hz tick regardless of whether
  // the tick produced an audit event, which would otherwise re-run a full sequential re-hash of
  // the whole visible chain once a second — solved below by THROTTLING how often that identity
  // change actually triggers a pass, not by narrowing what counts as a change.
  const lastRunAtRef = useRef(0)
  const AUTO_VERIFY_THROTTLE_MS = 5_000
  useEffect(() => {
    const elapsed = Date.now() - lastRunAtRef.current
    if (elapsed >= AUTO_VERIFY_THROTTLE_MS) {
      lastRunAtRef.current = Date.now()
      void runVerification()
      return
    }
    // Trailing call: guarantees the LAST change in a burst still gets verified (rather than only
    // ever the first one in each throttle window), which matters most right after a session goes
    // idle/paused — exactly when nothing else will trigger another pass.
    const timer = setTimeout(() => {
      lastRunAtRef.current = Date.now()
      void runVerification()
    }, AUTO_VERIFY_THROTTLE_MS - elapsed)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately narrower than runVerification's own closure — see comment above.
  }, [events, checkpoint, evictedThroughSeq])

  const verified = verification?.valid === true

  return (
    <Panel
      title="Chain Integrity"
      action={
        <Button size="sm" variant="ghost" icon={<RefreshCw size={12} className={verifying ? 'animate-spin' : ''} />} onClick={() => void runVerification()} disabled={verifying} data-testid="verify-chain-button">
          Verify chain
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2" data-testid="chain-integrity-status" data-chain-valid={verification === null ? 'unknown' : String(verification.valid)}>
          {verification === null ? (
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">Verifying…</span>
          ) : verified ? (
            <>
              <ShieldCheck size={18} className="text-healthy-400" />
              <span className="text-sm font-bold uppercase tracking-widest text-healthy-400">Chain Verified</span>
            </>
          ) : (
            <>
              <ShieldAlert size={18} className="text-critical-400" />
              <span className="text-sm font-bold uppercase tracking-widest text-critical-400">Chain Broken</span>
            </>
          )}
        </div>

        {verification && !verified && (
          <div className="rounded-sm border border-critical-500/30 bg-critical-500/10 px-3 py-2 text-xs text-critical-400">
            First broken at seq {verification.firstBrokenSeq}: {verification.reason}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-ink-400 sm:grid-cols-4">
          <dt className="text-ink-700">Sealed</dt>
          <dd className="tabular-nums text-ink-100" data-testid="chain-sealed-count">
            {sealedInWindow}
          </dd>
          <dt className="text-ink-700">Pending</dt>
          <dd className="tabular-nums text-ink-100" data-testid="chain-pending-count">
            {pending}
          </dd>
          <dt className="text-ink-700">Retention boundary</dt>
          <dd className="tabular-nums text-ink-100">{checkpoint.sealedCount} ever sealed</dd>
          <dt className="text-ink-700">Sealed through</dt>
          <dd className="tabular-nums text-ink-100">seq {checkpoint.sealedThroughSeq}</dd>
          <dt className="text-ink-700">Evicted through</dt>
          <dd className="tabular-nums text-ink-100" data-testid="chain-evicted-through-seq">{evictedThroughSeq === 0 ? 'none' : `seq ${evictedThroughSeq}`}</dd>
        </dl>

        <p className="text-[11px] leading-relaxed text-ink-700">
          Tamper-evident, not signed: each record's hash covers its own content and the previous record's hash (SHA-256), so altering, deleting or reordering a sealed record breaks the chain from that
          point forward. This does not establish who wrote a record — that requires identity and signing (Phase 2C).
        </p>
      </div>
    </Panel>
  )
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

      <ChainIntegrityPanel />

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
                  <span className="font-mono text-[10px] text-ink-700" title={e.hash === PENDING_HASH ? 'Not yet sealed' : e.hash}>
                    #{e.seq} · {hashPrefix(e.hash)}
                  </span>
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
