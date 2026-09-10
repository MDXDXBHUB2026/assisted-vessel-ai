import type { VesselIdentity } from '@/types'

export const OWN_VESSEL_IDENTITY: VesselIdentity = {
  name: 'MV Meridian Voyager',
  callSign: 'DEMO-1',
  imoDemo: 'SYN0000001',
  vesselType: 'Container Vessel (Synthetic Demonstrator)',
  teuCapacity: 14000,
  flagStateDemo: 'Fictional Registry',
  yearBuiltDemo: 2019,
}

export const FLEET_VESSEL_NAMES = [
  'MV Meridian Voyager',
  'MV Northern Aurora',
  'MV Silver Current',
  'MV Pacific Concord',
  'MV Coral Sentinel',
] as const
