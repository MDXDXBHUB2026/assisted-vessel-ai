import type { DataQuality, MeasuredStatus, MeasuredValue, VesselOperationalState, VesselSnapshot } from '@/types'

function measured<T>(value: T, unit: string, timestampIso: string, source: string, confidencePercent: number, quality: DataQuality, status: MeasuredStatus): MeasuredValue<T> {
  return { value, unit, timestampIso, source, quality, confidencePercent, status, provenance: 'simulated' }
}

function qualityFromConfidence(confidence: number): DataQuality {
  if (confidence >= 80) return 'high'
  if (confidence >= 55) return 'medium'
  if (confidence > 0) return 'low'
  return 'unavailable'
}

function statusFromConfidence(confidence: number, available = true): MeasuredStatus {
  if (!available) return 'unavailable'
  if (confidence < 30) return 'stale'
  if (confidence < 60) return 'degraded'
  return 'ok'
}

/**
 * Derives the formalised, unified Vessel Operational State from the single canonical simulation
 * snapshot. Every field carries its own unit/timestamp/source/quality/confidence/status. This is
 * always a *read* over the same snapshot that feature pages consume directly for their
 * specialised displays — it can never drift into its own parallel source of truth.
 */
export function buildVesselOperationalState(snapshot: VesselSnapshot): VesselOperationalState {
  const t = snapshot.simTimeIso
  const gnssQ = qualityFromConfidence(snapshot.navigation.gnssConfidence)
  const satQ = qualityFromConfidence(snapshot.communications.satelliteConfidence)

  return {
    navigation: {
      positionLat: measured(snapshot.navigation.position.latitude, 'deg', t, 'GNSS Receiver', snapshot.navigation.gnssConfidence, gnssQ, statusFromConfidence(snapshot.navigation.gnssConfidence, snapshot.navigation.gnssAvailable)),
      positionLon: measured(snapshot.navigation.position.longitude, 'deg', t, 'GNSS Receiver', snapshot.navigation.gnssConfidence, gnssQ, statusFromConfidence(snapshot.navigation.gnssConfidence, snapshot.navigation.gnssAvailable)),
      heading: measured(snapshot.navigation.heading, 'deg T', t, 'Gyrocompass', 98, 'high', 'ok'),
      speedOverGround: measured(snapshot.navigation.speedOverGroundKn, 'kn', t, 'GNSS Speed Log', snapshot.navigation.gnssConfidence, gnssQ, statusFromConfidence(snapshot.navigation.gnssConfidence)),
      gnssConfidence: measured(snapshot.navigation.gnssConfidence, '%', t, 'GNSS Receiver', snapshot.navigation.gnssConfidence, gnssQ, statusFromConfidence(snapshot.navigation.gnssConfidence, snapshot.navigation.gnssAvailable)),
    },
    environment: {
      windSpeed: measured(snapshot.environment.windSpeedKn, 'kn', t, 'Anemometer', 92, 'high', 'ok'),
      waveHeight: measured(snapshot.environment.waveHeightM, 'm', t, 'Wave Sensor / Model', 85, 'high', 'ok'),
      visibility: measured(snapshot.environment.visibilityNm, 'nm', t, 'Visibility Sensor / Observation', 88, 'high', 'ok'),
      seaState: measured(snapshot.environment.seaState, 'Douglas', t, 'Wave Sensor / Model', 85, 'high', 'ok'),
    },
    propulsion: {
      shaftPower: measured(snapshot.mainEngine.shaftPowerKw, 'kW', t, 'Shaft Power Meter', 95, 'high', 'ok'),
      rpm: measured(snapshot.mainEngine.rpm, 'rpm', t, 'Engine Tachometer', 97, 'high', 'ok'),
    },
    machinery: {
      exhaustTempDeviation: measured(snapshot.mainEngine.exhaustTempDeviationC, '°C', t, 'Exhaust Temperature Array', 94, 'high', 'ok'),
      lubOilPressure: measured(snapshot.mainEngine.lubOilPressureBar, 'bar', t, 'Lub Oil Pressure Sensor', 94, 'high', 'ok'),
    },
    electrical: {
      blackoutRiskScore: measured(snapshot.electricalPower.blackoutRiskScore, '/100', t, 'Power Management System', 90, 'high', 'ok'),
      reservePercent: measured(snapshot.electricalPower.reservePercent, '%', t, 'Power Management System', 90, 'high', 'ok'),
    },
    energy: {
      fuelConsumptionRate: measured(snapshot.fuelEnergy.fuelConsumptionRateTonPerDay, 't/day', t, 'Fuel Flow Meter', 92, 'high', 'ok'),
      co2EmissionRate: measured(snapshot.fuelEnergy.co2EmissionRateTonPerDay, 't/day', t, 'Calculated from fuel flow', 92, 'high', 'ok'),
    },
    cargo: {
      reeferExcursionCount: measured(snapshot.cargoReefer.reeferUnits.filter((u) => u.risk !== 'healthy').length, 'units', t, 'Reefer Monitoring', 96, 'high', 'ok'),
    },
    safety: {
      watertightIntegrity: measured(snapshot.safetySystems.watertightIntegrityOk, 'bool', t, 'Safety Systems Monitoring', 98, 'high', 'ok'),
      bilgeAlarm: measured(snapshot.safetySystems.bilgeAlarmActive, 'bool', t, 'Bilge Level Sensor', 98, 'high', 'ok'),
    },
    connectivity: {
      satelliteLinkUp: measured(snapshot.communications.satelliteLinkUp, 'bool', t, 'Satellite Terminal', snapshot.communications.satelliteConfidence, satQ, statusFromConfidence(snapshot.communications.satelliteConfidence, snapshot.communications.satelliteLinkUp)),
      satelliteConfidence: measured(snapshot.communications.satelliteConfidence, '%', t, 'Satellite Terminal', snapshot.communications.satelliteConfidence, satQ, statusFromConfidence(snapshot.communications.satelliteConfidence)),
      shoreSyncLatencySec: measured(snapshot.communications.shoreSyncLatencySec, 's', t, 'Ship-Shore Link', snapshot.communications.satelliteConfidence, satQ, statusFromConfidence(snapshot.communications.satelliteConfidence, snapshot.communications.satelliteLinkUp)),
    },
    dataQuality: {
      overallConfidencePercent: measured(Math.round(Math.min(snapshot.navigation.gnssConfidence, snapshot.communications.satelliteConfidence, snapshot.systemHealth.find((s) => s.area === 'main_engine')?.confidence ?? 100)), '%', t, 'Sensor Confidence Fusion', 90, 'high', 'ok'),
    },
  }
}
