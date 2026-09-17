import type {
  CargoReeferState,
  Hazard,
  MaintenanceItem,
  ReeferUnit,
  SystemHealthSummary,
  TargetVessel,
  VesselSnapshot,
} from '@/types'
import { OWN_VESSEL_IDENTITY } from '@/data/vesselIdentity'
import { DEPARTURE_POSITION } from '@/data/route'
import { buildRiskAssessment } from '@/decision-engine/riskMatrix'

export const SIM_START_ISO = '2026-03-11T02:00:00.000Z'

export function buildBaselineSnapshot(): VesselSnapshot {
  const systemHealth: SystemHealthSummary[] = [
    { area: 'navigation', health: 'healthy', state: 'normal', headline: 'All navigation sensors nominal', confidence: 98 , dataAvailabilityPercent: 98, availabilityStatus: 'ok' },
    { area: 'main_engine', health: 'healthy', state: 'normal', headline: 'Main engine within baseline parameters', confidence: 97 , dataAvailabilityPercent: 97, availabilityStatus: 'ok' },
    { area: 'auxiliary_machinery', health: 'healthy', state: 'normal', headline: 'Auxiliary machinery nominal', confidence: 96 , dataAvailabilityPercent: 96, availabilityStatus: 'ok' },
    { area: 'electrical_power', health: 'healthy', state: 'normal', headline: 'Power generation stable, healthy reserve', confidence: 97 , dataAvailabilityPercent: 97, availabilityStatus: 'ok' },
    { area: 'fuel_energy', health: 'healthy', state: 'normal', headline: 'Fuel consumption tracking baseline', confidence: 95 , dataAvailabilityPercent: 95, availabilityStatus: 'ok' },
    { area: 'cargo_reefer', health: 'healthy', state: 'normal', headline: 'All reefer units within set point', confidence: 98 , dataAvailabilityPercent: 98, availabilityStatus: 'ok' },
    { area: 'safety', health: 'healthy', state: 'normal', headline: 'Safety systems ready', confidence: 99 , dataAvailabilityPercent: 99, availabilityStatus: 'ok' },
    { area: 'communications', health: 'healthy', state: 'normal', headline: 'Satellite and VHF links nominal', confidence: 96 , dataAvailabilityPercent: 96, availabilityStatus: 'ok' },
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
      cylinderExhaustDeviationsC: [3, 2.8, 3.1, 2.9, 3.2, 3],
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

/**
 * A busy tactical picture, not a single faint contact: IMO MSC.192(79) sizes a ≥10,000 gt vessel's
 * target capacity at 40 acquired radar targets, 40 activated AIS targets and 200 sleeping AIS
 * targets, so a demonstrator display showing one target does not read as a credible operating
 * picture. TGT-001/002/003 are the original long-range contacts (one of which the collision-risk
 * scenario steers); TGT-004 onward are close-range background traffic — mostly sleeping AIS
 * contacts, a handful activated — so the navigation picture has real density at tactical range
 * without changing the existing scenario behaviour.
 */
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
      activated: true,
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
      activated: true,
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
      activated: true,
    },
    {
      id: 'TGT-004',
      label: 'Synthetic Target Delta',
      position: { latitude: 1.4, longitude: 103.9 },
      heading: 90,
      speedKn: 10,
      cpaNm: 5.2,
      tcpaMinutes: 45,
      relativeRisk: 'low',
      vesselType: 'Fishing Vessel (synthetic)',
      activated: false,
    },
    {
      id: 'TGT-005',
      label: 'Synthetic Target Echo',
      position: { latitude: 1.2, longitude: 104.0 },
      heading: 200,
      speedKn: 14,
      cpaNm: 4.1,
      tcpaMinutes: 30,
      relativeRisk: 'low',
      vesselType: 'General Cargo (synthetic)',
      activated: false,
    },
    {
      id: 'TGT-006',
      label: 'Synthetic Target Foxtrot',
      position: { latitude: 1.48, longitude: 103.75 },
      heading: 45,
      speedKn: 8,
      cpaNm: 6.5,
      tcpaMinutes: 55,
      relativeRisk: 'low',
      vesselType: 'Tug (synthetic)',
      activated: false,
    },
    {
      id: 'TGT-007',
      label: 'Synthetic Target Golf',
      position: { latitude: 1.13, longitude: 103.8 },
      heading: 350,
      speedKn: 12,
      cpaNm: 2.8,
      tcpaMinutes: 18,
      relativeRisk: 'low',
      vesselType: 'Product Tanker (synthetic)',
      activated: true,
    },
    {
      id: 'TGT-008',
      label: 'Synthetic Target Hotel',
      position: { latitude: 1.31, longitude: 104.1 },
      heading: 260,
      speedKn: 16,
      cpaNm: 7.3,
      tcpaMinutes: 40,
      relativeRisk: 'low',
      vesselType: 'Container Feeder (synthetic)',
      activated: false,
    },
    {
      id: 'TGT-009',
      label: 'Synthetic Target India',
      position: { latitude: 1.58, longitude: 103.87 },
      heading: 180,
      speedKn: 9,
      cpaNm: 5.9,
      tcpaMinutes: 60,
      relativeRisk: 'low',
      vesselType: 'Fishing Vessel (synthetic)',
      activated: false,
    },
    {
      id: 'TGT-010',
      label: 'Synthetic Target Juliett',
      position: { latitude: 1.03, longitude: 103.93 },
      heading: 30,
      speedKn: 13,
      cpaNm: 8.1,
      tcpaMinutes: 50,
      relativeRisk: 'low',
      vesselType: 'Bulk Carrier (synthetic)',
      activated: false,
    },
    {
      id: 'TGT-011',
      label: 'Synthetic Target Kilo',
      position: { latitude: 1.33, longitude: 103.65 },
      heading: 110,
      speedKn: 11,
      cpaNm: 3.4,
      tcpaMinutes: 22,
      relativeRisk: 'low',
      vesselType: 'General Cargo (synthetic)',
      activated: true,
    },
    {
      id: 'TGT-012',
      label: 'Synthetic Target Lima',
      position: { latitude: 1.26, longitude: 103.55 },
      heading: 75,
      speedKn: 15,
      cpaNm: 9.0,
      tcpaMinutes: 48,
      relativeRisk: 'low',
      vesselType: 'Passenger Ferry (synthetic)',
      activated: false,
    },
    {
      id: 'TGT-013',
      label: 'Synthetic Target Mike',
      position: { latitude: 1.43, longitude: 104.0 },
      heading: 225,
      speedKn: 10,
      cpaNm: 6.0,
      tcpaMinutes: 35,
      relativeRisk: 'low',
      vesselType: 'Product Tanker (synthetic)',
      activated: false,
    },
    {
      id: 'TGT-014',
      label: 'Synthetic Target November',
      position: { latitude: 1.18, longitude: 103.87 },
      heading: 300,
      speedKn: 7,
      cpaNm: 2.1,
      tcpaMinutes: 15,
      relativeRisk: 'low',
      vesselType: 'Tug (synthetic)',
      activated: false,
    },
    {
      id: 'TGT-015',
      label: 'Synthetic Target Oscar',
      position: { latitude: 1.3, longitude: 103.93 },
      heading: 150,
      speedKn: 12,
      cpaNm: 3.9,
      tcpaMinutes: 20,
      relativeRisk: 'low',
      vesselType: 'Container Feeder (synthetic)',
      activated: true,
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

function hoursBeforeStart(hours: number): string {
  return new Date(new Date(SIM_START_ISO).getTime() - hours * 3_600_000).toISOString()
}

/**
 * A realistic hazard register — several hazards across categories in varied lifecycle states, not
 * the single card the old static view showed. Exercises the risk matrix (several markers, an
 * initial-to-residual arrow wherever a corrective action has been recorded), the register's
 * filtering/sorting, and the OVERDUE state (several of these are already past their RI-band
 * target response time at simulation start, exactly like the "open 2h23m, stated nowhere" defect
 * this rebuild fixes).
 */
export function buildBaselineHazards(): Hazard[] {
  return [
    {
      id: 'HAZ-B00001',
      title: 'Cargo Lashing Fatigue — Bay 4 Container Stack',
      category: 'cargo',
      peopleExposed: 2,
      immediateMitigation: 'Visual inspection completed; no shifted containers observed. Bay flagged for enhanced monitoring.',
      recommendedCorrectiveAction: 'Re-tension lashings and replace fatigued twist-locks at next suitable opportunity.',
      // RI 8, intolerable — deliberately the register's live "Master decision required" example.
      // Category 'cargo' constrains only reefer_monitoring (see oddFunctions.ts
      // hazardSensitiveCategories), not the machinery/voyage functions other scenarios exercise
      // at their own nominal envelope — "flooding constrains different functions than a cargo
      // hazard" (spec §6) is exactly this differentiation, not a coincidence.
      initialRisk: buildRiskAssessment(5, 3),
      residualRisk: buildRiskAssessment(5, 3),
      status: 'assigned',
      raisedAtIso: hoursBeforeStart(6),
      owner: { role: 'safety_specialist', assignedAtIso: hoursBeforeStart(5.5) },
      correlatedAlarmTags: [],
    },
    {
      id: 'HAZ-B00002',
      title: 'Radar Sea-Clutter Suppression Fault — X-Band Unit',
      category: 'navigation',
      peopleExposed: 0,
      immediateMitigation: 'Bridge team briefed to cross-check with S-band radar and visual lookout in heavy sea states.',
      recommendedCorrectiveAction: 'Technician reset of clutter suppression module; escalate to shore support if fault persists.',
      initialRisk: buildRiskAssessment(3, 2), // RI 5, ALARP
      residualRisk: buildRiskAssessment(3, 2),
      status: 'identified',
      raisedAtIso: hoursBeforeStart(1),
      correlatedAlarmTags: [],
    },
    {
      id: 'HAZ-B00003',
      title: 'Auxiliary Engine No. 2 Cooling-Water Leak',
      category: 'machinery',
      peopleExposed: 1,
      immediateMitigation: 'Leak rate confirmed low and stable; make-up water topped up; hourly rounds increased.',
      recommendedCorrectiveAction: 'Isolate and inspect the jacket-water circuit; renew the suspected gasket.',
      initialRisk: buildRiskAssessment(4, 3), // RI 7, ALARP — serious and under active investigation, not (yet) intolerable
      residualRisk: buildRiskAssessment(4, 3),
      status: 'under_investigation',
      raisedAtIso: hoursBeforeStart(0.75),
      owner: { role: 'chief_engineer', assignedAtIso: hoursBeforeStart(0.6) },
      correlatedAlarmTags: [],
    },
    {
      id: 'HAZ-B00004',
      title: 'Crew Laceration — Galley Preparation Area',
      category: 'personnel',
      peopleExposed: 1,
      immediateMitigation: 'First aid administered; crew member fit for light duties.',
      recommendedCorrectiveAction: 'Replace worn cutting-board non-slip matting and refresh galley safety briefing.',
      initialRisk: buildRiskAssessment(5, 1), // RI 6, ALARP
      residualRisk: buildRiskAssessment(3, 1), // RI 4 — mitigation credit earned, corrective action recorded
      status: 'closed',
      raisedAtIso: hoursBeforeStart(50),
      owner: { role: 'master', assignedAtIso: hoursBeforeStart(49) },
      correctiveAction: { description: 'Non-slip matting replaced across all galley cutting stations; safety briefing refreshed with full catering crew.', recordedAtIso: hoursBeforeStart(30), recordedByRole: 'master' },
      verification: { note: 'No recurrence over two full galley rotations; matting inspected and holding.', verifiedAtIso: hoursBeforeStart(4), verifiedByRole: 'master' },
      correlatedAlarmTags: [],
    },
    {
      id: 'HAZ-B00005',
      title: 'Fuel Oil Transfer Valve Mislabelling — Engine Room',
      category: 'environmental',
      peopleExposed: 2,
      immediateMitigation: 'Affected valves tagged out and manually verified before each transfer pending relabelling.',
      recommendedCorrectiveAction: 'Relabel all fuel transfer valves per the piping diagram and re-brief engine room watchkeepers.',
      initialRisk: buildRiskAssessment(3, 3), // RI 6, ALARP
      residualRisk: buildRiskAssessment(1, 3), // RI 4 — corrective action recorded
      status: 'corrective_action',
      raisedAtIso: hoursBeforeStart(5),
      owner: { role: 'chief_engineer', assignedAtIso: hoursBeforeStart(4.5) },
      correctiveAction: { description: 'All fuel transfer valves relabelled against the current piping diagram; watchkeepers re-briefed and sign-off logged.', recordedAtIso: hoursBeforeStart(1.5), recordedByRole: 'chief_engineer' },
      correlatedAlarmTags: [],
    },
    {
      id: 'HAZ-B00006',
      title: 'Unauthorised Access to Restricted Deck Area',
      category: 'security',
      peopleExposed: 0,
      immediateMitigation: 'Area re-secured; access log reviewed, no cargo or equipment interference found.',
      recommendedCorrectiveAction: 'Review restricted-area signage and access-control procedure at next port.',
      initialRisk: buildRiskAssessment(2, 2), // RI 4, broadly acceptable
      residualRisk: buildRiskAssessment(2, 2),
      status: 'acknowledged',
      raisedAtIso: hoursBeforeStart(0.2),
      correlatedAlarmTags: [],
    },
    {
      id: 'HAZ-B00007',
      title: 'Reefer Bank B Power Fluctuation — Adjacent Unit Risk',
      category: 'cargo',
      peopleExposed: 0,
      immediateMitigation: 'Adjacent reefer units placed on enhanced temperature monitoring pending resolution.',
      recommendedCorrectiveAction: 'Technical superintendent review of the power distribution fault upstream of Bank B.',
      initialRisk: buildRiskAssessment(4, 1), // RI 5, ALARP
      residualRisk: buildRiskAssessment(4, 1),
      status: 'escalated',
      raisedAtIso: hoursBeforeStart(8),
      owner: { role: 'chief_engineer', assignedAtIso: hoursBeforeStart(7.5) },
      escalation: { escalatedToRole: 'technical_superintendent', escalatedAtIso: hoursBeforeStart(2), note: 'Onboard troubleshooting inconclusive; requesting shore technical review of the upstream distribution fault.', preEscalationStatus: 'assigned' },
      correlatedAlarmTags: [],
    },
  ]
}
