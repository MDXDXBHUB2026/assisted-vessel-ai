import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { StatTile } from '@/components/ui/StatTile'
import { Button } from '@/components/ui/Button'
import { formatDateUtc } from '@/utils/format'
import { Sailboat } from 'lucide-react'

export function VoyagePage() {
  const voyagePlan = useSimulationStore((s) => s.voyagePlan)
  const snapshot = useSimulationStore((s) => s.snapshot)
  const setVoyageSpeed = useSimulationStore((s) => s.setVoyageSpeed)
  const acceptVoyageRecommendation = useSimulationStore((s) => s.acceptVoyageRecommendation)

  const effectiveSpeed = voyagePlan.userModifiedSpeedKn ?? voyagePlan.recommendedSpeedKn
  const excessPercent = ((snapshot.fuelEnergy.fuelConsumptionRateTonPerDay - snapshot.fuelEnergy.baselineConsumptionRateTonPerDay) / snapshot.fuelEnergy.baselineConsumptionRateTonPerDay) * 100

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <Sailboat size={18} className="text-info-400" /> Voyage &amp; Energy Intelligence
        </h1>
        <p className="text-sm text-ink-500">
          {voyagePlan.departurePort} → {voyagePlan.destinationPort}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Distance Remaining" value={voyagePlan.distanceRemainingNm.toFixed(0)} unit="nm" />
        <StatTile label="Current Speed" value={snapshot.navigation.speedOverGroundKn.toFixed(1)} unit="kn" />
        <StatTile label="Fuel Rate" value={snapshot.fuelEnergy.fuelConsumptionRateTonPerDay.toFixed(0)} unit="t/day" tone={excessPercent > 15 ? 'warning' : 'neutral'} />
        <StatTile label="Fuel Remaining" value={snapshot.fuelEnergy.fuelRemainingTons.toFixed(0)} unit="t" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Arrival Planning">
          <div className="flex flex-col gap-2 text-sm">
            <Row label="ETA (current profile)" value={formatDateUtc(voyagePlan.etaCurrentIso)} />
            <Row label="ETA (recommended profile)" value={formatDateUtc(voyagePlan.etaRecommendedIso)} />
            <Row label="Arrival window" value={`${formatDateUtc(voyagePlan.arrivalWindowStartIso)} — ${formatDateUtc(voyagePlan.arrivalWindowEndIso)}`} />
            <Row label="Weather exposure" value={voyagePlan.weatherExposure} />
          </div>
        </Panel>

        <Panel title="Speed &amp; Fuel Scenario" subtitle="Current vs Recommended vs User-Modified">
          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-1 flex justify-between text-xs text-ink-500">
                <span>Recommended speed: {voyagePlan.recommendedSpeedKn.toFixed(1)} kn</span>
                <span>Selected: {effectiveSpeed.toFixed(1)} kn</span>
              </div>
              <input
                type="range"
                min={voyagePlan.recommendedSpeedKn - 4}
                max={voyagePlan.recommendedSpeedKn + 4}
                step={0.1}
                value={effectiveSpeed}
                onChange={(e) => setVoyageSpeed(Number(e.target.value))}
                className="w-full accent-info-500"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-sm border border-panel-border bg-panel-raised py-2">
                <div className="text-ink-500">Current</div>
                <div className="mt-1 font-semibold text-ink-100">{voyagePlan.fuelEstimateCurrentTons.toFixed(0)} t</div>
              </div>
              <div className="rounded-sm border border-panel-border bg-panel-raised py-2">
                <div className="text-ink-500">Recommended</div>
                <div className="mt-1 font-semibold text-info-400">{voyagePlan.fuelEstimateRecommendedTons.toFixed(0)} t</div>
              </div>
              <div className="rounded-sm border border-panel-border bg-panel-raised py-2">
                <div className="text-ink-500">Saving</div>
                <div className={`mt-1 font-semibold ${voyagePlan.fuelSavingTons >= 0 ? 'text-healthy-400' : 'text-warning-400'}`}>{voyagePlan.fuelSavingTons.toFixed(0)} t</div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setVoyageSpeed(null)}>
                RESET TO RECOMMENDED
              </Button>
              <Button size="sm" variant="success" onClick={() => acceptVoyageRecommendation('master')} disabled={voyagePlan.recommendationAccepted}>
                {voyagePlan.recommendationAccepted ? 'ACCEPTED' : 'ACCEPT RECOMMENDATION'}
              </Button>
            </div>
            <p className="text-[11px] text-ink-500">Speed changes require explicit Master acceptance before being marked adopted in the audit trail.</p>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-panel-border/60 pb-1.5 last:border-0">
      <span className="text-ink-500">{label}</span>
      <span className="font-medium text-ink-100">{value}</span>
    </div>
  )
}
