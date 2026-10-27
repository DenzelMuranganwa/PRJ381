'use strict';

const fs = require('node:fs');
const path = require('node:path');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envPath);
}

const baseUrl = process.env.SENSOR_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const token = process.env.SENSOR_API_TOKEN;

if (!token) {
  throw new Error('SENSOR_API_TOKEN is required. Set it in the project .env before running a simulator.');
}

const parsedBaseUrl = new URL(baseUrl);
if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
  throw new Error('SENSOR_API_URL must use http:// or https://.');
}

async function postTelemetry(kind, payload) {
  const endpoint = new URL(`/api/telemetry/${kind}`, parsedBaseUrl);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(`[HTTP ${response.status}] ${endpoint.pathname}: ${responseBody}`);
  }

  console.log(`[HTTP ${response.status}] Accepted ${kind} telemetry.`);
}

async function sendTelemetry(weather, vehicle) {
  const results = await Promise.allSettled([
    postTelemetry('weather', weather),
    postTelemetry('vehicle', vehicle),
  ]);
  const failures = results
    .filter(result => result.status === 'rejected')
    .map(result => result.reason.message);

  if (failures.length) {
    throw new Error(failures.join('\n'));
  }
}

function runSimulator(tick, intervalMs) {
  let inFlight = false;
  const runTick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      await tick();
    } catch (error) {
      console.error(`Simulator tick failed: ${error.message}`);
    } finally {
      inFlight = false;
    }
  };

  void runTick();
  if (process.argv.includes('--once')) return;

  const timer = setInterval(runTick, intervalMs);
  process.once('SIGINT', () => {
    clearInterval(timer);
    console.log('\nSimulator stopped.');
  });
}

module.exports = { runSimulator, sendTelemetry };
