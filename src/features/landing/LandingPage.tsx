import { Link } from 'react-router-dom'
import { Anchor, Building2, Network, ShieldCheck, Ship, Sparkles } from 'lucide-react'

const PILLARS = [
  { icon: <ShieldCheck size={18} />, title: 'Safety-Gated', body: 'Every recommendation passes deterministic safety validation before it can be shown as actionable.' },
  { icon: <Anchor size={18} />, title: 'Human Authority Preserved', body: 'Navigation, propulsion and machinery command always remain with qualified onboard and shore personnel.' },
  { icon: <Sparkles size={18} />, title: 'Explainable', body: 'Every suggestion carries its evidence, confidence, and the model or rule that produced it.' },
]

export function LandingPage() {
  return (
    <div className="min-h-screen bg-hull-950 text-ink-100">
      <div className="relative overflow-hidden border-b border-panel-border">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-info-500/10 via-hull-950 to-hull-950" />
        <div className="relative mx-auto max-w-6xl px-6 py-20 text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex items-center gap-2 rounded-full border border-hull-500/40 bg-hull-800/60 px-4 py-1.5 text-xs font-medium text-ink-300">
              <Ship size={14} className="text-info-400" /> Independent Technology Demonstrator
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-ink-000 sm:text-5xl">ASSISTED VESSEL INTELLIGENCE</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg font-medium text-info-400">Human-Centred Decision Intelligence for Vessel &amp; Shore Operations</p>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-ink-400">
            A technology demonstrator exploring how integrated vessel data, intelligent analytics and human expertise can improve maritime safety, operational
            performance and crew effectiveness.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/vessel/console" className="w-full rounded-md bg-info-500 px-6 py-3 text-sm font-semibold text-hull-950 transition-colors hover:bg-info-400 sm:w-auto">
              ENTER ASSISTED VESSEL
            </Link>
            <Link to="/shore" className="w-full rounded-md border border-hull-500/50 bg-hull-800 px-6 py-3 text-sm font-semibold text-ink-100 transition-colors hover:bg-hull-700 sm:w-auto">
              ENTER SHORE OPERATIONS
            </Link>
            <Link to="/architecture" className="w-full rounded-md border border-hull-500/50 px-6 py-3 text-sm font-semibold text-ink-300 transition-colors hover:bg-hull-800 sm:w-auto">
              EXPLORE ARCHITECTURE
            </Link>
          </div>

          <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs font-medium uppercase tracking-wide text-ink-500">
            <span>Independent Concept Prototype</span>
            <span className="h-1 w-1 rounded-full bg-hull-500" />
            <span>Synthetic Operational Data</span>
            <span className="h-1 w-1 rounded-full bg-hull-500" />
            <span>Human Authority Preserved</span>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-6 py-14 sm:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.title} className="rounded-lg border border-panel-border bg-panel p-5">
            <div className="mb-3 inline-flex rounded-md bg-info-500/10 p-2 text-info-400">{p.icon}</div>
            <h3 className="text-sm font-semibold text-ink-000">{p.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{p.body}</p>
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-14">
        <div className="rounded-lg border border-panel-border bg-panel-raised p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-000">
            <Network size={16} className="text-info-400" /> The Decision Chain
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium text-ink-300">
            {['SENSE', 'UNDERSTAND', 'PREDICT', 'RECOMMEND', 'SAFETY VALIDATE', 'EXPLAIN', 'HUMAN DECISION', 'CONTROLLED ACTION', 'MONITOR OUTCOME', 'AUDIT'].map((step, i, arr) => (
              <span key={step} className="flex items-center gap-2">
                <span className="rounded border border-hull-500/40 bg-hull-800 px-2.5 py-1">{step}</span>
                {i < arr.length - 1 && <span className="text-ink-700">→</span>}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink-500">
            This platform is not an autonomous vessel-control system. AI never autonomously commands steering, propulsion, machinery or cargo equipment — it
            observes, correlates, predicts and recommends, and every consequential action requires an explicit human decision.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-16">
        <div className="rounded-lg border border-panel-border bg-panel p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-000">
            <Building2 size={16} className="text-info-400" /> About &amp; Collaboration
          </div>
          <p className="mt-2 max-w-2xl text-sm text-ink-400">
            Interested in exploring AI-assisted maritime operations, operational intelligence or human-centred decision-support systems? Let&rsquo;s connect and
            discuss potential collaboration.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-500">
            <span>LinkedIn: <span className="text-ink-300">[configure LinkedIn URL]</span></span>
            <span>Portfolio: <span className="text-ink-300">[configure portfolio URL]</span></span>
            <span>Contact: <span className="text-ink-300">[configure contact email]</span></span>
          </div>
        </div>
      </div>

      <footer className="border-t border-panel-border px-6 py-8 text-center text-xs text-ink-700">
        <p className="mx-auto max-w-3xl">
          This independent technology demonstrator uses entirely synthetic operational data and illustrative engineering logic. It is not connected to a
          vessel, does not provide navigational or engineering advice, and is not intended for operational use.
        </p>
      </footer>
    </div>
  )
}
