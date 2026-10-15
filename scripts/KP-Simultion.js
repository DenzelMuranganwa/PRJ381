'use strict';

const { runSimulator, sendTelemetry } = require('./telemetry-client');


const highResKemptonTrack = [
  { step: 1, lat: -25.6818343, lng: 28.1301449, speed: 0, temp: 24.1, windKmh: 10, soc: 98.0, stop: false, road: "Departure Point (Pretoria North)", dist: 0.0, baseAlt: 1320, humidityBase: 52 },
  { step: 2, lat: -25.71420, lng: 28.17850, speed: 50, temp: 24.2, windKmh: 11, soc: 97.8, stop: false, road: "Paul Kruger St Southbound", dist: 4.8, baseAlt: 1335, humidityBase: 51 },
  { step: 3, lat: -25.74790, lng: 28.22930, speed: 45, temp: 24.3, windKmh: 11, soc: 97.4, stop: false, road: "Nelson Mandela Dr (M3)", dist: 9.6, baseAlt: 1360, humidityBase: 50 },
  { step: 4, lat: -25.76850, lng: 28.21390, speed: 30, temp: 24.6, windKmh: 12, soc: 97.0, stop: false, road: "Fountains Circle Approach", dist: 13.4, baseAlt: 1385, humidityBase: 48 },
  { step: 5, lat: -25.77240, lng: 28.21180, speed: 0, temp: 24.8, windKmh: 11, soc: 97.2, stop: true, stopName: "STOP 1: Fountains Valley Solar Inspection (10m pause)", road: "Fountains Valley Paddock", dist: 14.4, baseAlt: 1390, humidityBase: 51 },
  { step: 6, lat: -25.77950, lng: 28.21620, speed: 45, temp: 25.0, windKmh: 13, soc: 96.8, stop: false, road: "Christina de Wit Ave (M18)", dist: 15.8, baseAlt: 1410, humidityBase: 47 },
  { step: 7, lat: -25.78680, lng: 28.22550, speed: 62, temp: 25.1, windKmh: 14, soc: 96.3, stop: false, road: "Eeufees Road Junction", dist: 17.7, baseAlt: 1435, humidityBase: 46 },
  { step: 8, lat: -25.79420, lng: 28.23680, speed: 74, temp: 25.2, windKmh: 15, soc: 95.7, stop: false, road: "R21 Highway On-Ramp", dist: 19.6, baseAlt: 1460, humidityBase: 45 },
  { step: 9, lat: -25.80510, lng: 28.24350, speed: 85, temp: 25.4, windKmh: 16, soc: 95.0, stop: false, road: "R21 Southbound (Waterkloof Ridge)", dist: 21.9, baseAlt: 1485, humidityBase: 44 },
  { step: 10, lat: -25.81750, lng: 28.24820, speed: 88, temp: 25.6, windKmh: 16, soc: 94.3, stop: false, road: "R21 Southbound (Monument Park)", dist: 23.5, baseAlt: 1510, humidityBase: 43 },
  { step: 11, lat: -25.83240, lng: 28.24980, speed: 90, temp: 25.7, windKmh: 17, soc: 93.6, stop: false, road: "R21 Southbound", dist: 24.7, baseAlt: 1530, humidityBase: 42 },
  { step: 12, lat: -25.84850, lng: 28.24870, speed: 88, temp: 25.8, windKmh: 17, soc: 92.9, stop: false, road: "R21 South (Flying Saucer Interchange)", dist: 25.4, baseAlt: 1545, humidityBase: 42 },
  { step: 13, lat: -25.85950, lng: 28.24710, speed: 50, temp: 25.9, windKmh: 15, soc: 92.5, stop: false, road: "Route 21 Corporate Park Exit", dist: 25.8, baseAlt: 1555, humidityBase: 41 },
  { step: 14, lat: -25.86520, lng: 28.24490, speed: 0, temp: 26.1, windKmh: 13, soc: 93.0, stop: true, stopName: "STOP 2: Irene Mid-Route Thermal Check (15m pause)", road: "Route 21 Rest Oasis", dist: 26.1, baseAlt: 1560, humidityBase: 42 },
  { step: 15, lat: -25.87250, lng: 28.24620, speed: 65, temp: 26.2, windKmh: 16, soc: 92.6, stop: false, road: "R21 Re-entry Slipway", dist: 27.1, baseAlt: 1570, humidityBase: 41 },
  { step: 16, lat: -25.88900, lng: 28.24700, speed: 90, temp: 26.3, windKmh: 17, soc: 91.9, stop: false, road: "R21 South (Open Fields)", dist: 29.6, baseAlt: 1585, humidityBase: 40 },
  { step: 17, lat: -25.90800, lng: 28.24760, speed: 92, temp: 26.4, windKmh: 18, soc: 91.1, stop: false, road: "R21 South (Centurion East Border)", dist: 32.4, baseAlt: 1595, humidityBase: 39 },
  { step: 18, lat: -25.92550, lng: 28.24810, speed: 92, temp: 26.5, windKmh: 18, soc: 90.3, stop: false, road: "Approaching Olifantsfontein", dist: 35.2, baseAlt: 1605, humidityBase: 39 },
  { step: 19, lat: -25.94120, lng: 28.24850, speed: 86, temp: 26.5, windKmh: 17, soc: 89.6, stop: false, road: "Olifantsfontein (R562) Interchange", dist: 37.7, baseAlt: 1615, humidityBase: 40 },
  { step: 20, lat: -25.95800, lng: 28.24920, speed: 90, temp: 26.6, windKmh: 17, soc: 88.8, stop: false, road: "R21 South (Clayville West)", dist: 40.1, baseAlt: 1625, humidityBase: 40 },
  { step: 21, lat: -25.97500, lng: 28.25010, speed: 88, temp: 26.7, windKmh: 16, soc: 88.1, stop: false, road: "R21 Southbound", dist: 42.0, baseAlt: 1630, humidityBase: 41 },
  { step: 22, lat: -25.99200, lng: 28.25100, speed: 88, temp: 26.8, windKmh: 16, soc: 87.4, stop: false, road: "Tembisa North Perimeter", dist: 43.8, baseAlt: 1635, humidityBase: 41 },
  { step: 23, lat: -26.01100, lng: 28.25220, speed: 86, temp: 26.8, windKmh: 15, soc: 86.6, stop: false, road: "Tembisa East Bypass", dist: 45.4, baseAlt: 1640, humidityBase: 42 },
  { step: 24, lat: -26.02800, lng: 28.25330, speed: 85, temp: 26.9, windKmh: 15, soc: 85.9, stop: false, road: "R21 Southbound", dist: 46.6, baseAlt: 1645, humidityBase: 42 },
  { step: 25, lat: -26.04400, lng: 28.25430, speed: 82, temp: 27.0, windKmh: 14, soc: 85.2, stop: false, road: "R25 Bapsfontein Off-ramp Junction", dist: 48.4, baseAlt: 1650, humidityBase: 43 },
  { step: 26, lat: -26.05900, lng: 28.25520, speed: 78, temp: 27.0, windKmh: 14, soc: 84.6, stop: false, road: "Bredell / R21 South", dist: 50.1, baseAlt: 1655, humidityBase: 42 },
  { step: 27, lat: -26.06850, lng: 28.25580, speed: 45, temp: 27.1, windKmh: 13, soc: 84.2, stop: false, road: "Pomona Logistics Off-ramp", dist: 51.7, baseAlt: 1660, humidityBase: 43 },
  { step: 28, lat: -26.07410, lng: 28.25200, speed: 0, temp: 27.1, windKmh: 12, soc: 84.5, stop: true, stopName: "STOP 3: Pomona Logistics Staging Area (5m pause)", road: "Pomona Depot", dist: 52.6, baseAlt: 1662, humidityBase: 44 },
  { step: 29, lat: -26.08200, lng: 28.25100, speed: 55, temp: 27.2, windKmh: 12, soc: 84.1, stop: false, road: "Atlas Road (M43) Connector", dist: 54.3, baseAlt: 1665, humidityBase: 44 },
  { step: 30, lat: -26.09150, lng: 28.24750, speed: 48, temp: 27.2, windKmh: 11, soc: 83.7, stop: false, road: "Voortrekker Rd Entry (M96)", dist: 55.8, baseAlt: 1670, humidityBase: 45 },
  { step: 31, lat: -26.09680, lng: 28.24320, speed: 42, temp: 27.3, windKmh: 10, soc: 83.4, stop: false, road: "Voortrekker Rd (Kempton West)", dist: 57.6, baseAlt: 1675, humidityBase: 45 },
  { step: 32, lat: -26.09980, lng: 28.24110, speed: 35, temp: 27.3, windKmh: 9, soc: 83.1, stop: false, road: "Pretoria Road Intersection", dist: 58.9, baseAlt: 1678, humidityBase: 45 },
  { step: 33, lat: -26.10250, lng: 28.23920, speed: 30, temp: 27.4, windKmh: 8, soc: 82.8, stop: false, road: "Pretoria Road South", dist: 60.0, baseAlt: 1682, humidityBase: 46 },
  { step: 34, lat: -26.10420, lng: 28.23860, speed: 25, temp: 27.4, windKmh: 8, soc: 82.6, stop: false, road: "Turning onto Long Street", dist: 60.8, baseAlt: 1684, humidityBase: 46 },
  { step: 35, lat: -26.10550, lng: 28.23825, speed: 15, temp: 27.4, windKmh: 7, soc: 82.4, stop: false, road: "Long Street Approaching 45A", dist: 61.4, baseAlt: 1685, humidityBase: 46 },
  { step: 36, lat: -26.10605, lng: 28.23812, speed: 0, temp: 27.5, windKmh: 7, soc: 82.3, stop: true, stopName: "FINAL DESTINATION: 45A Long Street, Kempton Park", road: "45A Long Street", dist: 61.7, baseAlt: 1686, humidityBase: 46 }
];

let currentIndex = 0;

function computeBarometricPressure(altMeters) {
  return parseFloat((1013.25 * Math.pow(1 - (0.0065 * altMeters) / 288.15, 5.255)).toFixed(1));
}

async function sendTelemetryTick() {
  const p = highResKemptonTrack[currentIndex];
  const nowIso = new Date().toISOString();

  const currentAltitude = p.baseAlt + Math.round((Math.random() - 0.5) * 4);
  const currentPressure = computeBarometricPressure(currentAltitude);
  const currentTemp = parseFloat((p.temp + (Math.random() - 0.5) * 0.3).toFixed(1));
  const currentHumidity = Math.min(100, Math.max(0, Math.round(p.humidityBase + (Math.random() - 0.5) * 3)));
  
  const currentWindKmh = parseFloat((p.windKmh + (Math.random() - 0.5) * 2).toFixed(1));
  const currentWindMs = parseFloat((currentWindKmh / 3.6).toFixed(1));

  const currentSpeed = p.speed === 0 ? 0 : Math.max(5, parseFloat((p.speed + (Math.random() - 0.5) * 3).toFixed(1)));

  const weatherPayload = {
    timestamp: nowIso,
    temperature_c: currentTemp,
    humidity_pct: currentHumidity,
    pressure_hpa: currentPressure,
    altitude_m: currentAltitude,
    wind_speed_ms: currentWindMs,
    latitude: p.lat,
    longitude: p.lng,
    irradiance_wm2: 820,
    rainfall_mmh: 0
  };

  const vehiclePayload = {
    timestamp: nowIso,
    speed_kmh: currentSpeed,
    battery_pct: p.soc,
    distance_today_km: p.dist
  };

  console.log(`\n========================================================`);
  console.log(`[Step ${p.step}/36] Waypoint: ${p.road}`);
  if (p.stop) console.log(`Stop: ${p.stopName}`);
  console.log(`Time: ${nowIso}`);
  console.log(`Coordinates: [${p.lat}, ${p.lng}]`);
  console.log(`Speed: ${currentSpeed} km/h | SoC: ${p.soc}% | Distance: ${p.dist} km`);
  console.log(`Temp: ${currentTemp} C | Wind: ${currentWindMs} m/s | Pressure: ${currentPressure} hPa`);

  await sendTelemetry(weatherPayload, vehiclePayload);

  currentIndex = (currentIndex + 1) % highResKemptonTrack.length;
}

console.log('Sending simulated Kempton Park route data to the dashboard.');
console.log('Use --once to send one waypoint and exit.');
runSimulator(sendTelemetryTick, 2500);