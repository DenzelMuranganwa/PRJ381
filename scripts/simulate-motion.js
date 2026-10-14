'use strict';

/**
 * Solar Car Driveway Simulator
 * Pushes moving GPS coordinates + realistic solar telemetry readings
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
const SERVER_URL = 'http://localhost:3000/api/sensor-data'; // Adjust if using token or MQTT
const SENSOR_TOKEN = process.env.SENSOR_API_TOKEN || '';

async function sendTelemetryPulse() {
  const current = mockDriveway[idx];
  const payload = {
    latitude: current.lat.toString(),
    longitude: current.lng.toString(),
    speed: current.speed,
    irradiance: current.irr,
    temperature: current.temp,
    wind: current.wind,
    rainfall: 0,
    humidity: 42,
    pressure: 1014,
    altitude: 1340,
    timestamp: new Date().toISOString()
  };

  console.log(`[SIMULATOR] Step ${idx + 1}/${mockDriveway.length}: Pos [${payload.latitude}, ${payload.longitude}] - Speed ${payload.speed} km/h`);

  try {
    const res = await fetch(SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SENSOR_TOKEN ? { 'Authorization': `Bearer ${SENSOR_TOKEN}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.warn(`Server responded with ${res.status}`);
    }
  } catch (err) {
    console.log(`(Pulse sent locally - ${err.message})`);
  }

  idx = (idx + 1) % mockDriveway.length; // Loops continuously
}

console.log(' Solar Vehicle Movement Simulation running...');
console.log('Emitting vehicle positions every 3 seconds...');
setInterval(sendTelemetryPulse, 3000);
sendTelemetryPulse();