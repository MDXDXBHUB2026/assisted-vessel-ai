import type { CorrelatedEvent, HealthLevel, RawAlarm } from '@ave/core-domain/types'
import { healthLevelRank } from '@ave/core-domain/types'

/**
 * Groups raw alarms sharing a correlationGroup into a single probable operational condition.
 * Alarms without a group are treated as independent (uncorrelated) raw alarms.
 */
export function correlateAlarms(alarms: RawAlarm[]): { correlated: CorrelatedEvent[]; uncorrelatedCount: number } {
  const active = alarms.filter((a) => a.active)
  const groups = new Map<string, RawAlarm[]>()
  let uncorrelatedCount = 0

  for (const alarm of active) {
    if (!alarm.correlationGroup) {
      uncorrelatedCount += 1
      continue
    }
    const list = groups.get(alarm.correlationGroup) ?? []
    list.push(alarm)
    groups.set(alarm.correlationGroup, list)
  }

  const correlated: CorrelatedEvent[] = []
  for (const [groupTag, groupAlarms] of groups) {
    if (groupAlarms.length === 1) {
      uncorrelatedCount += 1
      continue
    }
    const sorted = [...groupAlarms].sort((a, b) => new Date(a.timestampIso).getTime() - new Date(b.timestampIso).getTime())
    const primary = sorted[0]
    if (!primary) continue
    const secondary = sorted.slice(1)
    const priority: HealthLevel = groupAlarms.reduce((worst, a) => (healthLevelRank(a.severity) > healthLevelRank(worst) ? a.severity : worst), 'healthy' as HealthLevel)

    correlated.push({
      id: `CORR-${groupTag}`,
      title: correlationTitle(groupTag),
      probableCommonCause: correlationCause(groupTag),
      primaryAlarmId: primary.id,
      secondaryAlarmIds: secondary.map((a) => a.id),
      priority,
      recommendedCrewResponse: correlationResponse(groupTag),
    })
  }

  return { correlated, uncorrelatedCount }
}

function correlationTitle(groupTag: string): string {
  const titles: Record<string, string> = {
    engine_thermal: 'Main Engine Thermal Deviation — Correlated Event',
    reefer_power: 'Reefer Power / Temperature Excursion — Correlated Event',
    comms_loss: 'Ship-Shore Communications Degradation — Correlated Event',
    gnss_degradation: 'Navigation Sensor Confidence Degradation — Correlated Event',
  }
  return titles[groupTag] ?? 'Correlated Operational Event'
}

function correlationCause(groupTag: string): string {
  const causes: Record<string, string> = {
    engine_thermal: 'Probable common cause: progressive main engine combustion/thermal anomaly.',
    reefer_power: 'Probable common cause: reefer power supply instability affecting temperature control.',
    comms_loss: 'Probable common cause: satellite link degradation affecting shore-dependent services.',
    gnss_degradation: 'Probable common cause: GNSS signal quality reduction affecting position confidence.',
  }
  return causes[groupTag] ?? 'Probable common cause under evaluation.'
}

function correlationResponse(groupTag: string): string {
  const responses: Record<string, string> = {
    engine_thermal: 'Engineer to investigate affected unit; consider load reduction pending assessment.',
    reefer_power: 'Crew to inspect affected reefer unit and verify power distribution.',
    comms_loss: 'Bridge team to note fallback mode; re-establish link via alternate means where possible.',
    gnss_degradation: 'Bridge team to cross-check position by alternate means; monitor for recovery.',
  }
  return responses[groupTag] ?? 'Investigate underlying cause and respond per SMS procedure.'
}
