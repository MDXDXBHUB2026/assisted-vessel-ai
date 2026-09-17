import type { MeasuredValue } from './common'

/**
 * The formalised, unified Vessel Operational State. Every field is a MeasuredValue carrying
 * unit, timestamp, source, quality, confidence and status — this is the shared contract that
 * the command ribbon, digital twin and system assurance surfaces read from. It is always
 * *derived* from the same underlying simulation snapshot that feature pages read directly for
 * their specialised calculations, so the two views can never drift apart.
 */
export interface VesselOperationalState {
  navigation: {
    positionLat: MeasuredValue<number>
    positionLon: MeasuredValue<number>
    heading: MeasuredValue<number>
    speedOverGround: MeasuredValue<number>
    gnssConfidence: MeasuredValue<number>
  }
  environment: {
    windSpeed: MeasuredValue<number>
    waveHeight: MeasuredValue<number>
    visibility: MeasuredValue<number>
    seaState: MeasuredValue<number>
  }
  propulsion: {
    shaftPower: MeasuredValue<number>
    rpm: MeasuredValue<number>
  }
  machinery: {
    exhaustTempDeviation: MeasuredValue<number>
    lubOilPressure: MeasuredValue<number>
  }
  electrical: {
    blackoutRiskScore: MeasuredValue<number>
    reservePercent: MeasuredValue<number>
  }
  energy: {
    fuelConsumptionRate: MeasuredValue<number>
    co2EmissionRate: MeasuredValue<number>
  }
  cargo: {
    reeferExcursionCount: MeasuredValue<number>
  }
  safety: {
    watertightIntegrity: MeasuredValue<boolean>
    bilgeAlarm: MeasuredValue<boolean>
  }
  connectivity: {
    satelliteLinkUp: MeasuredValue<boolean>
    satelliteConfidence: MeasuredValue<number>
    shoreSyncLatencySec: MeasuredValue<number>
  }
  dataQuality: {
    overallConfidencePercent: MeasuredValue<number>
  }
}
