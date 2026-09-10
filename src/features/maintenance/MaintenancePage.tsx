import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { Pill } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Wrench } from 'lucide-react'

const SPARE_LABELS: Record<string, { label: string; tone: 'healthy' | 'warning' | 'critical' }> = {
  onboard: { label: 'Onboard', tone: 'healthy' },
  next_port: { label: 'Next Port', tone: 'warning' },
  order_required: { label: 'Order Required', tone: 'critical' },
}

export function MaintenancePage() {
  const items = useSimulationStore((s) => s.maintenanceItems)
  const voyagePlan = useSimulationStore((s) => s.voyagePlan)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <Wrench size={18} className="text-info-400" /> Predictive Maintenance
        </h1>
        <p className="text-sm text-ink-500">Remaining-useful-life and failure-probability estimation, considered against the current voyage: {voyagePlan.departurePort} → {voyagePlan.destinationPort}.</p>
      </div>

      <div className="flex flex-col gap-4">
        {items.map((item) => {
          const rulPct = Math.min(100, (item.remainingUsefulLifeHours / (item.remainingUsefulLifeHours + item.hoursSinceOverhaul)) * 100)
          const spare = SPARE_LABELS[item.spareAvailability]!
          return (
            <Panel key={item.id} title={item.component} subtitle={item.area}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-2 text-xs">
                  <Row label="Running hours" value={item.runningHours.toFixed(0)} />
                  <Row label="Hours since overhaul" value={item.hoursSinceOverhaul.toFixed(0)} />
                  <Row label="Predicted failure mode" value={item.predictedFailureMode} />
                  <Row label="Confidence" value={`${item.confidencePercent}%`} />
                </div>
                <div className="flex flex-col gap-2">
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-ink-500">
                      <span>Remaining Useful Life</span>
                      <span>{item.remainingUsefulLifeHours.toLocaleString()} h</span>
                    </div>
                    <ProgressBar value={rulPct} tone={rulPct < 30 ? 'critical' : rulPct < 55 ? 'warning' : 'healthy'} />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-ink-500">
                      <span>Failure Probability</span>
                      <span>{item.failureProbabilityPercent}%</span>
                    </div>
                    <ProgressBar value={item.failureProbabilityPercent} tone={item.failureProbabilityPercent > 15 ? 'warning' : 'healthy'} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-400">
                    Spare availability: <Pill tone={spare.tone}>{spare.label}</Pill>
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-xs">
                  <Row label="Next suitable opportunity" value={item.nextSuitableOpportunity} />
                  <Row label="Estimated downtime" value={`${item.estimatedDowntimeHours} h`} />
                  <Row label="Operational consequence" value={item.operationalConsequence} />
                </div>
              </div>
              <div className="mt-3 border-t border-panel-border pt-2 text-[11px] text-ink-500">
                Maintenance history: {item.maintenanceHistory.map((h) => `${h.action} (${h.dateIso.slice(0, 10)})`).join(' · ')}
              </div>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-0.5 text-ink-100">{value}</div>
    </div>
  )
}
