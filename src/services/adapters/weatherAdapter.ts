import type { AdapterConnectionState, VesselSnapshot } from '@/types'
import { attemptConnectedCall } from './connectedGateway'
import { CONNECTED_API_ENDPOINTS } from '../pocMode'

export interface WeatherReading {
  windSpeedKn: number
  waveHeightM: number
  visibilityNm: number
  seaState: number
  source: 'simulated' | 'connected'
}

/** Environmental conditions currently come from the same synthetic simulation that drives the
 * rest of the vessel snapshot — this interface exists so a real external weather/environmental
 * feed can be substituted for the simulated one without any calling component changing. */
export interface WeatherAdapter {
  readonly kind: 'demo' | 'connected'
  getCurrentConditions(snapshot: VesselSnapshot): Promise<WeatherReading>
  /** Raw connectivity check — unlike getCurrentConditions (which always resolves, falling back
   * internally so callers never have to handle failure), this reports the true connection state
   * so status surfaces (Command Ribbon, System Assurance) never mistake a fallback for success. */
  checkStatus(): Promise<AdapterConnectionState>
}

export const demoWeatherAdapter: WeatherAdapter = {
  kind: 'demo',
  getCurrentConditions: async (snapshot) => ({
    windSpeedKn: snapshot.environment.windSpeedKn,
    waveHeightM: snapshot.environment.waveHeightM,
    visibilityNm: snapshot.environment.visibilityNm,
    seaState: snapshot.environment.seaState,
    source: 'simulated',
  }),
  checkStatus: async () => 'simulated',
}

/**
 * Weather values feed `snapshot.environment`, which the ODD engine reads for its visibility and
 * wave-height envelope checks. This is the one adapter whose data could otherwise move a
 * function from OUTSIDE to INSIDE the envelope and flip a verdict, so every field is both
 * type-checked and range-checked here. An implausible reading is a broken sensor, not an
 * extreme-but-valid measurement, and is rejected rather than trusted.
 */
function isWeatherReading(value: unknown): value is WeatherReading {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  const inRange = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
  return (
    inRange(c.windSpeedKn, 0, 200) &&
    inRange(c.waveHeightM, 0, 30) &&
    inRange(c.visibilityNm, 0, 50) &&
    inRange(c.seaState, 0, 9)
  )
}

export const connectedWeatherAdapter: WeatherAdapter = {
  kind: 'connected',
  getCurrentConditions: async (snapshot) => {
    const result = await attemptConnectedCall<WeatherReading>(
      `${CONNECTED_API_ENDPOINTS.weather}?lat=${snapshot.navigation.position.latitude}&lon=${snapshot.navigation.position.longitude}`,
      undefined,
      undefined,
      isWeatherReading,
    )
    if (result.ok && result.data) return { ...result.data, source: 'connected' }
    return demoWeatherAdapter.getCurrentConditions(snapshot)
  },
  checkStatus: async () => (await attemptConnectedCall(CONNECTED_API_ENDPOINTS.weather)).status,
}

export function resolveWeatherAdapter(mode: 'offline' | 'connected'): WeatherAdapter {
  return mode === 'connected' ? connectedWeatherAdapter : demoWeatherAdapter
}
