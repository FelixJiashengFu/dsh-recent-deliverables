import assert from 'node:assert/strict'
import test from 'node:test'
import { approximateLocation, currentWeather, createWeatherService } from '../weather.js'
const location = { city: 'Demo City', country_name: 'Canada', latitude: 43.6532, longitude: -79.3832, ip: 'not-for-client', postal: 'private' }
const weather = (now) => ({ current: { weather_code: 0, is_day: 1, temperature_2m: 12.3, time: Math.floor(now / 1000) } })

test('network location is approximate, validated and strips IP/postal data', () => {
  const result = approximateLocation(location)
  assert.deepEqual(result, { city: 'Demo City', country: 'Canada', latitude: 43.7, longitude: -79.4 })
  for (const data of [{ ...location, error: true }, { ...location, latitude: 100 }, { ...location, longitude: null }, { ...location, city: '' }]) assert.throws(() => approximateLocation(data))
})

test('weather parsing rejects missing or outdated data and returns no coordinates', () => {
  const now = Date.now(), data = currentWeather(weather(now), approximateLocation(location), now)
  assert.equal(data.code, 0)
  assert.equal(data.isDay, true)
  for (const key of ['ip', 'latitude', 'longitude', 'postal']) assert.equal(key in data, false)
  for (const current of [{}, { ...weather(now).current, time: 1 }, { ...weather(now).current, temperature_2m: null }, { ...weather(now).current, is_day: 3 }]) assert.throws(() => currentWeather({ current }, location, now))
})

test('weather is opt-in, shares concurrent requests, uses fixed hosts, and caches results', async () => {
  let now = Date.now(), calls = []
  const service = createWeatherService({ now: () => now, fetch: async (url, options) => {
    calls.push(url)
    assert.equal(options.credentials, 'omit')
    assert.equal(options.redirect, 'error')
    return Response.json(String(url).startsWith('https://ipapi.co/') ? location : weather(now))
  } })
  assert.equal(calls.length, 0)
  const [a, b] = await Promise.all([service.get(), service.get()])
  assert.equal(calls.length, 2)
  assert.deepEqual(a, b)
  const url = new URL(calls[1])
  assert.equal(url.origin, 'https://api.open-meteo.com')
  assert.equal(url.searchParams.get('latitude'), '43.7')
  assert.equal(url.searchParams.get('longitude'), '-79.4')
  assert.equal(url.searchParams.get('current'), 'temperature_2m,weather_code,is_day')
  await service.get(); assert.equal(calls.length, 2)
  now += 21 * 60000
  await service.get(); assert.equal(calls.length, 4)
})

test('weather failures use a cooldown and stale data is labeled and expires', async () => {
  let now = Date.now(), fails = false, calls = 0
  const service = createWeatherService({ now: () => now, fetch: async (url) => {
    calls++
    if (fails) throw Error('offline')
    return Response.json(String(url).startsWith('https://ipapi.co/') ? location : weather(now))
  } })
  await service.get()
  now += 21 * 60000; fails = true
  assert.equal((await service.get()).stale, true)
  const before = calls
  assert.equal((await service.get()).stale, true)
  assert.equal(calls, before)
  now += 3 * 3600000
  await assert.rejects(service.get(), /weather-unavailable/)
  const failedCalls = calls
  await assert.rejects(service.get())
  assert.equal(calls, failedCalls)
})

test('invalid API JSON never becomes a sunny icon', async () => {
  const service = createWeatherService({ fetch: async () => Response.json({ error: true, reason: 'RateLimited' }) })
  await assert.rejects(service.get(), /weather-unavailable/)
})
