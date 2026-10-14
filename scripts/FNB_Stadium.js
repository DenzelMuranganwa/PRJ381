
const https = require('node:https');


const RENDER_BASE_URL = 'https://prj381-1-yv13.onrender.com';


const SENSOR_TOKEN = process.env.SENSOR_API_TOKEN || 'iwos-secret-token-2026';


const ROUTE_POINTS = [
  { name: 'Kempton Park (R21 On-ramp)', lat: -26.1076, lon: 28.2313, alt: 1680, speedKmh: 88.0, tempC: 23.4, humidity: 48, irradiance: 840, windMs: 3.5, rain: 0.0, battery: 98, distTodayKm: 14.2 },
  { name: 'R24 / N12 Gilloolys Interchange', lat: -26.1711, lon: 28.1408, alt: 1635, speedKmh: 62.0, tempC: 24.8, humidity: 52, irradiance: 810, windMs: 5.1, rain: 0.0, battery: 93, distTodayKm: 28.5 },
  { name: 'M2 East (Geldenhuys / Cleveland)', lat: -26.2139, lon: 28.1215, alt: 1645, speedKmh: 74.0, tempC: 25.6, humidity: 45, irradiance: 790, windMs: 3.9, rain: 0.0, battery: 89, distTodayKm: 35.1 },
  { name: 'Johannesburg CBD (Crown Interchange)', lat: -26.2162, lon: 28.0287, alt: 1720, speedKmh: 42.0, tempC: 27.2, humidity: 40, irradiance: 760, windMs: 2.6, rain: 0.0, battery: 84, distTodayKm: 46.8 },
  { name: 'Nasrec / Soccer City Ave (FNB Stadium)', lat: -26.2348, lon: 27.9824, alt: 1753, speedKmh: 25.0, tempC: 26.5, humidity: 44, irradiance: 825, windMs: 3.1, rain: 0.0, battery: 79, distTodayKm: 55.4 }
];

let index = 0;

function computePressure(alt) {
  return parseFloat((1013.25 * Math.pow(1 - (0.0065 * alt) / 288.15, 5.255)).toFixed(1));
}

function sendPost(path, data) {
  const payload = JSON.stringify(data);
  const target = new URL(RENDER_BASE_URL + path);

  const req = https.request({
    hostname: target.hostname,
    port: 443,
    path: target.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization': `Bearer ${SENSOR_TOKEN}`
    }
  }, res => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log(`[HTTP ${res.statusCode}] Success -> ${path}`);
      } else {
        console.error(`[HTTP ${res.statusCode}] Failed -> ${path}: ${raw}`);
      }
    });
  });

  req.on('error', err => console.error(`Network error: ${err.message}`));
  req.write(payload);
  req.end();
}

function sendTelemetryTick() {
  const p = ROUTE_POINTS[index];
  const pressure = computePressure(p.alt);

  
  const weatherPayload = {
    timestamp: new Date().toISOString(),
    temperature_c: p.tempC,
    humidity_pct: p.humidity,
    pressure_hpa: pressure,
    altitude_m: p.alt,
    wind_speed_ms: p.windMs,
    latitude: p.lat,
    longitude: p.lon,
    irradiance_wm2: p.irradiance,
    rainfall_mmh: p.rain
  };

  
  const vehiclePayload = {
    timestamp: new Date().toISOString(),
    speed_kmh: p.speedKmh,
    battery_pct: p.battery,
    distance_today_km: p.distTodayKm
  };

  console.log(`\n========================================================`);
  console.log(`Point: ${p.name}`);
  console.log(`Speed: ${p.speedKmh} km/h | Battery: ${p.battery}% | Irradiance: ${p.irradiance} W/m² | Temp: ${p.tempC} °C`);

  sendPost('/api/telemetry/weather', weatherPayload);
  sendPost('/api/telemetry/vehicle', vehiclePayload);

  index = (index + 1) % ROUTE_POINTS.length;
}

console.log(`Connecting to: ${RENDER_BASE_URL}`);
sendTelemetryTick();
setInterval(sendTelemetryTick, 5000);