import { Link } from 'react-router-dom'
import { MonitorSmartphone, ArrowLeft } from 'lucide-react'
import { BUILD_SHA, BUILD_TIME_ISO } from '@/buildInfo'
import { CONSOLE_MIN_WIDTH_PX } from '@/layouts/consoleBreakpoint'

/**
 * Shown in place of the operations console below CONSOLE_MIN_WIDTH_PX — see docs/assumptions.md.
 * This is a deliberate gate, not a missing responsive layout: the console is a dense multi-panel
 * real-time instrument, and a phone-width rendering of it would misrepresent what it shows.
 */
export function SmallScreenNotice() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-hull-950 px-6 py-10 text-ink-100" data-testid="small-screen-notice">
      <div className="w-full max-w-md rounded-sm border border-panel-border bg-panel p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-info-500/40 bg-hull-800 text-info-400">
          <MonitorSmartphone size={18} />
        </div>

        <h1 className="mt-4 text-sm font-bold uppercase tracking-widest text-ink-000">Desktop Display Required</h1>

        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          This operations console is designed for a desktop display. It presents a real-time navigation picture, an FSA risk
          matrix and multi-panel engineering telemetry at densities a phone viewport cannot represent honestly — a real bridge
          or shore console is a desktop instrument, and this demonstrator says so rather than pretending otherwise.
        </p>
        <p className="mt-2 text-xs font-semibold text-info-400">Open this on a screen at least {CONSOLE_MIN_WIDTH_PX}px wide for the full picture.</p>

        <Link
          to="/"
          className="mt-5 inline-flex items-center gap-2 rounded-sm border border-info-500/40 bg-hull-800 px-4 py-2 text-xs font-bold uppercase tracking-wide text-info-400 transition-colors hover:border-info-500/70 hover:bg-hull-700"
        >
          <ArrowLeft size={14} />
          Return to the landing page
        </Link>

        <div className="mt-6 border-t border-panel-border pt-4 text-left text-[10px] leading-relaxed text-ink-700">
          <p>
            This independent technology demonstrator uses entirely synthetic operational data and illustrative engineering
            logic. It is not connected to a vessel, does not provide navigational or engineering advice, and is not intended
            for operational use.
          </p>
          <p className="mt-2 font-mono text-ink-800">
            Build {BUILD_SHA}
            {BUILD_TIME_ISO ? ` · ${BUILD_TIME_ISO}` : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
