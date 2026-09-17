import { describe, expect, it } from 'vitest'
import { correlateAlarms } from './alarmCorrelation'
import type { RawAlarm } from '@ave/core-domain/types'

function alarm(overrides: Partial<RawAlarm>): RawAlarm {
  return {
    id: 'ALM-000001',
    timestampIso: '2026-03-11T02:00:00.000Z',
    area: 'main_engine',
    tag: 'TAG',
    description: 'Test alarm',
    severity: 'warning',
    active: true,
    ...overrides,
  }
}

describe('correlateAlarms', () => {
  it('correlates the alarm-cascade scenario shape: 7 raw alarms into 2 events', () => {
    const alarms: RawAlarm[] = [
      alarm({ id: 'A1', tag: 'ME_EXHAUST_HI', correlationGroup: 'engine_thermal' }),
      alarm({ id: 'A2', tag: 'ME_LUBOIL_LO', correlationGroup: 'engine_thermal' }),
      alarm({ id: 'A3', tag: 'ME_VIBRATION_HI', correlationGroup: 'engine_thermal' }),
      alarm({ id: 'A4', tag: 'ME_FUEL_RACK_DEV', correlationGroup: 'engine_thermal', severity: 'critical' }),
      alarm({ id: 'A5', tag: 'ELEC_LOAD_IMBALANCE', area: 'electrical_power', correlationGroup: 'elec_bus' }),
      alarm({ id: 'A6', tag: 'ELEC_BUSTIE_FLAG', area: 'electrical_power', correlationGroup: 'elec_bus' }),
      alarm({ id: 'A7', tag: 'GEN2_FREQ_DEV', area: 'electrical_power', correlationGroup: 'elec_bus', severity: 'critical' }),
    ]

    const { correlated, uncorrelatedCount } = correlateAlarms(alarms)

    expect(alarms).toHaveLength(7)
    expect(correlated).toHaveLength(2)
    expect(uncorrelatedCount).toBe(0)
    expect(correlated.find((c) => c.id === 'CORR-engine_thermal')?.secondaryAlarmIds).toHaveLength(3)
    expect(correlated.find((c) => c.id === 'CORR-elec_bus')?.priority).toBe('critical')
  })

  it('treats ungrouped and singleton-group alarms as uncorrelated', () => {
    const alarms: RawAlarm[] = [alarm({ id: 'A1' }), alarm({ id: 'A2', correlationGroup: 'solo_group' })]
    const { correlated, uncorrelatedCount } = correlateAlarms(alarms)
    expect(correlated).toHaveLength(0)
    expect(uncorrelatedCount).toBe(2)
  })

  it('ignores inactive alarms', () => {
    const alarms: RawAlarm[] = [alarm({ id: 'A1', active: false }), alarm({ id: 'A2', active: false, correlationGroup: 'g' })]
    const { correlated, uncorrelatedCount } = correlateAlarms(alarms)
    expect(correlated).toHaveLength(0)
    expect(uncorrelatedCount).toBe(0)
  })
})
