'use strict';
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');

function loadConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  if (isProduction && (!env.SESSION_SECRET || Buffer.byteLength(env.SESSION_SECRET) < 32)) {
    throw new Error('SESSION_SECRET must be at least 32 bytes in production');
  }
  const number = (key, fallback, min, max) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
    return value;
  };
  const source = env.SENSOR_SOURCE || 'http';
  if (!['http', 'mqtt'].includes(source)) throw new Error('SENSOR_SOURCE must be http or mqtt');
  const offset = env.SENSOR_TIMEZONE_OFFSET || '+02:00';
  if (!/^[+-](?:0\d|1[0-3]):[0-5]\d$|^[+-]14:00$/.test(offset)) throw new Error('Invalid SENSOR_TIMEZONE_OFFSET');
  return {
    root: path.resolve(__dirname, '..'), port: number('PORT', 3000, 0, 65535),
    host: env.HOST || '127.0.0.1', source, token: env.SENSOR_API_TOKEN || '',
    simulationEnabled: !isProduction && env.ENABLE_TELEMETRY_SIMULATION !== 'false',
    mongodbUri: env.MONGODB_URI || '',
    sessionSecret: env.SESSION_SECRET || randomBytes(32).toString('hex'), isProduction,
    timezoneOffset: offset, staleAfterMs: number('SENSOR_STALE_SECONDS', 60, 10, 3600) * 1000,
    mqtt: {
      host: env.MQTT_HOST || '', port: number('MQTT_PORT', 8883, 1, 65535),
      topic: env.MQTT_TOPIC || 'iwos/weather',
      clientId: env.MQTT_CLIENT_ID || `iwos-dashboard-${randomUUID()}`,
      caPath: env.MQTT_CA_PATH || '', certPath: env.MQTT_CERT_PATH || '', keyPath: env.MQTT_KEY_PATH || '',
    },
  };
}
module.exports = { loadConfig };
