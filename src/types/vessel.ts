import type { HealthLevel, OperationalMode, SystemState, VesselSystemArea } from './common'

export interface VesselIdentity {
  name: string
  callSign: string
  imoDemo: string
  vesselType: string
  teuCapacity: number
  flagStateDemo: string
  yearBuiltDemo: number
}

export interface GeoPosition {
  latitude: number
  longitude: number
}

export interface NavigationState {
  position: GeoPosition
  heading: number
  courseOverGround: number
  speedOverGroundKn: number
  speedThroughWaterKn: number
  rateOfTurn: number
  gnssAvailable: boolean
  gnssConfidence: number
  radarAvailable: boolean
  aisAvailable: boolean
  chartDataValid: boolean
}

export interface MainEngineState {
  rpm: number
  loadPercent: number
  shaftPowerKw: number
  exhaustTempAvgC: number
  exhaustTempDeviationC: number
  /** Per-cylinder exhaust temperature deviation (°C above baseline), one entry per monitored unit. A
   * widening spread across cylinders is itself a genuine multivariate anomaly signal, independent
   * of the average. */
  cylinderExhaustDeviationsC: number[]
  lubOilPressureBar: number
  coolingWaterTempC: number
  fuelRackPosition: number
  runningHours: number
}

export interface AuxMachineryState {
  generatorsOnline: number
  generatorLoadPercent: number
  auxEngineHealthScore: number
  compressorHealthScore: number
  pumpHealthScore: number
}

export interface ElectricalPowerState {
  totalLoadKw: number
  availableCapacityKw: number
  reservePercent: number
  busTieClosed: boolean
  blackoutRiskScore: number
}

export interface FuelEnergyState {
  fuelConsumptionRateTonPerDay: number
  baselineConsumptionRateTonPerDay: number
  fuelRemainingTons: number
  co2EmissionRateTonPerDay: number
  specificFuelConsumptionGPerKwh: number
}

export interface ReeferUnit {
  containerRef: string
  cargoCategory: string
  setPointC: number
  /** Supply-air temperature — the primary controlled reading, historically exposed as `actualTempC`. */
  actualTempC: number
  /** Return-air temperature — supply plus the cargo's heat load; a widening supply/return spread is itself diagnostic. */
  returnTempC: number
  /** Ambient temperature around the reefer bay, influencing compressor duty and power draw margin. */
  ambientTempC: number
  trend: 'stable' | 'rising' | 'falling'
  powerStatus: 'on_power' | 'power_fluctuation' | 'off_power'
  alarmCount: number
  risk: HealthLevel
}

export interface CargoReeferState {
  totalContainers: number
  reeferContainers: number
  reeferUnits: ReeferUnit[]
  lashingStatus: HealthLevel
  stabilityStatus: HealthLevel
}

export interface SafetySystemsState {
  fireDetectionOnline: boolean
  co2SystemReady: boolean
  bilgeAlarmActive: boolean
  watertightIntegrityOk: boolean
  lifeSavingReady: boolean
}

export interface CommunicationsState {
  satelliteLinkUp: boolean
  satelliteConfidence: number
  vhfOperational: boolean
  shoreSyncLatencySec: number
  lastShoreSyncIso: string
}

export interface EnvironmentState {
  windSpeedKn: number
  windDirectionDeg: number
  waveHeightM: number
  seaState: number
  visibilityNm: number
  trafficDensity: 'low' | 'moderate' | 'high'
}

export interface SystemHealthSummary {
  area: VesselSystemArea
  health: HealthLevel
  state: SystemState
  headline: string
  confidence: number
}

export interface VesselSnapshot {
  identity: VesselIdentity
  simTimeIso: string
  operationalMode: OperationalMode
  navigation: NavigationState
  mainEngine: MainEngineState
  auxMachinery: AuxMachineryState
  electricalPower: ElectricalPowerState
  fuelEnergy: FuelEnergyState
  cargoReefer: CargoReeferState
  safetySystems: SafetySystemsState
  communications: CommunicationsState
  environment: EnvironmentState
  systemHealth: SystemHealthSummary[]
  overallHealth: HealthLevel
}
