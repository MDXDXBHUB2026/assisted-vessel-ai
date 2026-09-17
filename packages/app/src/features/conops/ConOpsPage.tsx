import { Panel } from '@/components/ui/Panel'
import { AssistanceLevelTag } from '@/components/ui/Badge'
import { ASSISTANCE_LEVEL_DESCRIPTIONS, ASSISTANCE_LEVEL_LABELS, type AssistanceLevel } from '@/types'
import { BookOpen, CheckCircle2, XCircle } from 'lucide-react'

const AI_CAN = ['Observe', 'Correlate', 'Detect', 'Predict', 'Optimise', 'Retrieve', 'Recommend', 'Explain']
const AI_CANNOT = ['Assume command', 'Override the Master', 'Silently control navigation', 'Silently change propulsion', 'Bypass safety constraints', 'Execute high-risk actions without authority']

const ASSISTANCE_LEVELS: AssistanceLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4']

const ROLES = [
  { role: 'Officer of the Watch', responsibility: 'Primary navigational watchkeeping; reviews navigation and collision-risk advisories.' },
  { role: 'Master', responsibility: 'Overall vessel authority; accepts, modifies or rejects high-risk and voyage-level recommendations.' },
  { role: 'Chief Engineer', responsibility: 'Machinery technical authority; reviews machinery and maintenance recommendations.' },
  { role: 'Technical Superintendent', responsibility: 'Shore-side technical authority for machinery condition, maintenance planning and technical support cases.' },
  { role: 'Marine Superintendent', responsibility: 'Shore-side marine operations authority for navigation and voyage support cases.' },
  { role: 'Safety Specialist', responsibility: 'Shore-side safety authority for hazard review and safety support cases.' },
  { role: 'Fleet Performance Specialist', responsibility: 'Reviews voyage, energy and operational-value trends across the fleet.' },
  { role: 'Systems Engineer', responsibility: 'Owns the engineering assurance programme: requirements, architecture, ODD definitions and V&V evidence.' },
  { role: 'Shore Marine Operations', responsibility: 'Fleet-level operational oversight and navigational support on request.' },
  { role: 'Shore Technical Support', responsibility: 'Specialist machinery and maintenance guidance on request.' },
  { role: 'Shore Safety Support', responsibility: 'Specialist safety guidance and incident support on request.' },
]

const MODES = ['Open Sea', 'Coastal', 'Traffic Separation', 'Congested Waters', 'Port Approach', 'Manoeuvring', 'Anchored', 'Alongside']

export function ConOpsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <BookOpen size={18} className="text-info-400" /> Concept of Operations
        </h1>
        <p className="text-sm text-ink-500">How functions, crew, shore roles and AI/automation interact under human operational authority.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="AI Can" action={<CheckCircle2 size={16} className="text-healthy-400" />}>
          <ul className="flex flex-col gap-1.5 text-sm text-ink-200">
            {AI_CAN.map((c) => (
              <li key={c} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-healthy-500" /> {c}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="AI Cannot" action={<XCircle size={16} className="text-critical-400" />}>
          <ul className="flex flex-col gap-1.5 text-sm text-ink-200">
            {AI_CANNOT.map((c) => (
              <li key={c} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-critical-500" /> {c}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Crew and Shore Roles">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r.role} className="rounded-sm border border-panel-border bg-panel-raised p-3">
              <div className="text-sm font-semibold text-ink-100">{r.role}</div>
              <p className="mt-1 text-xs text-ink-500">{r.responsibility}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Assistance Level Framework">
        <div className="flex flex-col gap-2">
          {ASSISTANCE_LEVELS.map((level) => (
            <div key={level} className="flex items-start gap-3 rounded-sm border border-panel-border bg-panel-raised p-3">
              <AssistanceLevelTag level={level} />
              <div>
                <div className="text-xs font-semibold text-ink-100">{ASSISTANCE_LEVEL_LABELS[level]}</div>
                <p className="mt-0.5 text-xs text-ink-500">{ASSISTANCE_LEVEL_DESCRIPTIONS[level]}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-ink-700">
          Each assisted function is assigned an assistance level independently (see Envelope &amp; Assistance). No function in this POC is configured above L3,
          and L4 is never reached for any function — it exists in the framework only as a documented future conceptual capability.
        </p>
      </Panel>

      <Panel title="Operating Modes">
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <span key={m} className="rounded border border-hull-500/40 bg-hull-800 px-2.5 py-1 text-xs text-ink-300">
              {m}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-500">Different assisted functions are available or restricted depending on operating mode — see Operational Envelope.</p>
      </Panel>

      <Panel title="Fallback Behaviour &amp; System Boundaries">
        <p className="text-sm text-ink-400">
          On degradation of a supporting condition (e.g. loss of ship-shore communications, GNSS confidence reduction, or sensor confidence falling below the
          required threshold for a given function), the affected system enters a DEGRADED, FALLBACK or CONTINGENCY state. Onboard assistance functions that
          do not depend on the degraded condition continue operating; shore-dependent functions become unavailable until the condition recovers. Every
          transition is recorded in the audit trail and clearly notified to the crew.
        </p>
      </Panel>
    </div>
  )
}
