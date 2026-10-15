'use strict';

const { runSimulator, sendTelemetry } = require('./telemetry-client');

/**
 * Solar Car Driveway Simulator
 * Pushes moving GPS coordinates and simulated weather/vehicle readings.
 */
const mockDriveway = [
  { lat: -25.7479, lng: 28.2293, speed: 0, wind: 12, irr: 840, temp: 26.2 },
  { lat: -25.7501, lng: 28.2305, speed: 25, wind: 13, irr: 848, temp: 26.4 },
  { lat: -25.7528, lng: 28.2320, speed: 42, wind: 14, irr: 852, temp: 26.5 },
  { lat: -25.7554, lng: 28.2338, speed: 55, wind: 15, irr: 860, temp: 26.7 },
  { lat: -25.7580, lng: 28.2351, speed: 50, wind: 14, irr: 865, temp: 26.8 },
  { lat: -25.7608, lng: 28.2360, speed: 30, wind: 13, irr: 859, temp: 26.9 },
  { lat: -25.7632, lng: 28.2366, speed: 45, wind: 12, irr: 850, temp: 27.0 },
  { lat: -25.7655, lng: 28.2370, speed: 40, wind: 13, irr: 845, temp: 27.1 },
  { lat: -25.7674, lng: 28.2372, speed: 18, wind: 11, irr: 840, temp: 27.0 },
  { lat: -25.7680, lng: 28.2375, speed: 0, wind: 10, irr: 835, temp: 26.8 }
];

let idx = 0;

async function sendTelemetryPulse() {
  const current = mockDriveway[idx];
  const timestamp = new Date().toISOString();
  const weatherPayload = {
    timestamp,
    latitude: current.lat,
    longitude: current.lng,
    temperature_c: current.temp,
    humidity_pct: 42,
    pressure_hpa: 1014,
    altitude_m: 1340,
    wind_speed_ms: current.wind / 3.6,
    irradiance_wm2: current.irr,
    rainfall_mmh: 0,
  };
  const vehiclePayload = {
    timestamp,
    speed_kmh: current.speed,
    battery_pct: Math.max(0, 100 - idx * 0.3),
    distance_today_km: idx * 0.8,
  };

  console.log(`[SIMULATOR] Step ${idx + 1}/${mockDriveway.length}: Position [${current.lat}, ${current.lng}] - Speed ${current.speed} km/h`);
  await sendTelemetry(weatherPayload, vehiclePayload);
  idx = (idx + 1) % mockDriveway.length;
}

console.log('Solar vehicle movement simulation sending data to the dashboard.');
console.log('Use --once to send one position and exit.');
runSimulator(sendTelemetryPulse, 3000);
