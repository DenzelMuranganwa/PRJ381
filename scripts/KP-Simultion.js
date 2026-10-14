
const https = require('node:https');


const RENDER_BASE_URL = 'https://prj381-1-yv13.onrender.com';


const SENSOR_TOKEN = process.env.SENSOR_API_TOKEN || 'iwos-secret-token-2026';


const highResKemptonTrack = [
  // --- LEG 1: Pretoria Urban Basin (0.0 km -> 4.8 km) ---
  { step: 1, lat: -25.74790, lng: 28.22930, speed: 0, irr: 820, temp: 24.1, windKmh: 10, soc: 98.0, stop: false, road: "Pretoria Departure Paddock", dist: 0.0, baseAlt: 1360, humidityBase: 52 },
  { step: 2, lat: -25.75380, lng: 28.22250, speed: 35, irr: 835, temp: 24.3, windKmh: 11, soc: 97.6, stop: false, road: "Nelson Mandela Dr (M3)", dist: 1.2, baseAlt: 1365, humidityBase: 50 },
  { step: 3, lat: -25.76120, lng: 28.21740, speed: 48, irr: 840, temp: 24.4, windKmh: 12, soc: 97.1, stop: false, road: "Nelson Mandela Dr South", dist: 2.5, baseAlt: 1375, humidityBase: 49 },
  { step: 4, lat: -25.76850, lng: 28.21390, speed: 25, irr: 850, temp: 24.6, windKmh: 12, soc: 96.8, stop: false, road: "Fountains Circle Approach", dist: 3.8, baseAlt: 1385, humidityBase: 48 },
  { step: 5, lat: -25.77240, lng: 28.21180, speed: 0, irr: 875, temp: 24.8, windKmh: 11, soc: 97.0, stop: true, stopName: "STOP 1: Fountains Valley Solar Inspection (10m pause)", road: "Fountains Valley Paddock", dist: 4.8, baseAlt: 1390, humidityBase: 51 },

  // --- LEG 2: M18 Ridge Pass to R21 Highway (4.8 km -> 15.6 km) ---
  { step: 6, lat: -25.77950, lng: 28.21620, speed: 45, irr: 880, temp: 25.0, windKmh: 13, soc: 96.6, stop: false, road: "Christina de Wit Ave (M18)", dist: 6.2, baseAlt: 1410, humidityBase: 47 },
  { step: 7, lat: -25.78680, lng: 28.22550, speed: 62, irr: 890, temp: 25.1, windKmh: 14, soc: 96.1, stop: false, road: "Eeufees Road Junction", dist: 8.1, baseAlt: 1435, humidityBase: 46 },
  { step: 8, lat: -25.79420, lng: 28.23680, speed: 74, irr: 900, temp: 25.2, windKmh: 15, soc: 95.5, stop: false, road: "R21 Highway On-Ramp", dist: 10.0, baseAlt: 1460, humidityBase: 45 },
  { step: 9, lat: -25.80510, lng: 28.24350, speed: 85, irr: 915, temp: 25.4, windKmh: 16, soc: 94.8, stop: false, road: "R21 Southbound (Waterkloof Ridge)", dist: 12.3, baseAlt: 1485, humidityBase: 44 },
  { step: 10, lat: -25.81750, lng: 28.24820, speed: 88, irr: 920, temp: 25.6, windKmh: 16, soc: 94.1, stop: false, road: "R21 Southbound (Monument Park)", dist: 13.9, baseAlt: 1510, humidityBase: 43 },
  { step: 11, lat: -25.83240, lng: 28.24980, speed: 90, irr: 930, temp: 25.7, windKmh: 17, soc: 93.4, stop: false, road: "R21 Southbound", dist: 15.1, baseAlt: 1530, humidityBase: 42 },
  { step: 12, lat: -25.84850, lng: 28.24870, speed: 88, irr: 935, temp: 25.8, windKmh: 17, soc: 92.7, stop: false, road: "R21 South (Flying Saucer Interchange)", dist: 15.8, baseAlt: 1545, humidityBase: 42 },
  { step: 13, lat: -25.85950, lng: 28.24710, speed: 50, irr: 940, temp: 25.9, windKmh: 15, soc: 92.3, stop: false, road: "Route 21 Corporate Park Exit", dist: 16.2, baseAlt: 1555, humidityBase: 41 },
  { step: 14, lat: -25.86520, lng: 28.24490, speed: 0, irr: 960, temp: 26.1, windKmh: 13, soc: 92.8, stop: true, stopName: "STOP 2: Irene Mid-Route Thermal Check (15m pause)", road: "Route 21 Rest Oasis", dist: 16.5, baseAlt: 1560, humidityBase: 42 },

  // --- LEG 3: Open Country Highveld Highway (16.2 km -> 36.8 km) ---
  { step: 15, lat: -25.87250, lng: 28.24620, speed: 65, irr: 955, temp: 26.2, windKmh: 16, soc: 92.4, stop: false, road: "R21 Re-entry Slipway", dist: 17.5, baseAlt: 1570, humidityBase: 41 },
  { step: 16, lat: -25.88900, lng: 28.24700, speed: 90, irr: 950, temp: 26.3, windKmh: 17, soc: 91.7, stop: false, road: "R21 South (Open Fields)", dist: 20.0, baseAlt: 1585, humidityBase: 40 },
  { step: 17, lat: -25.90800, lng: 28.24760, speed: 92, irr: 945, temp: 26.4, windKmh: 18, soc: 90.9, stop: false, road: "R21 South (Centurion East Border)", dist: 22.8, baseAlt: 1595, humidityBase: 39 },
  { step: 18, lat: -25.92550, lng: 28.24810, speed: 92, irr: 940, temp: 26.5, windKmh: 18, soc: 90.1, stop: false, road: "Approaching Olifantsfontein", dist: 25.6, baseAlt: 1605, humidityBase: 39 },
  { step: 19, lat: -25.94120, lng: 28.24850, speed: 86, irr: 935, temp: 26.5, windKmh: 17, soc: 89.4, stop: false, road: "Olifantsfontein (R562) Interchange", dist: 28.1, baseAlt: 1615, humidityBase: 40 },
  { step: 20, lat: -25.95800, lng: 28.24920, speed: 90, irr: 930, temp: 26.6, windKmh: 17, soc: 88.6, stop: false, road: "R21 South (Clayville West)", dist: 30.5, baseAlt: 1625, humidityBase: 40 },
  { step: 21, lat: -25.97500, lng: 28.25010, speed: 88, irr: 925, temp: 26.7, windKmh: 16, soc: 87.9, stop: false, road: "R21 Southbound", dist: 32.4, baseAlt: 1630, humidityBase: 41 },
  { step: 22, lat: -25.99200, lng: 28.25100, speed: 88, irr: 920, temp: 26.8, windKmh: 16, soc: 87.2, stop: false, road: "Tembisa North Perimeter", dist: 34.2, baseAlt: 1635, humidityBase: 41 },
  { step: 23, lat: -26.01100, lng: 28.25220, speed: 86, irr: 910, temp: 26.8, windKmh: 15, soc: 86.4, stop: false, road: "Tembisa East Bypass", dist: 35.8, baseAlt: 1640, humidityBase: 42 },
  { step: 24, lat: -26.02800, lng: 28.25330, speed: 85, irr: 900, temp: 26.9, windKmh: 15, soc: 85.7, stop: false, road: "R21 Southbound", dist: 37.0, baseAlt: 1645, humidityBase: 42 },
  { step: 25, lat: -26.04400, lng: 28.25430, speed: 82, irr: 890, temp: 27.0, windKmh: 14, soc: 85.0, stop: false, road: "R25 Bapsfontein Off-ramp Junction", dist: 38.8, baseAlt: 1650, humidityBase: 43 },

  // --- LEG 4: Pomona Logistics Belt (36.8 km -> 46.5 km) ---
  { step: 26, lat: -26.05900, lng: 28.25520, speed: 78, irr: 885, temp: 27.0, windKmh: 14, soc: 84.4, stop: false, road: "Bredell / R21 South", dist: 40.5, baseAlt: 1655, humidityBase: 42 },
  { step: 27, lat: -26.06850, lng: 28.25580, speed: 45, irr: 875, temp: 27.1, windKmh: 13, soc: 84.0, stop: false, road: "Pomona Logistics Off-ramp", dist: 42.1, baseAlt: 1660, humidityBase: 43 },
  { step: 28, lat: -26.07410, lng: 28.25200, speed: 0, irr: 880, temp: 27.1, windKmh: 12, soc: 84.3, stop: true, stopName: "STOP 3: Pomona Logistics Staging Area (5m pause)", road: "Pomona Depot", dist: 43.0, baseAlt: 1662, humidityBase: 44 },

  // --- LEG 5: Kempton Park Urban Ingress to 45A Long St (46.5 km -> 52.1 km) ---
  { step: 29, lat: -26.08200, lng: 28.25100, speed: 55, irr: 865, temp: 27.2, windKmh: 12, soc: 83.9, stop: false, road: "Atlas Road (M43) Connector", dist: 44.7, baseAlt: 1665, humidityBase: 44 },
  { step: 30, lat: -26.09150, lng: 28.24750, speed: 48, irr: 855, temp: 27.2, windKmh: 11, soc: 83.5, stop: false, road: "Voortrekker Rd Entry (M96)", dist: 46.2, baseAlt: 1670, humidityBase: 45 },
  { step: 31, lat: -26.09680, lng: 28.24320, speed: 42, irr: 845, temp: 27.3, windKmh: 10, soc: 83.2, stop: false, road: "Voortrekker Rd (Kempton West)", dist: 48.0, baseAlt: 1675, humidityBase: 45 },
  { step: 32, lat: -26.09980, lng: 28.24110, speed: 35, irr: 835, temp: 27.3, windKmh: 9, soc: 82.9, stop: false, road: "Pretoria Road Intersection", dist: 49.3, baseAlt: 1678, humidityBase: 45 },
  { step: 33, lat: -26.10250, lng: 28.23920, speed: 30, irr: 825, temp: 27.4, windKmh: 8, soc: 82.6, stop: false, road: "Pretoria Road South", dist: 50.4, baseAlt: 1682, humidityBase: 46 },
  { step: 34, lat: -26.10420, lng: 28.23860, speed: 25, irr: 820, temp: 27.4, windKmh: 8, soc: 82.4, stop: false, road: "Turning onto Long Street", dist: 51.2, baseAlt: 1684, humidityBase: 46 },
  { step: 35, lat: -26.10550, lng: 28.23825, speed: 15, irr: 815, temp: 27.4, windKmh: 7, soc: 82.2, stop: false, road: "Long Street Approaching 45A", dist: 51.8, baseAlt: 1685, humidityBase: 46 },
  { step: 36, lat: -26.10605, lng: 28.23812, speed: 0, irr: 810, temp: 27.5, windKmh: 7, soc: 82.1, stop: true, stopName: "🏁 FINAL DESTINATION: 45A Long Street, Kempton Park", road: "45A Long Street", dist: 52.1, baseAlt: 1686, humidityBase: 46 }
];

let currentIndex = 0;
let previousReadings = null;

function computeBarometricPressure(altMeters) {
  
  return parseFloat((1013.25 * Math.pow(1 - (0.0065 * altMeters) / 288.15, 5.255)).toFixed(1));
}

function sendPost(path, data) {
  const payload = JSON.stringify(data);
  const target = new URL(RENDER_BASE_URL + path);

  const req = https.request(
    {
      hostname: target.hostname,
      port: 443,
      path: target.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${SENSOR_TOKEN}`
      }
    },
    res => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[HTTP ${res.statusCode}] Success -> ${path}`);
        } else {
          console.error(`[HTTP ${res.statusCode}] Failed -> ${path}: ${raw}`);
        }
      });
    }
  );

  req.on('error', err => console.error(`Network error: ${err.message}`));
  req.write(payload);
  req.end();
}

function sendTelemetryTick() {
  const p = highResKemptonTrack[currentIndex];


  const altJitter = Math.round((Math.random() - 0.5) * 4);
  const currentAltitude = p.baseAlt + altJitter;
  const currentPressure = computeBarometricPressure(currentAltitude);

  const tempJitter = parseFloat(((Math.random() - 0.5) * 0.3).toFixed(1));
  const currentTemp = parseFloat((p.temp + tempJitter).toFixed(1));

  const irrJitter = Math.round((Math.random() - 0.5) * 15);
  const currentIrr = p.irr + irrJitter;

  const currentHumidity = Math.min(100, Math.max(0, Math.round(p.humidityBase + (Math.random() - 0.5) * 3)));

  
  const currentWindKmh = parseFloat((p.windKmh + (Math.random() - 0.5) * 2).toFixed(1));
  const currentWindMs = parseFloat((currentWindKmh / 3.6).toFixed(1));

  
  const currentSpeed = p.speed === 0 ? 0 : Math.max(5, parseFloat((p.speed + (Math.random() - 0.5) * 3).toFixed(1)));

  
  const weatherPayload = {
    timestamp: new Date().toISOString(),
    temperature_c: currentTemp,
    humidity_pct: currentHumidity,
    pressure_hpa: currentPressure,
    altitude_m: currentAltitude,
    wind_speed_ms: currentWindMs,
    latitude: p.lat,
    longitude: p.lng,
    irradiance_wm2: currentIrr,
    rainfall_mmh: 0.0
  };

  
  const vehiclePayload = {
    timestamp: new Date().toISOString(),
    speed_kmh: currentSpeed,
    battery_pct: p.soc,
    distance_today_km: p.dist
  };

  
  const deltas = previousReadings ? {
    speed: (currentSpeed - previousReadings.speed).toFixed(1),
    temp: (currentTemp - previousReadings.temp).toFixed(1),
    irr: (currentIrr - previousReadings.irr),
    alt: (currentAltitude - previousReadings.alt),
    pres: (currentPressure - previousReadings.pres).toFixed(1)
  } : { speed: 0, temp: 0, irr: 0, alt: 0, pres: 0 };

  console.log(`\n========================================================`);
  console.log(`[Step ${p.step}/36]  ${p.road}`);
  if (p.stop) console.log(` ${p.stopName}`);
  console.log(` Speed: ${currentSpeed} km/h (Δ ${deltas.speed > 0 ? '+' : ''}${deltas.speed}) | SoC: ${p.soc}% | Dist: ${p.dist} km`);
  console.log(` Sun:   ${currentIrr} W/m² (Δ ${deltas.irr > 0 ? '+' : ''}${deltas.irr}) | Temp: ${currentTemp} °C (Δ ${deltas.temp > 0 ? '+' : ''}${deltas.temp})`);
  console.log(` Alt:   ${currentAltitude} m (Δ ${deltas.alt > 0 ? '+' : ''}${deltas.alt}) |  Baro: ${currentPressure} hPa (Δ ${deltas.pres > 0 ? '+' : ''}${deltas.pres}) | 💨 Wind: ${currentWindMs} m/s`);

  previousReadings = {
    speed: currentSpeed,
    temp: currentTemp,
    irr: currentIrr,
    alt: currentAltitude,
    pres: currentPressure
  };

  sendPost('/api/telemetry/weather', weatherPayload);
  sendPost('/api/telemetry/vehicle', vehiclePayload);

  currentIndex = (currentIndex + 1) % highResKemptonTrack.length;
}

console.log(`📡 Connecting to: ${RENDER_BASE_URL}`);
console.log(`🏁 Starting dynamic area-based telemetry simulation to 45A Long St.`);

sendTelemetryTick();
setInterval(sendTelemetryTick, 2500); 