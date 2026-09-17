import { useState } from 'react'
import { Panel } from '@/components/ui/Panel'
import { Network } from 'lucide-react'

interface Layer {
  title: string
  items: string[]
  detail: string
}

const LAYERS: Layer[] = [
  { title: 'Vessel Systems', items: ['AIS', 'GNSS', 'Radar', 'ECDIS / Route Information', 'Engine', 'AMS / IAS', 'Electrical Power', 'Fuel', 'PMS', 'Cargo', 'Reefers', 'Safety Systems', 'Sensors'], detail: 'Conceptual onboard equipment interfaces. In this prototype these are represented by the synthetic Vessel Data Simulator, not real equipment connections.' },
  { title: 'Vessel Integration Gateway', items: ['Protocol normalisation', 'Time synchronisation', 'Data quality tagging'], detail: 'Conceptual boundary where heterogeneous vessel system data would be collected and normalised before onward processing.' },
  { title: 'Standardised Maritime Data Layer', items: ['Common data model', 'Sensor confidence metadata'], detail: 'A common, vendor-neutral representation of vessel data — the foundation that all higher layers reason over.' },
  { title: 'Vessel Operational State / Digital Twin', items: ['Live system health', 'Position & voyage state', 'Cargo & safety state'], detail: 'The current operational picture of the vessel used throughout the application — implemented in this prototype as the simulation state store.' },
  { title: 'Rule Engine / Analytics / ML / Optimisation', items: ['Machinery anomaly detection', 'Predictive maintenance', 'Voyage & energy optimisation', 'Alarm correlation'], detail: 'Deterministic rules and illustrative analytics models that transform vessel state into candidate insights and recommendations.' },
  { title: 'Decision Fusion', items: ['Cross-domain prioritisation', 'Duplicate suppression'], detail: 'Combines candidate outputs from multiple analytics sources into a coherent set of recommendations.' },
  { title: 'Safety Assurance', items: ['Operational envelope (ODD) checks', 'Authority gating', 'PASSED / CONDITIONAL / BLOCKED verdicts'], detail: 'An independent deterministic layer that gates what may ever be presented as an actionable recommendation.' },
  { title: 'Assistance Manager', items: ['Recommendation lifecycle', 'Escalation to shore'], detail: 'Manages the lifecycle of a recommendation from generation through human decision to outcome.' },
  { title: 'Crew HMI', items: ['Assisted Console', 'Digital Twin', 'Decision Centre'], detail: 'The onboard human-machine interface surfaces recommendations, evidence and system state for crew review.' },
  { title: 'Human Operational Authority', items: ['Officer of the Watch', 'Master', 'Chief Engineer'], detail: 'All consequential decisions are made by qualified humans. The system never bypasses this layer.' },
  { title: 'Secure Ship-Shore Synchronisation', items: ['Encrypted link (conceptual)', 'Store-and-forward on link loss'], detail: 'Conceptual secure channel synchronising operational state and cases between ship and shore.' },
  { title: 'Shore Assisted Operations', items: ['Marine Operations', 'Technical Support', 'Safety Support', 'Fleet Performance'], detail: 'Shore specialists who can review evidence and provide guidance — never override onboard authority.' },
]

export function ArchitecturePage() {
  const [open, setOpen] = useState<string | null>(LAYERS[0]?.title ?? null)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <Network size={18} className="text-info-400" /> System Architecture
        </h1>
        <p className="text-sm text-ink-500">Conceptual layered architecture. All external equipment connections are conceptual interfaces in this prototype.</p>
      </div>

      <div className="flex flex-col gap-2">
        {LAYERS.map((layer, i) => (
          <div key={layer.title}>
            <button
              onClick={() => setOpen(open === layer.title ? null : layer.title)}
              className={`w-full rounded-sm border p-4 text-left transition-colors ${open === layer.title ? 'border-info-500/50 bg-info-500/5' : 'border-panel-border bg-panel hover:border-hull-500/60'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-100">{i + 1}. {layer.title}</span>
                <span className="text-xs text-ink-500">{layer.items.length} elements</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {layer.items.map((it) => (
                  <span key={it} className="rounded border border-hull-500/40 bg-hull-800 px-2 py-0.5 text-[11px] text-ink-300">
                    {it}
                  </span>
                ))}
              </div>
              {open === layer.title && <p className="mt-3 border-t border-panel-border pt-3 text-xs text-ink-400">{layer.detail}</p>}
            </button>
            {i < LAYERS.length - 1 && <div className="ml-6 h-3 border-l border-dashed border-hull-500/40" />}
          </div>
        ))}
      </div>

      <Panel title="Reading this diagram">
        <p className="text-sm text-ink-400">
          Data flows downward from vessel systems through progressively higher levels of abstraction and reasoning, is gated by an independent safety
          assurance layer, and is always presented to human operational authority before any consequential action. Ship-shore synchronisation extends the
          same decision chain to shore-based specialists without removing onboard authority.
        </p>
      </Panel>
    </div>
  )
}
