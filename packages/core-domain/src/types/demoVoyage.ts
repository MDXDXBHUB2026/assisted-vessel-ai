import type { ScenarioId } from './scenario'

export interface DemoVoyagePhase {
  id: string
  title: string
  scenario: ScenarioId
  durationMinutes: number
  description: string
}

export interface DemoVoyageState {
  active: boolean
  phaseIndex: number
  phaseElapsedMinutes: number
}
