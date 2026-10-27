'use strict';
const { normalise, TelemetryError, WEATHER_FIELDS, VEHICLE_FIELDS } = require('./normaliseTelemetry');

class TelemetryStore {
  constructor(config, clock = Date.now) {
    this.config = config; this.clock = clock;
    this.weather = null; this.vehicle = null; this.history = [];
    this.startedAt = new Date(clock()).toISOString();
    this.stats = { accepted: 0, rejected: 0, duplicates: 0, vehicleAccepted: 0 };
    this.transport = { state: config.source === 'http' ? 'listening' : 'connecting', message: null };
  }
  ingest(payload, kind = 'weather', source = this.config.source) {
    try {
      if (!['weather', 'vehicle'].includes(kind)) throw new TelemetryError('Unknown telemetry kind');
      const packet = normalise(payload, kind === 'weather' ? WEATHER_FIELDS : VEHICLE_FIELDS,
        { timezoneOffset: this.config.timezoneOffset, now: this.clock() });
      const previous = this[kind];
      if (previous && packet.observedAt === previous.observedAt) {
        this.stats.duplicates += 1; return { accepted: false, duplicate: true };
      }
      if (previous && packet.observedAt < previous.observedAt) throw new TelemetryError('Out-of-order reading ignored', 409);
      this[kind] = { ...packet, receivedAt: this.clock(), source };
      if (kind === 'weather') {
        // Capture the vehicle values known at this observation, never backfill history.
        const vehicleAge = this.vehicle ? packet.observedAt - this.vehicle.observedAt : Infinity;
        this.weather.vehicleValues = vehicleAge >= 0 && vehicleAge <= this.config.staleAfterMs ? { ...this.vehicle.values } : null;
        this.stats.accepted += 1;
        if (previous && packet.observedAt - previous.observedAt > this.config.staleAfterMs) this.history = [];
        this.history.push(this.weather);
        if (this.history.length > 120) this.history.shift();
      } else this.stats.vehicleAccepted += 1;
      return { accepted: true, duplicate: false };
    } catch (error) { this.stats.rejected += 1; throw error; }
  }
  snapshot() {
    const now = this.clock();
    const age = packet => packet ? Math.max(0, now - packet.observedAt) : null;
    const weatherAgeMs = age(this.weather), vehicleAgeMs = age(this.vehicle);
    return {
      now, state: !this.weather ? 'waiting' : weatherAgeMs > this.config.staleAfterMs ? 'stale' : 'live',
      weatherAgeMs, vehicleAgeMs, vehicleFresh: this.vehicle !== null && vehicleAgeMs <= this.config.staleAfterMs,
      weather: this.weather, vehicle: this.vehicle, history: this.history,
      transport: { ...this.transport }, stats: { ...this.stats }, startedAt: this.startedAt,
    };
  }
}
module.exports = { TelemetryStore };
