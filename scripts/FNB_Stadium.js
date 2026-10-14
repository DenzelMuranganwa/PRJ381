
const https = require('node:https');


const RENDER_BASE_URL = 'https://YOUR_ACTUAL_APP_NAME.onrender.com';


const SENSOR_TOKEN = process.env.SENSOR_API_TOKEN || 'iwos-secret-token-2026';

const ROUTE_POINTS = [
  { name: 'Kempton Park (R21 On-ramp)', lat: -26.1076, lon: 28.2313, alt: 1680, speed: 88, temp: 23.4, humidity: 48, irradiance: 840, wind: 12.5, rain: 0.0, battery: 98 },
  { name: 'R24 / N12 Gilloolys Interchange', lat: -26.1711, lon: 28.1408, alt: 1635, speed: 62, temp: 24.8, humidity: 52, irradiance: 810, wind: 18.2, rain: 0.0, battery: 93 },
  { name: 'M2 East (Geldenhuys / Cleveland)', lat: -26.2139, lon: 28.1215, alt: 1645, speed: 74, temp: 25.6, humidity: 45, irradiance: 790, wind: 14.1, rain: 0.0, battery: 89 },
  { name: 'Johannesburg CBD (Crown Interchange)', lat: -26.2162, lon: 28.0287, alt: 1720, speed: 42, temp: 27.2, humidity: 40, irradiance: 760, wind: 9.3, rain: 0.0, battery: 84 },
  { name: 'Nasrec / Soccer City Ave (FNB Stadium)', lat: -26.2348, lon: 27.9824, alt: 1753, speed: 25, temp: 26.5, humidity: 44, irradiance: 825, wind: 11.0, rain: 0.0, battery: 79 }
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
        console.log(`[HTTP ${res.statusCode}] Success: ${path}`);
      } else {
        console.error(`[HTTP ${res.statusCode}] Failed on ${path}: ${raw}`);
      }
    });
  });

  req.on('error', err => console.error(`Network error: ${err.message}`));
  req.write(payload);
  req.end();
}

function sendCycle() {
  const p = ROUTE_POINTS[index];
  const pressure = computePressure(p.alt);

  const weatherData = {
    temperature: p.temp,
    airTemperature: p.temp,
    humidity: p.humidity,
    irradiance: p.irradiance,
    solarIrradiance: p.irradiance,
    windSpeed: p.wind,
    rainfall: p.rain,
    pressure: pressure,
    altitude: p.alt,
    timestamp: new Date().toISOString()
  };


  const vehicleData = {
    speed: p.speed,
    vehicleSpeed: p.speed,
    battery: p.battery,
    batteryLevel: p.battery,
    latitude: p.lat,
    longitude: p.lon,
    locationName: p.name,
    timestamp: new Date().toISOString()
  };

  console.log(`\n--- Sending Telemetry: ${p.name} ---`);
  sendPost('/api/telemetry/weather', weatherData);
  sendPost('/api/telemetry/vehicle', vehicleData);

  index = (index + 1) % ROUTE_POINTS.length;
}

console.log(`Targeting server: ${RENDER_BASE_URL}`);
sendCycle();
setInterval(sendCycle, 5000);