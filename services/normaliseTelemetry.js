'use strict';
class TelemetryError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
const WEATHER_FIELDS = {
  temperature_c: [-80, 85], humidity_pct: [0, 100], pressure_hpa: [300, 1100],
  altitude_m: [-1000, 20000], wind_speed_ms: [0, 100], latitude: [-90, 90], longitude: [-180, 180],
  irradiance_wm2: [0, 2000], rainfall_mmh: [0, 500],
};
const VEHICLE_FIELDS = { speed_kmh: [0, 250], battery_pct: [0, 100], distance_today_km: [0, 10000] };

function normalise(payload, fields, { timezoneOffset = '+02:00', now = Date.now() } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TelemetryError('Expected a JSON object');
  let timestamp = payload.timestamp;
  if (typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?$/.test(timestamp)) {
    throw new TelemetryError('timestamp must be an ISO date and time');
  }
  const timezoneAssumed = !/(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp);
  if (timezoneAssumed) timestamp += timezoneOffset;
  const [year, month, day, hour, minute, second] = timestamp.slice(0,19).split(/[-T:]/).map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
    throw new TelemetryError('Invalid calendar date or time');
  }
  const observedAt = Date.parse(timestamp);
  if (!Number.isFinite(observedAt) || observedAt > now + 5000) throw new TelemetryError('Invalid timestamp or sensor clock is ahead');
  const values = {};
  for (const [field, [min, max]] of Object.entries(fields)) {
    const value = payload[field];
    if (value === undefined || value === null) { values[field] = null; continue; }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new TelemetryError(`${field} must be a finite number between ${min} and ${max}, or null`);
    }
    values[field] = value;
  }
  if ('latitude' in fields && (values.latitude === null || values.longitude === null)) { values.latitude = null; values.longitude = null; }
  if (Object.values(values).every(value => value === null)) throw new TelemetryError('Packet contains no sensor measurements');
  return { timestamp: new Date(observedAt).toISOString(), observedAt, timezoneAssumed, values };
}
module.exports = { normalise, TelemetryError, WEATHER_FIELDS, VEHICLE_FIELDS };
