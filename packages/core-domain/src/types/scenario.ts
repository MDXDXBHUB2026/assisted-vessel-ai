export type ScenarioId =
  | 'normal_operations'
  | 'engine_degradation'
  | 'heavy_weather'
  | 'collision_risk'
  | 'reefer_excursion'
  | 'excessive_fuel_consumption'
  | 'alarm_cascade'
  | 'communication_loss'
  | 'gnss_sensor_degradation'
  | 'safety_event'

export interface ScenarioDefinition {
  id: ScenarioId
  label: string
  description: string
}

export const SCENARIOS: ScenarioDefinition[] = [
  { id: 'normal_operations', label: 'Normal Operations', description: 'Baseline synthetic operating condition, all systems nominal.' },
  { id: 'engine_degradation', label: 'Engine Degradation', description: 'Gradual main engine thermal deviation and efficiency loss.' },
  { id: 'heavy_weather', label: 'Heavy Weather', description: 'Deteriorating sea state, wind and visibility affecting route and speed.' },
  { id: 'collision_risk', label: 'Collision-Risk Development', description: 'A synthetic target develops a closing CPA/TCPA requiring monitoring.' },
  { id: 'reefer_excursion', label: 'Reefer Temperature Excursion', description: 'A reefer container drifts outside its set-point band.' },
  { id: 'excessive_fuel_consumption', label: 'Excessive Fuel Consumption', description: 'Fuel consumption trends above baseline for the current voyage profile.' },
  { id: 'alarm_cascade', label: 'Alarm Cascade', description: 'Multiple related alarms fire from a common underlying condition.' },
  { id: 'communication_loss', label: 'Ship-Shore Communication Loss', description: 'Satellite link degrades, shore-dependent functions fall back.' },
  { id: 'gnss_sensor_degradation', label: 'GNSS / Sensor Degradation', description: 'Position confidence degrades, navigation assistance restricts.' },
  { id: 'safety_event', label: 'Safety Event', description: 'A safety hazard is raised requiring crew acknowledgement and response.' },
]
