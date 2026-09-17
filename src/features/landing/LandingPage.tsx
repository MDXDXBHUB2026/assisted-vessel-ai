import { Link, useNavigate } from 'react-router-dom'
import { useSimulationStore } from '@/store/simulationStore'
import { VesselTopology, type TopologyLink, type TopologyNode } from '@/components/charts/VesselTopology'
import { SYSTEM_AREA_LABELS, OPERATIONAL_MODE_LABELS, type VesselSystemArea } from '@/types'
import { Anchor, Building2, Compass, Fuel, Gauge, Radio, ShieldAlert, Snowflake, Wrench, Zap, ArrowRight, Network, PlayCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { BUILD_SHA, BUILD_TIME_ISO } from '@/buildInfo'

const AREA_ICONS: Record<VesselSystemArea, ReactNode> = {
  navigation: <Compass size={16} />,
  main_engine: <Gauge size={16} />,
  auxiliary_machinery: <Wrench size={16} />,
  electrical_power: <Zap size={16} />,
  fuel_energy: <Fuel size={16} />,
  cargo_reefer: <Snowflake size={16} />,
  safety: <ShieldAlert size={16} />,
  communications: <Radio size={16} />,
}

const NODE_POSITIONS: Record<VesselSystemArea, { x: number; y: number }> = {
  navigation: { x: 85, y: 50 },
  communications: { x: 88, y: 22 },
  safety: { x: 50, y: 78 },
  cargo_reefer: { x: 50, y: 30 },
  electrical_power: { x: 28, y: 30 },
  auxiliary_machinery: { x: 22, y: 70 },
  fuel_energy: { x: 10, y: 60 },
  main_engine: { x: 14, y: 32 },
}

const LINKS: TopologyLink[] = [
  { from: 'navigation', to: 'communications', label: '' },
  { from: 'navigation', to: 'cargo_reefer', label: '' },
  { from: 'main_engine', to: 'auxiliary_machinery', label: '' },
  { from: 'main_engine', to: 'electrical_power', label: '' },
  { from: 'main_engine', to: 'fuel_energy', label: '' },
  { from: 'electrical_power', to: 'cargo_reefer', label: '' },
  { from: 'electrical_power', to: 'safety', label: '' },
  { from: 'safety', to: 'navigation', label: '' },
]

const ENTRY_POINTS = [
  { to: '/vessel/console', label: 'ENTER BRIDGE OPERATIONS', icon: <Anchor size={20} />, body: 'Navigation operating picture, safety, alarms, envelope and human decision centre.' },
  { to: '/engineering', label: 'ENTER ENGINEERING OPERATIONS', icon: <Wrench size={20} />, body: 'Chief Engineer workspace: machinery, condition intelligence, alarms and maintenance planning.' },
  { to: '/shore', label: 'ENTER SHORE OPERATIONS', icon: <Building2 size={20} />, body: 'Fleet operating picture, specialist case workflow, and shore-support decision-making.' },
  { to: '/assurance/programme', label: 'EXPLORE ENGINEERING ASSURANCE', icon: <Network size={20} />, body: 'Requirements, architecture, ODD, hazard analysis, V&V and the full traceability record.' },
]

export function LandingPage() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const startDemoVoyage = useSimulationStore((s) => s.startDemoVoyage)
  const [selected, setSelected] = useState<VesselSystemArea | null>(null)
  const navigate = useNavigate()

  const nodes: TopologyNode[] = snapshot.systemHealth.map((s) => ({
    area: s.area,
    label: SYSTEM_AREA_LABELS[s.area],
    icon: AREA_ICONS[s.area],
    health: s.health,
    ...NODE_POSITIONS[s.area],
  }))

  return (
    <div className="min-h-screen bg-hull-950 text-ink-100">
      <header className="flex items-center justify-between border-b border-panel-border px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-widest text-ink-000">ASSISTED VESSEL INTELLIGENCE</span>
          <span className="rounded border border-hull-500/40 px-1.5 py-0.5 text-[9px] font-medium text-ink-700">ENGINEERING POC</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink-500">
          <span>Mode: <span className="text-ink-200">{OPERATIONAL_MODE_LABELS[snapshot.operationalMode]}</span></span>
          <span>Status: <span className="text-healthy-400">{snapshot.overallHealth.toUpperCase()}</span></span>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 py-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-ink-000 sm:text-3xl">Assisted Vessel Intelligence</h1>
          <p className="mt-1 text-sm font-medium text-info-400">Human-Centred Decision Intelligence for Vessel &amp; Shore Operations</p>
          <p className="mt-3 max-w-md text-xs leading-relaxed text-ink-500">
            A functioning engineering proof-of-concept for AI-assisted container-vessel and shore decision support — deterministic safety validation, an
            assistance-level framework, and a full decision-chain audit, running now from the live topology on the right.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            {ENTRY_POINTS.map((e) => (
              <Link key={e.to} to={e.to} className="group flex items-center gap-3 rounded-sm border border-panel-border bg-panel px-4 py-3 transition-colors hover:border-info-500/50 hover:bg-panel-raised">
                <span className="text-info-400">{e.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold tracking-wide text-ink-000">{e.label}</div>
                  <div className="text-[11px] text-ink-500">{e.body}</div>
                </div>
                <ArrowRight size={14} className="shrink-0 text-ink-700 transition-transform group-hover:translate-x-0.5 group-hover:text-info-400" />
              </Link>
            ))}
            <button
              onClick={() => {
                startDemoVoyage()
                navigate('/vessel/scenarios')
              }}
              className="group flex items-center gap-3 rounded-sm border border-orange-600/40 bg-orange-600/10 px-4 py-3 text-left transition-colors hover:border-orange-500/60 hover:bg-orange-600/15"
            >
              <span className="text-orange-500"><PlayCircle size={20} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold tracking-wide text-ink-000">START DEMO VOYAGE</div>
                <div className="text-[11px] text-ink-500">A coherent, compressed ten-phase demonstration — normal operations through machinery degradation, collision risk, heavy weather, comms loss and recovery.</div>
              </div>
              <ArrowRight size={14} className="shrink-0 text-ink-700 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-400" />
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-medium uppercase tracking-wide text-ink-700">
            <span>Independent Concept POC</span>
            <span>·</span>
            <span>Synthetic Operational Data</span>
            <span>·</span>
            <span>Human Authority Preserved</span>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-700">Live Vessel System Topology</span>
            <span className="text-[10px] text-ink-700">Click a system</span>
          </div>
          <VesselTopology nodes={nodes} links={LINKS} selected={selected} onSelect={setSelected} />
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-ink-400">
            {['SENSE', 'UNDERSTAND', 'PREDICT', 'RECOMMEND', 'SAFETY VALIDATE', 'EXPLAIN', 'HUMAN DECISION', 'CONTROLLED ACTION', 'MONITOR OUTCOME', 'AUDIT'].map((step, i, arr) => (
              <span key={step} className="flex items-center gap-2">
                <span className="rounded border border-hull-500/40 bg-hull-800 px-2 py-0.5">{step}</span>
                {i < arr.length - 1 && <span className="text-ink-700">→</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 pb-10">
        <div className="rounded-sm border border-panel-border bg-panel p-5">
          <div className="text-xs font-semibold text-ink-000">About &amp; Collaboration</div>
          <p className="mt-1.5 max-w-2xl text-xs text-ink-400">
            Interested in exploring AI-assisted maritime operations, operational intelligence or human-centred decision-support systems? Let&rsquo;s connect and
            discuss potential collaboration.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-ink-500">
            <span>LinkedIn: <span className="text-ink-300">[configure LinkedIn URL]</span></span>
            <span>Portfolio: <span className="text-ink-300">[configure portfolio URL]</span></span>
            <span>Contact: <span className="text-ink-300">[configure contact email]</span></span>
          </div>
        </div>
      </div>

      <footer className="border-t border-panel-border px-6 py-6 text-center text-[11px] text-ink-700">
        <p className="mx-auto max-w-3xl">
          This independent technology demonstrator uses entirely synthetic operational data and illustrative engineering logic. It is not connected to a
          vessel, does not provide navigational or engineering advice, and is not intended for operational use. It does not claim operational certification
          or production readiness, and does not represent any real maritime organisation.
        </p>
        <p className="mx-auto mt-2 max-w-3xl font-mono text-ink-800">
          Build {BUILD_SHA}
          {BUILD_TIME_ISO ? ` · ${BUILD_TIME_ISO}` : ''}
        </p>
      </footer>
    </div>
  )
}
