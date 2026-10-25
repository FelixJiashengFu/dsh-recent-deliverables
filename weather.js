/** Optional, owner-authenticated weather. No file data or precise device location is used. */
const LOCATION_URL = 'https://ipapi.co/json/'
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast'
const CACHE_MS = 20 * 60 * 1000
const RETRY_MS = 60 * 1000
const MAX_STALE_MS = 2 * 60 * 60 * 1000

function unavailable() { return new Error('weather-unavailable') }
function text(value) { return typeof value === 'string' ? value.trim().slice(0, 100) : '' }

export function approximateLocation(data) {
  if (data?.error || !Number.isFinite(data?.latitude) || !Number.isFinite(data?.longitude) ||
      Math.abs(data.latitude) > 90 || Math.abs(data.longitude) > 180 || !text(data.city)) throw unavailable()
  return { city: text(data.city), country: text(data.country_name || data.country_code),
    latitude: Math.round(data.latitude * 10) / 10, longitude: Math.round(data.longitude * 10) / 10 }
}

export function currentWeather(data, location, fetchedAt) {
  const current = data?.current
  if (data?.error || !Number.isInteger(current?.weather_code) || current.weather_code < 0 || current.weather_code > 99 ||
      ![0, 1].includes(current.is_day) || !Number.isFinite(current.temperature_2m) ||
      !Number.isFinite(current.time) || Math.abs(current.time * 1000 - fetchedAt) > MAX_STALE_MS) throw unavailable()
  return { city: location.city, country: location.country, code: current.weather_code,
    isDay: current.is_day === 1, temperature: current.temperature_2m,
    observedAt: current.time * 1000, fetchedAt, approximate: true, source: 'Open-Meteo', locationSource: 'ipapi.co' }
}

export function createWeatherService({ fetch: request = globalThis.fetch, now = Date.now, signal } = {}) {
  let cached = null, inFlight = null, retryAt = 0
  const stale = () => cached && now() - cached.fetchedAt < MAX_STALE_MS ? { ...cached, stale: true } : null
  async function read(url) {
    const response = await request(url, { headers: { accept: 'application/json', 'user-agent': 'dsh-recent-deliverables/1.5 (+https://github.com/FelixJiashengFu/dsh-recent-deliverables)' },
      credentials: 'omit', redirect: 'error', signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10000)]) })
    if (!response.ok) throw unavailable()
    return response.json()
  }
  return {
    async get() {
      if (cached && now() - cached.fetchedAt < CACHE_MS) return { ...cached, stale: false }
      if (inFlight) return inFlight
      if (now() < retryAt) { const previous = stale(); if (previous) return previous; throw unavailable() }
      inFlight = (async () => {
        try {
          const location = approximateLocation(await read(LOCATION_URL))
          const url = new URL(WEATHER_URL)
          url.search = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude),
            current: 'temperature_2m,weather_code,is_day', timezone: 'auto', timeformat: 'unixtime', forecast_days: '1' }).toString()
          cached = currentWeather(await read(url.href), location, now())
          retryAt = 0
          return { ...cached, stale: false }
        } catch {
          retryAt = now() + RETRY_MS
          const previous = stale()
          if (previous) return previous
          throw unavailable()
        } finally { inFlight = null }
      })()
      return inFlight
    },
  }
}
