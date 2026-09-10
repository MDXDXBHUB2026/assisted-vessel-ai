import { useState } from 'react'
import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { StatTile } from '@/components/ui/StatTile'
import { Button } from '@/components/ui/Button'
import { Sparkline } from '@/components/charts/Sparkline'
import { Modal } from '@/components/ui/Modal'
import { useMetricHistory } from '@/hooks/useMetricHistory'
import { analyseMainEngine } from '@/decision-engine/machineryAnalytics'
import { Gauge } from 'lucide-react'

export function MachineryPage() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const decideRecommendation = useSimulationStore((s) => s.decideRecommendation)
  const recommendations = useSimulationStore((s) => s.recommendations).filter((r) => r.vesselFunction === 'main_engine')
  const [showEvidence, setShowEvidence] = useState(false)

  const analysis = analyseMainEngine(snapshot)
  const exhaustHistory = useMetricHistory((s) => s.snapshot.mainEngine.exhaustTempAvgC, 50)
  const oilHistory = useMetricHistory((s) => s.snapshot.mainEngine.lubOilPressureBar, 50)
  const anomalyHistory = useMetricHistory(() => analyseMainEngine(snapshot).anomalyScore, 50)

  const tone = analysis.anomalyScore > 65 ? 'critical' : analysis.anomalyScore > 35 ? 'warning' : 'healthy'
  const active = recommendations[0]

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <Gauge size={18} className="text-info-400" /> Machinery Intelligence
        </h1>
        <p className="text-sm text-ink-500">Condition monitoring and anomaly detection for main engine and auxiliary machinery.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Health Score" value={String(analysis.healthScore)} unit="/100" tone={tone} />
        <StatTile label="Anomaly Score" value={String(analysis.anomalyScore)} unit="/100" tone={tone} />
        <StatTile label="Exhaust Temp" value={snapshot.mainEngine.exhaustTempAvgC.toFixed(0)} unit="°C" />
        <StatTile label="Lub Oil Pressure" value={snapshot.mainEngine.lubOilPressureBar.toFixed(2)} unit="bar" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Exhaust Temperature Trend" dense>
          <Sparkline data={exhaustHistory} color="#f0473a" height={90} />
        </Panel>
        <Panel title="Lubricating Oil Pressure Trend" dense>
          <Sparkline data={oilHistory} color="#22b8c4" height={90} />
        </Panel>
        <Panel title="Anomaly Score Trend" dense>
          <Sparkline data={anomalyHistory} color="#eda528" height={90} />
        </Panel>
      </div>

      <Panel title="Condition Assessment">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 text-sm">
            <Row label="Probable condition" value={analysis.probableCondition} />
            <Row label="Confidence" value={`${analysis.confidencePercent}%`} />
            <Row label="Baseline exhaust deviation" value="3.0 °C" />
            <Row label="Current deviation" value={`${analysis.deviationC.toFixed(1)} °C`} />
            <Row label="Consequence if deferred" value={analysis.consequence} />
            <Row label="Recommended response" value={analysis.recommendedResponse} />
          </div>
          <div className="flex flex-col justify-between gap-3">
            <div className="rounded-md border border-panel-border bg-panel-raised p-3 text-xs text-ink-400">
              Deterministic condition-monitoring logic compares live sensor values against baseline operating parameters for this unit and running-hours profile.
              This does not constitute engineering advice — treat as a decision-support indication only.
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
            <li>Exhaust temperature array — {snapshot.mainEngine.exhaustTempAvgC.toFixed(1)} °C average across monitored units.</li>
            <li>Lubricating oil pressure sensor — {snapshot.mainEngine.lubOilPressureBar.toFixed(2)} bar (baseline 4.20 bar).</li>
            <li>Shaft power calculation — {snapshot.mainEngine.shaftPowerKw.toFixed(0)} kW at {snapshot.mainEngine.rpm.toFixed(0)} RPM.</li>
            <li>Running hours — {snapshot.mainEngine.runningHours.toFixed(0)} hours since commissioning.</li>
            <li>Anomaly score {analysis.anomalyScore}/100 derived from thermal and lubrication deviation model.</li>
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
