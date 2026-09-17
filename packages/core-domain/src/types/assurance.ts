import type { AssuranceAvailability } from './common'

export interface SystemAssuranceItem {
  id: string
  label: string
  availability: AssuranceAvailability
  detail: string
  lastCheckedIso: string
}
