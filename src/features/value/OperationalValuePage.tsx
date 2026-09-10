import { useSimulationStore } from '@/store/simulationStore'
import { Panel } from '@/components/ui/Panel'
import { correlateAlarms } from '@/decision-engine/alarmCorrelation'
import { TrendingUp } from 'lucide-react'

const FUEL_PRICE_USD_PER_TON = 620
const CO2_PRICE_USD_PER_TON = 85
const VESSEL_DAYS_PER_YEAR = 300

export function OperationalValuePage() {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const voyagePlan = useSimulationStore((s) => s.voyagePlan)
  const rawAlarms = useSimulationStore((s) => s.rawAlarms)
  const recommendations = useSimulationStore((s) => s.recommendations)
  const fleet = useSimulationStore((s) => s.fleet)
  const maintenanceItems = useSimulationStore((s) => s.maintenanceItems)

  const { correlated, uncorrelatedCount } = correlateAlarms(rawAlarms)
  const activeRaw = rawAlarms.filter((a) => a.active).length
  const alarmBurdenReductionPercent = activeRaw > 0 ? Math.round((1 - (correlated.length + uncorrelatedCount) / Math.max(activeRaw, 1)) * 100) : 0

  const fuelExcessPerDay = Math.max(0, snapshot.fuelEnergy.fuelConsumptionRateTonPerDay - snapshot.fuelEnergy.baselineConsumptionRateTonPerDay)
  const fuelOpportunityPerVesselYearTons = fuelExcessPerDay > 0 ? fuelExcessPerDay * VESSEL_DAYS_PER_YEAR : voyagePlan.fuelSavingTons > 0 ? voyagePlan.fuelSavingTons * 12 : 8 * VESSEL_DAYS_PER_YEAR * 0.03
  const fuelOpportunityUsd = fuelOpportunityPerVesselYearTons * FUEL_PRICE_USD_PER_TON
  const co2OpportunityTons = fuelOpportunityPerVesselYearTons * 3.114
  const co2OpportunityUsd = co2OpportunityTons * CO2_PRICE_USD_PER_TON

  const avgFailureProbability = maintenanceItems.reduce((sum, m) => sum + m.failureProbabilityPercent, 0) / Math.max(maintenanceItems.length, 1)
  const decidedRecommendations = recommendations.filter((r) => r.decidedAtIso)
  const avgDecisionResponseMinutes = decidedRecommendations.length > 0
    ? decidedRecommendations.reduce((sum, r) => sum + Math.abs(new Date(r.decidedAtIso!).getTime() - new Date(r.timestampIso).getTime()) / 60000, 0) / decidedRecommendations.length
    : 0

  const fleetSize = fleet.length

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-000">
          <TrendingUp size={18} className="text-info-400" /> Operational Value Assessment
        </h1>
        <p className="text-sm text-ink-500">
          Illustrative estimates derived from the current simulation, extrapolated to a per-vessel-year and {fleetSize}-vessel fleet basis using indicative
          public reference prices. <strong className="text-warning-400">These are illustrative estimates only, not a costed business case or commercial
          commitment.</strong>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ValueTile label="Fuel Opportunity" value={`${fuelOpportunityPerVesselYearTons.toFixed(0)} t/yr`} sub={`≈ $${(fuelOpportunityUsd / 1000).toFixed(0)}k/vessel/yr · $${((fuelOpportunityUsd * fleetSize) / 1e6).toFixed(1)}M fleet-wide`} />
        <ValueTile label="CO2 Impact" value={`${co2OpportunityTons.toFixed(0)} t/yr`} sub={`≈ $${(co2OpportunityUsd / 1000).toFixed(0)}k/vessel/yr at illustrative carbon price`} />
        <ValueTile label="Downtime Exposure" value={`${avgFailureProbability.toFixed(0)}%`} sub="Average monitored-component failure probability this voyage" />
        <ValueTile label="Maintenance Lead-Time Benefit" value={`${maintenanceItems.filter((m) => m.spareAvailability !== 'order_required').length}/${maintenanceItems.length}`} sub="Components with spares already onboard or at next port" />
        <ValueTile label="Alarm Burden Reduction" value={`${Math.max(0, alarmBurdenReductionPercent)}%`} sub={`${activeRaw} raw alarms → ${correlated.length + uncorrelatedCount} operational events`} />
        <ValueTile label="Crew Workload Reduction" value={`${correlated.reduce((sum, c) => sum + c.secondaryAlarmIds.length, 0)} alarms`} sub="Individually-triaged alarms absorbed into correlated events this session" />
        <ValueTile label="Decision-Response Improvement" value={avgDecisionResponseMinutes > 0 ? `${avgDecisionResponseMinutes.toFixed(0)} min` : '—'} sub="Average time from recommendation to recorded human decision this session" />
        <ValueTile label="Recommendations Actioned" value={`${decidedRecommendations.length}/${recommendations.length}`} sub="Recommendations carried to a recorded decision this session" />
      </div>

      <Panel title="Methodology &amp; Caveats">
        <ul className="list-disc space-y-1.5 pl-4 text-xs text-ink-400">
          <li>Fuel and CO2 figures extrapolate the current or most recent excess-consumption reading to a {VESSEL_DAYS_PER_YEAR}-day operating year using an indicative bunker price of ${FUEL_PRICE_USD_PER_TON}/t and carbon price of ${CO2_PRICE_USD_PER_TON}/t — both illustrative, not live market prices.</li>
          <li>Alarm-burden and workload figures reflect only alarms and recommendations generated within this browser session, not a fleet-scale statistical sample.</li>
          <li>Downtime and maintenance figures reflect the synthetic maintenance dataset for this one vessel, not survey or warranty data.</li>
          <li>No figure on this page should be used for investment, budgeting, or commercial decisions.</li>
        </ul>
      </Panel>
    </div>
  )
}

function ValueTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-sm border border-panel-border bg-panel-raised px-3.5 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-ink-000">{value}</div>
      <div className="mt-1 text-[11px] text-ink-500">{sub}</div>
    </div>
  )
}
