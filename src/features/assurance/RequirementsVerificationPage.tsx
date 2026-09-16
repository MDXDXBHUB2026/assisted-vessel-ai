import { Panel } from '@/components/ui/Panel'
import { TRACEABILITY_ROWS } from '@/data/traceability'
import type { VerificationStatus } from '@/types'
import { ClipboardCheck } from 'lucide-react'

/**
 * Verification status is rendered distinctly rather than colouring every row green. A matrix
 * that presents intended coverage identically to achieved coverage overstates its own evidence,
 * which is the one thing an assurance artifact must never do.
 */
const VERIFICATION_STATUS_STYLE: Record<VerificationStatus, { label: string; badge: string; text: string }> = {
  verified: { label: 'VERIFIED', badge: 'bg-healthy-500/15 text-healthy-400', text: 'text-healthy-400' },
  partial: { label: 'PARTIAL', badge: 'bg-warning-500/15 text-warning-400', text: 'text-warning-400' },
  not_verified: { label: 'NOT VERIFIED', badge: 'bg-critical-500/15 text-critical-400', text: 'text-ink-400' },
}

export function RequirementsVerificationPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <ClipboardCheck size={18} className="text-info-400" /> Requirements &amp; Verification
        </h1>
        <p className="text-sm text-ink-500">
          Business Objective → Operational Requirement → System Requirement → Use Case → Hazard/Constraint → Component → Test Scenario → Verification
          Evidence, for every function this POC demonstrates.
        </p>
      </div>

      <Panel title={`Traceability (${TRACEABILITY_ROWS.length} rows)`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-[11px]">
            <thead>
              <tr className="text-ink-500">
                <th className="pb-2 pr-3 font-medium">Business Objective</th>
                <th className="pb-2 pr-3 font-medium">Operational Requirement</th>
                <th className="pb-2 pr-3 font-medium">System Req.</th>
                <th className="pb-2 pr-3 font-medium">Use Case</th>
                <th className="pb-2 pr-3 font-medium">Hazard / Constraint</th>
                <th className="pb-2 pr-3 font-medium">Component</th>
                <th className="pb-2 pr-3 font-medium">Test Scenario</th>
                <th className="pb-2 font-medium">Verification Status &amp; Evidence</th>
              </tr>
            </thead>
            <tbody>
              {TRACEABILITY_ROWS.map((row, i) => (
                <tr key={i} className="border-t border-panel-border align-top">
                  <td className="py-2 pr-3 text-ink-100">{row.businessObjective}</td>
                  <td className="py-2 pr-3 text-ink-300">{row.operationalRequirement}</td>
                  <td className="py-2 pr-3 text-ink-400">{row.systemRequirement}</td>
                  <td className="py-2 pr-3 text-ink-400">{row.useCase}</td>
                  <td className="py-2 pr-3 text-warning-400">{row.hazardOrConstraint}</td>
                  <td className="py-2 pr-3 font-mono text-[10px] text-ink-500">{row.component}</td>
                  <td className="py-2 pr-3 text-ink-400">{row.testScenario}</td>
                  <td className="py-2">
                    <span className={`mr-2 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${VERIFICATION_STATUS_STYLE[row.verificationStatus].badge}`}>
                      {VERIFICATION_STATUS_STYLE[row.verificationStatus].label}
                    </span>
                    <span className={VERIFICATION_STATUS_STYLE[row.verificationStatus].text}>{row.verificationEvidence}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
