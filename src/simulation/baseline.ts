import type {
  CargoReeferState,
  MaintenanceItem,
  ReeferUnit,
  SystemHealthSummary,
  TargetVessel,
  VesselSnapshot,
} from '@/types'
import { OWN_VESSEL_IDENTITY } from '@/data/vesselIdentity'
import { DEPARTURE_POSITION } from '@/data/route'

export const SIM_START_ISO = '2026-03-11T02:00:00.000Z'

export function buildBaselineSnapshot(): VesselSnapshot {
  const systemHealth: SystemHealthSummary[] = [
    { area: 'navigation', health: 'healthy', state: 'normal', headline: 'All navigation sensors nominal', confidence: 98 },
    { area: 'main_engine', health: 'healthy', state: 'normal', headline: 'Main engine within baseline parameters', confidence: 97 },
    { area: 'auxiliary_machinery', health: 'healthy', state: 'normal', headline: 'Auxiliary machinery nominal', confidence: 96 },
    { area: 'electrical_power', health: 'healthy', state: 'normal', headline: 'Power generation stable, healthy reserve', confidence: 97 },
    { area: 'fuel_energy', health: 'healthy', state: 'normal', headline: 'Fuel consumption tracking baseline', confidence: 95 },
    { area: 'cargo_reefer', health: 'healthy', state: 'normal', headline: 'All reefer units within set point', confidence: 98 },
    { area: 'safety', health: 'healthy', state: 'normal', headline: 'Safety systems ready', confidence: 99 },
    { area: 'communications', health: 'healthy', state: 'normal', headline: 'Satellite and VHF links nominal', confidence: 96 },
  ]

  return {
    identity: OWN_VESSEL_IDENTITY,
    simTimeIso: SIM_START_ISO,
    operationalMode: 'open_sea',
    navigation: {
      position: DEPARTURE_POSITION,
      heading: 322,
      courseOverGround: 322,
      speedOverGroundKn: 18.5,
      speedThroughWaterKn: 18.2,
      rateOfTurn: 0,
      gnssAvailable: true,
      gnssConfidence: 99,
      radarAvailable: true,
      aisAvailable: true,
      chartDataValid: true,
    },
    mainEngine: {
      rpm: 84,
      loadPercent: 72,
      shaftPowerKw: 21400,
      exhaustTempAvgC: 372,
      exhaustTempDeviationC: 3,
      lubOilPressureBar: 4.2,
      coolingWaterTempC: 74,
      fuelRackPosition: 68,
      runningHours: 18420,
    },
    auxMachinery: {
      generatorsOnline: 2,
      generatorLoadPercent: 61,
      auxEngineHealthScore: 96,
      compressorHealthScore: 95,
      pumpHealthScore: 97,
    },
    electricalPower: {
      totalLoadKw: 3120,
      availableCapacityKw: 5400,
      reservePercent: 42,
      busTieClosed: true,
      blackoutRiskScore: 3,
    },
    fuelEnergy: {
      fuelConsumptionRateTonPerDay: 118,
      baselineConsumptionRateTonPerDay: 116,
      fuelRemainingTons: 1840,
      co2EmissionRateTonPerDay: 368,
      specificFuelConsumptionGPerKwh: 178,
    },
    cargoReefer: buildBaselineCargoReefer(),
    safetySystems: {
      fireDetectionOnline: true,
      co2SystemReady: true,
      bilgeAlarmActive: false,
      watertightIntegrityOk: true,
      lifeSavingReady: true,
    },
    communications: {
      satelliteLinkUp: true,
      satelliteConfidence: 98,
      vhfOperational: true,
      shoreSyncLatencySec: 2.1,
      lastShoreSyncIso: SIM_START_ISO,
    },
    environment: {
      windSpeedKn: 12,
      windDirectionDeg: 210,
      waveHeightM: 1.2,
      seaState: 3,
      visibilityNm: 10,
      trafficDensity: 'low',
    },
    systemHealth,
    overallHealth: 'healthy',
  }
}

function buildBaselineCargoReefer(): CargoReeferState {
  const categories = ['Perishable — Produce', 'Perishable — Dairy', 'Pharmaceutical', 'Frozen Protein', 'General Chilled']
  const units: ReeferUnit[] = Array.from({ length: 12 }).map((_, i) => {
    const setPoint = [-18, 2, 4, -20, 4][i % 5] ?? 2
    return {
      containerRef: `RFRU-${(4000000 + i * 137).toString().slice(0, 7)}`,
      cargoCategory: categories[i % categories.length] ?? 'General Chilled',
      setPointC: setPoint,
      actualTempC: setPoint,
      returnTempC: setPoint + 1.8,
      ambientTempC: 29,
      trend: 'stable',
      powerStatus: 'on_power',
      alarmCount: 0,
      risk: 'healthy',
    }
  })

  return {
    totalContainers: 13400,
    reeferContainers: 620,
    reeferUnits: units,
    lashingStatus: 'healthy',
    stabilityStatus: 'healthy',
  }
}

export function buildBaselineTargets(): TargetVessel[] {
  return [
    {
      id: 'TGT-001',
      label: 'Synthetic Target Alpha',
      position: { latitude: 2.6, longitude: 102.6 },
      heading: 140,
      speedKn: 14,
      cpaNm: 8.4,
      tcpaMinutes: 96,
      relativeRisk: 'low',
      vesselType: 'Bulk Carrier (synthetic)',
    },
    {
      id: 'TGT-002',
      label: 'Synthetic Target Bravo',
      position: { latitude: 3.4, longitude: 101.9 },
      heading: 300,
      speedKn: 16,
      cpaNm: 6.1,
      tcpaMinutes: 140,
      relativeRisk: 'low',
      vesselType: 'Tanker (synthetic)',
    },
    {
      id: 'TGT-003',
      label: 'Synthetic Target Charlie',
      position: { latitude: 1.9, longitude: 103.1 },
      heading: 205,
      speedKn: 12,
      cpaNm: 9.8,
      tcpaMinutes: 60,
      relativeRisk: 'low',
      vesselType: 'Container Feeder (synthetic)',
    },
  ]
}

export function buildBaselineMaintenance(): MaintenanceItem[] {
  return [
    {
      id: 'MNT-001',
      component: 'Main Engine — Unit 3 Exhaust Valve',
      area: 'Main Engine',
      runningHours: 18420,
      hoursSinceOverhaul: 4120,
      maintenanceHistory: [
        { dateIso: '2025-11-02T00:00:00.000Z', action: 'Scheduled valve inspection' },
        { dateIso: '2025-06-14T00:00:00.000Z', action: 'Exhaust valve overhaul' },
      ],
      remainingUsefulLifeHours: 2600,
      failureProbabilityPercent: 6,
      predictedFailureMode: 'Progressive exhaust valve seat wear',
      confidencePercent: 82,
      spareAvailability: 'onboard',
      nextSuitableOpportunity: 'Next scheduled port call',
      estimatedDowntimeHours: 6,
      operationalConsequence: 'Localised cylinder efficiency loss if deferred beyond RUL window',
    },
    {
      id: 'MNT-002',
      component: 'Auxiliary Generator No. 2',
      area: 'Electrical / Power',
      runningHours: 9120,
      hoursSinceOverhaul: 2100,
      maintenanceHistory: [{ dateIso: '2025-09-20T00:00:00.000Z', action: 'Routine service' }],
      remainingUsefulLifeHours: 5400,
      failureProbabilityPercent: 2,
      predictedFailureMode: 'None indicated',
      confidencePercent: 90,
      spareAvailability: 'onboard',
      nextSuitableOpportunity: 'Within normal maintenance plan',
      estimatedDowntimeHours: 3,
      operationalConsequence: 'Negligible at current condition',
    },
    {
      id: 'MNT-003',
      component: 'Reefer Compressor Bank C',
      area: 'Cargo / Reefer',
      runningHours: 6400,
      hoursSinceOverhaul: 1800,
      maintenanceHistory: [{ dateIso: '2025-12-05T00:00:00.000Z', action: 'Refrigerant charge check' }],
      remainingUsefulLifeHours: 3900,
      failureProbabilityPercent: 4,
      predictedFailureMode: 'Gradual refrigerant loss',
      confidencePercent: 76,
      spareAvailability: 'next_port',
      nextSuitableOpportunity: 'Next suitable port call with technician availability',
      estimatedDowntimeHours: 4,
      operationalConsequence: 'Reduced reefer redundancy in affected bank',
    },
  ]
}
