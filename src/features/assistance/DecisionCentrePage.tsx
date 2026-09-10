import { useState } from 'react'
import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { RiskBadge, VerdictBadge, Pill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { AUTHORITY_LABELS, type Recommendation } from '@/types'
import { ClipboardCheck } from 'lucide-react'

const DECISION_LABELS: Record<string, string> = {
  awaiting_decision: 'Awaiting Decision',
  accepted: 'Accepted',
  modified: 'Modified',
  rejected: 'Rejected',
  info_requested: 'Info Requested',
  shore_support_requested: 'Shore Support Requested',
  expired: 'Expired',
}

export function DecisionCentrePage() {
  const recommendations = useSimulationStore((s) => s.recommendations)
  const decideRecommendation = useSimulationStore((s) => s.decideRecommendation)
  const [active, setActive] = useState<Recommendation | null>(null)
  const [comment, setComment] = useState('')

  const awaiting = recommendations.filter((r) => r.status === 'awaiting_decision')
  const decided = recommendations.filter((r) => r.status !== 'awaiting_decision')

  const decide = (decision: 'accepted' | 'modified' | 'rejected' | 'info_requested' | 'shore_support_requested') => {
    if (!active) return
    decideRecommendation(active.id, decision, comment || `${decision.replace(/_/g, ' ')} via Human Decision Centre`, active.requiredAuthority)
    setActive(null)
    setComment('')
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <ClipboardCheck size={18} className="text-info-400" /> Human Decision Centre
        </h1>
        <p className="text-sm text-ink-500">Every recommendation requires explicit human review. High-risk items are never automatically executed.</p>
      </div>

      <Panel title={`Awaiting Decision (${awaiting.length})`}>
        {awaiting.length === 0 ? (
          <p className="text-sm text-ink-500">No recommendations currently require a decision.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {awaiting.map((r) => (
              <RecommendationCard key={r.id} rec={r} onOpen={() => setActive(r)} />
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Decision History (${decided.length})`}>
        {decided.length === 0 ? (
          <p className="text-sm text-ink-500">No decisions recorded yet.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-ink-500">
                <th className="pb-2 font-medium">Recommendation</th>
                <th className="pb-2 font-medium">Decision</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Comment</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((r) => (
                <tr key={r.id} className="border-t border-panel-border">
                  <td className="py-2 font-medium text-ink-100">{r.title}</td>
                  <td className="py-2">
                    <Pill tone={r.status === 'accepted' ? 'healthy' : r.status === 'rejected' ? 'critical' : 'info'}>{DECISION_LABELS[r.status]}</Pill>
                  </td>
                  <td className="py-2 text-ink-400">{r.decidedByRole ? AUTHORITY_LABELS[r.decidedByRole] : '—'}</td>
                  <td className="py-2 text-ink-400">{r.decisionComment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {active && (
        <Modal title={active.title} onClose={() => setActive(null)} wide>
          <RecommendationDetail rec={active} />
          <div className="mt-4 border-t border-panel-border pt-4">
            <label className="mb-1 block text-xs font-medium text-ink-400">Decision comment</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-hull-500/40 bg-hull-800 px-2.5 py-2 text-sm text-ink-100"
              placeholder="Optional comment recorded to the audit trail"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="success" size="sm" onClick={() => decide('accepted')}>ACCEPT</Button>
              <Button variant="secondary" size="sm" onClick={() => decide('modified')}>MODIFY</Button>
              <Button variant="danger" size="sm" onClick={() => decide('rejected')}>REJECT</Button>
              <Button variant="ghost" size="sm" onClick={() => decide('info_requested')}>REQUEST MORE INFORMATION</Button>
              <Button variant="ghost" size="sm" onClick={() => decide('shore_support_requested')}>REQUEST SHORE SUPPORT</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function RecommendationCard({ rec, onOpen }: { rec: Recommendation; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="w-full rounded-md border border-panel-border bg-panel-raised p-3 text-left transition-colors hover:border-info-500/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink-100">{rec.title}</span>
        <div className="flex items-center gap-2">
          <RiskBadge level={rec.riskLevel} />
          <VerdictBadge verdict={rec.safetyValidation.verdict} />
        </div>
      </div>
      <p className="mt-1 text-xs text-ink-400">{rec.detectedCondition}</p>
      <p className="mt-1 text-[11px] text-ink-500">Requires: {AUTHORITY_LABELS[rec.requiredAuthority]} · Confidence {rec.confidencePercent}%</p>
    </button>
  )
}

function RecommendationDetail({ rec }: { rec: Recommendation }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <Field label="Recommendation ID" value={rec.id} />
        <Field label="Timestamp" value={rec.timestampIso.slice(0, 16).replace('T', ' ')} />
        <Field label="Vessel Function" value={rec.vesselFunction.replace(/_/g, ' ')} />
        <Field label="Confidence" value={`${rec.confidencePercent}%`} />
        <Field label="Model / Rule" value={rec.modelId} />
        <Field label="Required Authority" value={AUTHORITY_LABELS[rec.requiredAuthority]} />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-500">Detected Condition</div>
        <p className="mt-0.5 text-ink-100">{rec.detectedCondition}</p>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-500">Recommended Response</div>
        <p className="mt-0.5 text-ink-100">{rec.recommendedResponse}</p>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-500">Expected Benefit</div>
        <p className="mt-0.5 text-ink-100">{rec.expectedBenefit}</p>
      </div>
      <div className="rounded-md border border-panel-border bg-panel-raised p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Safety Validation</span>
          <VerdictBadge verdict={rec.safetyValidation.verdict} />
        </div>
        <ul className="flex flex-col gap-1">
          {rec.safetyValidation.checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2 text-xs">
              <span className={c.passed ? 'text-healthy-400' : 'text-critical-400'}>{c.passed ? '✓' : '✕'}</span>
              <span className="text-ink-300">
                {c.label} — <span className="text-ink-500">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        {rec.safetyValidation.reason && <p className="mt-2 text-xs text-warning-400">{rec.safetyValidation.reason}</p>}
      </div>
      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-500">Supporting Evidence</div>
        <ul className="flex flex-col gap-1">
          {rec.evidence.map((e) => (
            <li key={e.label} className="text-xs text-ink-300">
              <span className="font-medium text-ink-100">{e.label}:</span> {e.value} <span className="text-ink-500">({e.sourceSystem})</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-0.5 font-medium capitalize text-ink-100">{value}</div>
    </div>
  )
}
