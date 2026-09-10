import type { DemoVoyagePhase } from '@/types'

export const DEMO_VOYAGE_PHASES: DemoVoyagePhase[] = [
  { id: 'p1', title: 'Normal Open-Sea Operations', scenario: 'normal_operations', durationMinutes: 20, description: 'Baseline operation — vessel, targets and telemetry moving normally with no active condition.' },
  { id: 'p2', title: 'Energy Optimisation Opportunity', scenario: 'excessive_fuel_consumption', durationMinutes: 90, description: 'Fuel consumption trends above baseline; a voyage-speed optimisation recommendation develops.' },
  { id: 'p3', title: 'Machinery Degradation', scenario: 'engine_degradation', durationMinutes: 150, description: 'Main engine thermal deviation develops progressively; anomaly detection, alarms and a technical recommendation follow.' },
  { id: 'p4', title: 'Traffic Encounter / Collision-Risk Development', scenario: 'collision_risk', durationMinutes: 110, description: 'A synthetic target closes on own ship; CPA/TCPA develop and a navigation advisory is generated.' },
  { id: 'p5', title: 'Heavy Weather', scenario: 'heavy_weather', durationMinutes: 100, description: 'Sea state and wind rise, visibility falls, ODD margins close for affected functions.' },
  { id: 'p6', title: 'Operational Envelope Degradation', scenario: 'gnss_sensor_degradation', durationMinutes: 70, description: 'GNSS confidence falls; navigation assistance steps down to a lower assistance level.' },
  { id: 'p7', title: 'Ship-Shore Communication Loss', scenario: 'communication_loss', durationMinutes: 60, description: 'Shore link degrades and drops; shore-dependent functions fall back while onboard assistance continues.' },
  { id: 'p8', title: 'Reefer Excursion', scenario: 'reefer_excursion', durationMinutes: 80, description: 'A monitored reefer container drifts off its set point; a cargo recommendation is generated.' },
  { id: 'p9', title: 'Communications Recovery', scenario: 'normal_operations', durationMinutes: 30, description: 'Shore link is restored; queued records synchronise to shore via store-and-forward.' },
  { id: 'p10', title: 'Voyage Review / Audit', scenario: 'normal_operations', durationMinutes: 15, description: 'Conditions return to baseline. Review the full audit trail, decisions and operational value for this session.' },
]
