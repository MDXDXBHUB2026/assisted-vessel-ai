import { useState } from 'react'
import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { HealthBadge, RiskBadge, Pill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SHORE_CASE_STATUS_LABELS, SHORE_FUNCTION_LABELS, type ShoreCase, type ShoreFunction } from '@/types'
import { Building2, Plus } from 'lucide-react'

const FUNCTIONS: ShoreFunction[] = ['marine_operations', 'technical_support', 'safety_support', 'fleet_performance']

export function ShoreCentrePage() {
  const fleet = useSimulationStore((s) => s.fleet)
  const shoreCases = useSimulationStore((s) => s.shoreCases)
  const createShoreCase = useSimulationStore((s) => s.createShoreCase)
  const updateShoreCase = useSimulationStore((s) => s.updateShoreCase)
  const [activeCase, setActiveCase] = useState<ShoreCase | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [guidance, setGuidance] = useState('')

  const openCases = shoreCases.filter((c) => c.status !== 'closed')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
            <Building2 size={18} className="text-info-400" /> Shore Assisted Operations Centre
          </h1>
          <p className="text-sm text-ink-500">Fleet operational picture and shore specialist support. Operational authority remains onboard.</p>
        </div>
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
          NEW SHORE ASSISTANCE REQUEST
        </Button>
      </div>

      <Panel title="Fleet Operational Picture">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-ink-500">
              <th className="pb-2 font-medium">Vessel</th>
              <th className="pb-2 font-medium">Mode</th>
              <th className="pb-2 font-medium">Assistance Status</th>
              <th className="pb-2 font-medium">Risk</th>
              <th className="pb-2 font-medium">Comms</th>
              <th className="pb-2 font-medium">Requests</th>
            </tr>
          </thead>
          <tbody>
            {fleet.map((v) => (
              <tr key={v.vesselId} className="border-t border-panel-border">
                <td className="py-2 font-medium text-ink-100">{v.name}</td>
                <td className="py-2 text-ink-400">{v.operationalMode}</td>
                <td className="py-2">
                  <HealthBadge level={v.assistanceMode} />
                </td>
                <td className="py-2">
                  <RiskBadge level={v.riskLevel} />
                </td>
                <td className="py-2">
                  <span className={v.communicationsOk ? 'text-healthy-400' : 'text-critical-400'}>{v.communicationsOk ? 'OK' : 'Degraded'}</span>
                </td>
                <td className="py-2 tabular-nums text-ink-400">{v.activeRequests}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {FUNCTIONS.map((fn) => (
          <Panel key={fn} title={SHORE_FUNCTION_LABELS[fn]} dense>
            <p className="text-xs text-ink-500">{openCases.filter((c) => c.function === fn).length} open case(s)</p>
          </Panel>
        ))}
      </div>

      <Panel title={`Shore Assistance Cases (${shoreCases.length})`}>
        {shoreCases.length === 0 ? (
          <p className="text-sm text-ink-500">No shore assistance cases yet. Request shore support from a recommendation, or create one manually.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {shoreCases.map((c) => (
              <button key={c.id} onClick={() => setActiveCase(c)} className="w-full rounded-sm border border-panel-border bg-panel-raised p-3 text-left transition-colors hover:border-info-500/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink-100">
                    {c.id} · {c.vesselName}
                  </span>
                  <div className="flex items-center gap-2">
                    <HealthBadge level={c.priority} />
                    <Pill tone="info">{SHORE_CASE_STATUS_LABELS[c.status]}</Pill>
                  </div>
                </div>
                <p className="mt-1 text-xs text-ink-400">
                  {SHORE_FUNCTION_LABELS[c.function]} · {c.reason}
                </p>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {activeCase && (
        <Modal title={`${activeCase.id} — ${activeCase.vesselName}`} onClose={() => setActiveCase(null)} wide>
          <div className="flex flex-col gap-3 text-sm">
            <Field label="Function" value={SHORE_FUNCTION_LABELS[activeCase.function]} />
            <Field label="Priority" value={activeCase.priority} />
            <Field label="Reason" value={activeCase.reason} />
            <Field label="Requested expertise" value={activeCase.requestedExpertise} />
            <Field label="Status" value={SHORE_CASE_STATUS_LABELS[activeCase.status]} />
            {activeCase.guidanceNotes && <Field label="Guidance provided" value={activeCase.guidanceNotes} />}
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-400">Guidance notes</label>
              <textarea value={guidance} onChange={(e) => setGuidance(e.target.value)} rows={2} className="w-full rounded-sm border border-hull-500/40 bg-hull-800 px-2.5 py-2 text-sm text-ink-100" />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-panel-border pt-3">
              <Button size="sm" variant="secondary" onClick={() => updateShoreCase(activeCase.id, 'accepted')}>ACCEPT CASE</Button>
              <Button size="sm" variant="ghost" onClick={() => updateShoreCase(activeCase.id, 'under_review')}>REVIEW EVIDENCE</Button>
              <Button size="sm" variant="primary" onClick={() => { updateShoreCase(activeCase.id, 'guidance_provided', guidance); setGuidance('') }}>PROVIDE GUIDANCE</Button>
              <Button size="sm" variant="secondary" onClick={() => updateShoreCase(activeCase.id, 'returned_to_vessel')}>RETURN TO VESSEL</Button>
              <Button size="sm" variant="danger" onClick={() => { updateShoreCase(activeCase.id, 'closed'); setActiveCase(null) }}>CLOSE CASE</Button>
            </div>
          </div>
        </Modal>
      )}

      {showCreate && (
        <CreateCaseModal
          onClose={() => setShowCreate(false)}
          onCreate={(input) => {
            createShoreCase(input)
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-0.5 capitalize text-ink-100">{value}</div>
    </div>
  )
}

function CreateCaseModal({ onClose, onCreate }: { onClose: () => void; onCreate: (input: { vesselId: string; vesselName: string; function: ShoreFunction; priority: 'healthy' | 'advisory' | 'warning' | 'critical'; reason: string; requestedExpertise: string }) => void }) {
  const [fn, setFn] = useState<ShoreFunction>('technical_support')
  const [priority, setPriority] = useState<'healthy' | 'advisory' | 'warning' | 'critical'>('warning')
  const [reason, setReason] = useState('Developing abnormal condition requiring specialist input.')
  const [expertise, setExpertise] = useState('Technical')

  return (
    <Modal title="New Shore Assistance Request" onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-400">Function</label>
          <select value={fn} onChange={(e) => setFn(e.target.value as ShoreFunction)} className="w-full rounded-sm border border-hull-500/40 bg-hull-800 px-2.5 py-2 text-sm text-ink-100">
            {FUNCTIONS.map((f) => (
              <option key={f} value={f}>
                {SHORE_FUNCTION_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-400">Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="w-full rounded-sm border border-hull-500/40 bg-hull-800 px-2.5 py-2 text-sm text-ink-100">
            <option value="advisory">Low</option>
            <option value="warning">High</option>
            <option value="critical">Urgent</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-400">Reason</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-sm border border-hull-500/40 bg-hull-800 px-2.5 py-2 text-sm text-ink-100" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-400">Requested expertise</label>
          <input value={expertise} onChange={(e) => setExpertise(e.target.value)} className="w-full rounded-sm border border-hull-500/40 bg-hull-800 px-2.5 py-2 text-sm text-ink-100" />
        </div>
        <Button
          variant="primary"
          onClick={() => onCreate({ vesselId: 'own', vesselName: 'MV Meridian Voyager', function: fn, priority, reason, requestedExpertise: expertise })}
        >
          SUBMIT REQUEST
        </Button>
      </div>
    </Modal>
  )
}
