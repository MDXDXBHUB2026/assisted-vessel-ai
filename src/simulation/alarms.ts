import type { HealthLevel, RawAlarm, ScenarioId, VesselSystemArea } from '@/types'

export interface DesiredAlarm {
  tag: string
  area: VesselSystemArea
  description: string
  severity: HealthLevel
  correlationGroup?: string
}

export function buildDesiredAlarms(scenario: ScenarioId, severity: number, reeferExcursionRef: string | null, collisionHighRisk: boolean): DesiredAlarm[] {
  const desired: DesiredAlarm[] = []

  if (scenario === 'engine_degradation') {
    if (severity > 0.25) desired.push({ tag: 'ME_EXHAUST_HI', area: 'main_engine', description: 'Exhaust temperature deviation above threshold — Unit 3', severity: 'warning' })
    if (severity > 0.6) desired.push({ tag: 'ME_LUBOIL_LO', area: 'main_engine', description: 'Lubricating oil pressure trending below normal band', severity: 'critical' })
  }

  if (scenario === 'alarm_cascade') {
    if (severity > 0.15) desired.push({ tag: 'ME_EXHAUST_HI', area: 'main_engine', description: 'Exhaust temperature deviation above threshold — Unit 3', severity: 'warning', correlationGroup: 'engine_thermal' })
    if (severity > 0.3) desired.push({ tag: 'ME_LUBOIL_LO', area: 'main_engine', description: 'Lubricating oil pressure trending below normal band', severity: 'warning', correlationGroup: 'engine_thermal' })
    if (severity > 0.45) desired.push({ tag: 'ME_VIBRATION_HI', area: 'main_engine', description: 'Elevated vibration signature on main engine bedplate', severity: 'warning', correlationGroup: 'engine_thermal' })
    if (severity > 0.6) desired.push({ tag: 'ME_FUEL_RACK_DEV', area: 'main_engine', description: 'Fuel rack position deviating from expected governor curve', severity: 'critical', correlationGroup: 'engine_thermal' })
    if (severity > 0.35) desired.push({ tag: 'ELEC_LOAD_IMBALANCE', area: 'electrical_power', description: 'Generator load imbalance detected across bus tie', severity: 'warning', correlationGroup: 'elec_bus' })
    if (severity > 0.5) desired.push({ tag: 'ELEC_BUSTIE_FLAG', area: 'electrical_power', description: 'Bus tie breaker cycling flagged by power management system', severity: 'warning', correlationGroup: 'elec_bus' })
    if (severity > 0.7) desired.push({ tag: 'GEN2_FREQ_DEV', area: 'electrical_power', description: 'Generator No. 2 frequency deviation outside tolerance', severity: 'critical', correlationGroup: 'elec_bus' })
  }

  if (scenario === 'heavy_weather' && severity > 0.5) {
    desired.push({ tag: 'NAV_VISIBILITY_LOW', area: 'navigation', description: 'Visibility reduced below coastal navigation comfort threshold', severity: 'warning' })
  }

  if (scenario === 'reefer_excursion' && severity > 0.3 && reeferExcursionRef) {
    desired.push({ tag: 'CARGO_REEFER_TEMP_DEV', area: 'cargo_reefer', description: `Reefer ${reeferExcursionRef} temperature deviation from set point`, severity: severity > 0.65 ? 'critical' : 'warning' })
  }

  if (scenario === 'excessive_fuel_consumption' && severity > 0.5) {
    desired.push({ tag: 'FUEL_CONSUMPTION_HI', area: 'fuel_energy', description: 'Fuel consumption rate persistently above baseline', severity: 'advisory' })
  }

  if (scenario === 'communication_loss') {
    if (severity > 0.4) desired.push({ tag: 'COMMS_SAT_DEGRADED', area: 'communications', description: 'Satellite link signal quality degraded', severity: 'warning', correlationGroup: 'comms_loss' })
    if (severity > 0.75) desired.push({ tag: 'COMMS_SAT_DOWN', area: 'communications', description: 'Satellite link down — shore synchronisation suspended', severity: 'critical', correlationGroup: 'comms_loss' })
  }

  if (scenario === 'gnss_sensor_degradation') {
    if (severity > 0.4) desired.push({ tag: 'NAV_GNSS_LOW', area: 'navigation', description: 'GNSS position confidence below normal threshold', severity: 'warning', correlationGroup: 'gnss_degradation' })
    if (severity > 0.75) desired.push({ tag: 'NAV_GNSS_LOST', area: 'navigation', description: 'GNSS position fix lost — fallback positioning in use', severity: 'critical', correlationGroup: 'gnss_degradation' })
  }

  if (scenario === 'safety_event' && severity > 0.3) {
    desired.push({ tag: 'SAFETY_BILGE_ALARM', area: 'safety', description: 'Bilge high-level alarm activated in forward compartment', severity: 'critical' })
  }

  if (collisionHighRisk) {
    desired.push({ tag: 'NAV_CPA_WARNING', area: 'navigation', description: 'Closing target CPA/TCPA within advisory threshold', severity: 'warning' })
  }

  return desired
}

export function mergeAlarms(prev: RawAlarm[], desired: DesiredAlarm[], simTimeIso: string, nextId: () => string): { alarms: RawAlarm[]; newlyRaised: RawAlarm[] } {
  const desiredTags = new Set(desired.map((d) => d.tag))
  const prevActiveTags = new Set(prev.filter((a) => a.active).map((a) => a.tag))

  const carried: RawAlarm[] = prev.map((a) => {
    if (a.active && !desiredTags.has(a.tag)) return { ...a, active: false }
    return a
  })

  const newlyRaised: RawAlarm[] = []
  for (const d of desired) {
    if (!prevActiveTags.has(d.tag)) {
      const alarm: RawAlarm = {
        id: nextId(),
        timestampIso: simTimeIso,
        area: d.area,
        tag: d.tag,
        description: d.description,
        severity: d.severity,
        active: true,
        correlationGroup: d.correlationGroup,
      }
      newlyRaised.push(alarm)
    }
  }

  return { alarms: [...carried, ...newlyRaised], newlyRaised }
}
