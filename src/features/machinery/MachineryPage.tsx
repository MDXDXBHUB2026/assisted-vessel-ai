import { useState } from 'react'
import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Sparkline } from '@/components/charts/Sparkline'
import { Modal } from '@/components/ui/Modal'
import { InstrumentRow } from '@/components/ui/InstrumentRow'
import { ProvenanceTag } from '@/components/ui/Badge'
import { Gauge } from 'lucide-react'

export function MachineryPage() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const analysis = useSimulationStore((s) => s.machineryAnalysis)
  const exhaustHistory = useSimulationStore((s) => s.telemetryHistory.exhaustTempDeviationC.values)
  const oilHistory = useSimulationStore((s) => s.telemetryHistory.lubOilPressureBar.values)
  const decideRecommendation = useSimulationStore((s) => s.decideRecommendation)
  const recommendations = useSimulationStore((s) => s.recommendations).filter((r) => r.vesselFunction === 'main_engine')
  const [showEvidence, setShowEvidence] = useState(false)

  const tone = analysis.anomalyScore > 65 ? 'critical' : analysis.anomalyScore > 35 ? 'warning' : 'healthy'
  const active = recommendations[0]

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <Gauge size={18} className="text-info-400" /> Machinery Intelligence
        </h1>
        <p className="text-sm text-ink-500">Time-series condition monitoring: instantaneous deviation, rolling trend and persistence are combined into a single anomaly score — not a single-point threshold.</p>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-sm border border-panel-border bg-panel px-4 py-3 sm:grid-cols-4">
        <InstrumentRow label="Health Score" value={String(analysis.healthScore)} unit="/100" tone={tone} />
        <InstrumentRow label="Anomaly Score" value={String(analysis.anomalyScore)} unit="/100" tone={tone} />
        <InstrumentRow label="Exhaust Deviation" value={analysis.actualExhaustDeviationC.toFixed(1)} unit="°C" />
        <InstrumentRow label="Lub Oil Pressure" value={analysis.actualLubOilPressureBar.toFixed(2)} unit="bar" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Exhaust Temperature Deviation Trend" dense>
          <Sparkline data={exhaustHistory} color="#f0473a" height={90} />
          <p className="mt-1 text-[11px] text-ink-500">Slope: {analysis.exhaustSlopePerSample >= 0 ? '+' : ''}{analysis.exhaustSlopePerSample.toFixed(2)} °C/sample · Persistence: {(analysis.exhaustPersistence * 100).toFixed(0)}%</p>
        </Panel>
        <Panel title="Lubricating Oil Pressure Trend" dense>
          <Sparkline data={oilHistory} color="#5BC0BE" height={90} />
          <p className="mt-1 text-[11px] text-ink-500">Slope: {analysis.lubOilSlopePerSample >= 0 ? '+' : ''}{analysis.lubOilSlopePerSample.toFixed(3)} bar/sample · Persistence: {(analysis.lubOilPersistence * 100).toFixed(0)}%</p>
        </Panel>
        <Panel title="Sample Maturity" dense>
          <div className="flex h-[90px] flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold text-ink-000 tabular-nums">{analysis.sampleCount}</span>
            <span className="text-[11px] text-ink-500">rolling samples informing this analysis</span>
          </div>
        </Panel>
      </div>

      <Panel title="Condition Assessment">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 text-sm">
            <Row label="Probable condition" value={analysis.probableCondition} />
            <Row label="Confidence" value={`${analysis.confidencePercent}%`} />
            <Row label="Baseline exhaust deviation" value={`${analysis.baselineExhaustDeviationC.toFixed(1)} °C`} />
            <Row label="Baseline lub oil pressure" value={`${analysis.baselineLubOilPressureBar.toFixed(2)} bar`} />
            <Row label="Operational consequence if deferred" value={analysis.consequence} />
            <Row label="Maintenance consequence" value={analysis.maintenanceConsequence} />
            <Row label="Recommended response" value={analysis.recommendedResponse} />
          </div>
          <div className="flex flex-col justify-between gap-3">
            <div className="rounded-sm border border-panel-border bg-panel-raised p-3 text-xs text-ink-400">
              ML — Condition Trend Detection. Deviation, slope and persistence are computed from the live rolling telemetry window against fixed baseline
              operating parameters. This does not constitute engineering advice — treat as a decision-support indication only, subject to Chief Engineer
              review.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setShowEvidence(true)}>VIEW EVIDENCE</Button>
              <Button size="sm" variant="secondary">REQUEST TECHNICAL REVIEW</Button>
              <Button size="sm" variant="ghost">ACKNOWLEDGE</Button>
              {active && (
                <>
                  <Button size="sm" variant="success" onClick={() => decideRecommendation(active.id, 'accepted', 'Accepted from Machinery Intelligence view', 'chief_engineer')}>
                    ACCEPT RECOMMENDATION
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => decideRecommendation(active.id, 'info_requested', 'Requested more information', 'chief_engineer')}>
                    DEFER
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => decideRecommendation(active.id, 'rejected', 'Rejected from Machinery Intelligence view', 'chief_engineer')}>
                    REJECT
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </Panel>

      {showEvidence && (
        <Modal title="Machinery Evidence" onClose={() => setShowEvidence(false)}>
          <ul className="flex flex-col gap-2 text-xs">
            <li className="flex items-center justify-between gap-2">
              <span>Exhaust temperature array — {snapshot.mainEngine.exhaustTempAvgC.toFixed(1)} °C average across monitored units.</span>
              <ProvenanceTag provenance="simulated" />
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>Lubricating oil pressure sensor — {snapshot.mainEngine.lubOilPressureBar.toFixed(2)} bar (baseline {analysis.baselineLubOilPressureBar.toFixed(2)} bar).</span>
              <ProvenanceTag provenance="simulated" />
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>Shaft power calculation — {snapshot.mainEngine.shaftPowerKw.toFixed(0)} kW at {snapshot.mainEngine.rpm.toFixed(0)} RPM.</span>
              <ProvenanceTag provenance="calculated" />
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>Running hours — {snapshot.mainEngine.runningHours.toFixed(0)} hours since commissioning.</span>
              <ProvenanceTag provenance="simulated" />
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>Anomaly score {analysis.anomalyScore}/100 derived from deviation + trend + persistence model ({analysis.sampleCount} samples).</span>
              <ProvenanceTag provenance="calculated" />
            </li>
          </ul>
        </Modal>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-panel-border/60 pb-2 last:border-0">
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-0.5 text-ink-100">{value}</div>
    </div>
  )
}
