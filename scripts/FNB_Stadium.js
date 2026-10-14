// scripts/mockSender.js
const https = require('node:https');

// 1. Put your live Render URL here (no trailing slash)
const RENDER_BASE_URL = 'https://your-service-name.onrender.com';

// Common telemetry endpoint paths: check if yours is /api/telemetry, /api/sensor, or /api/weather
const ENDPOINT_PATH = '/api/telemetry'; 
const SENSOR_TOKEN = process.env.SENSOR_API_TOKEN || '';

// Route toward FNB Stadium with full physics & sensor profiles
const ROUTE_POINTS = [
  {
    name: 'Kempton Park (R21 On-ramp)',
    lat: -26.1076,
    lon: 28.2313,
    altitude: 1680,
    speed: 88,
    temp: 23.4,
    humidity: 48,
    irradiance: 840, 
    wind: 12.5,
    rainfall: 0.0,
    battery: 98
  },
  {
    name: 'R24 / N12 Gilloolys Interchange',
    lat: -26.1711,
    lon: 28.1408,
    altitude: 1635,
    speed: 62,
    temp: 24.8,
    humidity: 52,
    irradiance: 810,
    wind: 18.2,
    rainfall: 0.0,
    battery: 93
  },
  {
    name: 'M2 East (Geldenhuys / Cleveland)',
    lat: -26.2139,
    lon: 28.1215,
    altitude: 1645,
    speed: 74,
    temp: 25.6,
    humidity: 45,
    irradiance: 790,
    wind: 14.1,
    rainfall: 0.0,
    battery: 89
  },
  {
    name: 'Johannesburg CBD (M2 Crown Interchange)',
    lat: -26.2162,
    lon: 28.0287,
    altitude: 1720,
    speed: 42,
    temp: 27.2, // Urban heat effect
    humidity: 40,
    irradiance: 760,
    wind: 9.3,
    rainfall: 0.0,
    battery: 84
  },
  {
    name: 'Nasrec / Soccer City Ave (FNB Stadium)',
    lat: -26.2348,
    lon: 27.9824,
    altitude: 1753,
    speed: 25,
    temp: 26.5,
    humidity: 44,
    irradiance: 825,
    wind: 11.0,
    rainfall: 0.0,
    battery: 79
  }
];

let index = 0;
let prevData = null;

function calculatePressure(alt) {
  return parseFloat((1013.25 * Math.pow(1 - (0.0065 * alt) / 288.15, 5.255)).toFixed(1));
}

function buildPayload() {
  const p = ROUTE_POINTS[index];
  
  // Add micro jitter to simulate real moving vehicle sensors
  const jitterLat = (Math.random() - 0.5) * 0.001;
  const jitterLon = (Math.random() - 0.5) * 0.001;
  const speed = Math.max(0, parseFloat((p.speed + (Math.random() - 0.5) * 4).toFixed(1)));
  const temp = parseFloat((p.temp + (Math.random() - 0.5) * 0.4).toFixed(1));
  const irradiance = Math.round(p.irradiance + (Math.random() - 0.5) * 20);
  const wind = parseFloat((p.wind + (Math.random() - 0.5) * 2).toFixed(1));
  const humidity = Math.round(p.humidity + (Math.random() - 0.5) * 2);
  const altitude = Math.round(p.altitude + (Math.random() - 0.5) * 3);
  const pressure = calculatePressure(altitude);
  const battery = p.battery;

  // We provide both flat keys AND nested structures so whichever format your server/store expects is satisfied!
  const payload = {
    // Identity & Time
    deviceId: 'IWOS-FIELD-01',
    timestamp: new Date().toISOString(),
    locationName: p.name,

    // Primary Sensor Cards (Flat keys matching dashboard UI)
    irradiance: irradiance,
    solarIrradiance: irradiance,
    airTemperature: temp,
    temperature: temp,
    temp: temp,
    windSpeed: wind,
    wind: wind,
    rainfall: p.rainfall,
    rain: p.rainfall,
    humidity: humidity,
    pressure: pressure,
    barometricPressure: pressure,
    altitude: altitude,

    // Vehicle & Battery (Required by AI Optimisation Engine)
    vehicleSpeed: speed,
    speed: speed,
    speedKmH: speed,
    batteryLevel: battery,
    battery: battery,
    soc: battery, // State of Charge

    // GPS track coordinates
    latitude: parseFloat((p.lat + jitterLat).toFixed(5)),
    longitude: parseFloat((p.lon + jitterLon).toFixed(5)),
    lat: parseFloat((p.lat + jitterLat).toFixed(5)),
    lon: parseFloat((p.lon + jitterLon).toFixed(5)),

    // Nested fallback format (in case app uses nested telemetry schema)
    weather: {
      temperature: temp,
      irradiance: irradiance,
      humidity: humidity,
      pressure: pressure,
      windSpeed: wind,
      rainfall: p.rainfall
    },
    gps: {
      latitude: parseFloat((p.lat + jitterLat).toFixed(5)),
      longitude: parseFloat((p.lon + jitterLon).toFixed(5)),
      speedKmH: speed,
      altitudeM: altitude
    },

    // Changes / Deltas
    changes: {
      deltaSpeed: prevData ? parseFloat((speed - prevData.speed).toFixed(1)) : 0,
      deltaTemp: prevData ? parseFloat((temp - prevData.temperature).toFixed(1)) : 0,
      deltaIrradiance: prevData ? Math.round(irradiance - prevData.irradiance) : 0,
      deltaWind: prevData ? parseFloat((wind - prevData.windSpeed).toFixed(1)) : 0,
      deltaAltitude: prevData ? Math.round(altitude - prevData.altitude) : 0
    }
  };

  prevData = { speed, temperature: temp, irradiance, windSpeed: wind, altitude };
  index = (index + 1) % ROUTE_POINTS.length;
  return payload;
}

function sendMockData() {
  const telemetry = buildPayload();
  const payloadString = JSON.stringify(telemetry);
  const url = new URL(RENDER_BASE_URL + ENDPOINT_PATH);

  const req = https.request(
    {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadString),
        ...(SENSOR_TOKEN ? { Authorization: `Bearer ${SENSOR_TOKEN}` } : {})
      }
    },
    res => {
      console.log(`[HTTP ${res.statusCode}] Transmitted: ${telemetry.locationName}`);
      console.log(`  Irradiance: ${telemetry.irradiance} W/m² | Atmos: ${telemetry.temperature}°C |  Wind: ${telemetry.windSpeed} km/h`);
      console.log(`   Speed: ${telemetry.speed} km/h | Battery: ${telemetry.battery}% | Alt: ${telemetry.altitude} m\n`);
    }
  );

  req.on('error', err => {
    console.error(`Connection error to ${RENDER_BASE_URL}: ${err.message}`);
  });

  req.write(payloadString);
  req.end();
}

console.log(`Starting telemetry broadcast to: ${RENDER_BASE_URL}${ENDPOINT_PATH}`);
sendMockData();
setInterval(sendMockData, 2500); 