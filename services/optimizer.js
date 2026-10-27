'use strict';
// Port of SolarCarAI_v2/ai_optimizer.py decision rules. Prototype heuristics,
// not a trained model. Missing inputs remain null rather than becoming zero.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = value => Math.round(value * 10) / 10;
function speedTarget(t) {
  let speed = 90;
  speed += t.irradiance >= 900 ? 8 : t.irradiance >= 700 ? 4 : t.irradiance < 400 ? -8 : 0;
  speed += t.battery < 25 ? -20 : t.battery < 45 ? -10 : t.battery >= 80 && t.irradiance >= 800 ? 3 : 0;
  speed -= t.wind >= 35 ? 15 : t.wind >= 25 ? 8 : 0;
  speed -= t.rain >= 2 ? 20 : t.rain > 0 ? 10 : 0;
  speed -= t.temperature >= 45 ? 10 : t.temperature >= 38 ? 5 : 0;
  return clamp(speed, 45, 110);
}
function batteryMode(battery, solar) {
  if (battery <= 20) return 'Critical Conservation';
  if (battery <= 40) return 'Energy Saving';
  if (solar >= 850 && battery >= 70) return 'Performance';
  return solar >= 600 ? 'Optimal' : 'Eco';
}
function efficiencyScore(t, target) {
  let score = 100;
  score += t.irradiance < 300 ? -25 : t.irradiance < 600 ? -12 : t.irradiance >= 900 ? 3 : 0;
  score -= t.battery < 20 ? 25 : t.battery < 40 ? 15 : t.battery < 60 ? 5 : 0;
  score -= t.temperature > 45 ? 15 : t.temperature > 38 ? 7 : 0;
  score -= t.humidity > 85 ? 6 : 0;
  score -= t.wind > 35 ? 15 : t.wind > 25 ? 8 : 0;
  score -= t.rain > 2 ? 18 : t.rain > 0 ? 8 : 0;
  const difference = Math.abs(t.speed - target);
  score -= difference > 25 ? 12 : difference > 15 ? 7 : difference > 7 ? 3 : 0;
  return clamp(score, 0, 100);
}
function energyStatus(solar, battery) {
  if (battery < 20) return 'LOW RESERVE';
  if (solar >= 900) return 'HIGH SOLAR INPUT';
  if (solar >= 600) return 'STABLE ENERGY';
  return solar >= 300 ? 'MODERATE ENERGY' : 'LOW SOLAR INPUT';
}
function recommendation(t, target) {
  if (t.rain >= 2) return ['Reduce Speed', 'Rainfall triggers the prototype conservation rule.'];
  if (t.wind >= 35) return ['Reduce Speed', 'High measured wind triggers the prototype wind rule.'];
  if (t.battery <= 20) return ['Conserve Energy', 'Measured battery level is low.'];
  if (target - t.speed >= 5) return ['Increase Speed', 'The prototype target is above the measured vehicle speed.'];
  if (target - t.speed <= -5) return ['Reduce Speed', 'The prototype target is below the measured vehicle speed.'];
  return ['Maintain Speed', 'Measured vehicle speed is close to the prototype target.'];
}
// Consecutive valid observations only; browser refreshes never add samples.
function forecast(history, field, multiplier, min, max, tolerance) {
  const samples = [];
  for (const packet of history.slice(-12).reverse()) {
    const value = packet.values[field];
    if (value === null || value === undefined) break;
    samples.unshift({ value: value * multiplier, time: packet.observedAt });
  }
  if (samples.length < 3 || samples.at(-1).time - samples[0].time < 20000) {
    return { value: null, trend: 'Collecting samples', samples: samples.length };
  }
  const first = samples[0], last = samples.at(-1);
  const rate = (last.value - first.value) / ((last.time - first.time) / 60000);
  return { value: round(clamp(last.value + rate * 5, min, max)),
    trend: rate > tolerance ? 'Increasing' : rate < -tolerance ? 'Decreasing' : 'Stable', samples: samples.length };
}
function optimize(snapshot) {
  const w = snapshot.weather?.values || {}, v = snapshot.vehicleFresh ? snapshot.vehicle.values : {};
  const t = {
    temperature: w.temperature_c ?? null, humidity: w.humidity_pct ?? null,
    wind: w.wind_speed_ms == null ? null : w.wind_speed_ms * 3.6,
    irradiance: w.irradiance_wm2 ?? null, rain: w.rainfall_mmh ?? null,
    battery: v.battery_pct ?? null, speed: v.speed_kmh ?? null,
  };
  const missing = Object.entries(t).filter(([, value]) => value === null).map(([key]) => key);
  const result = {
    method: 'SolarCarAI v2 rules + five-minute linear trends',
    status: snapshot.state === 'live' ? (missing.length ? 'partial' : 'ready') : snapshot.state,
    missing, inputCoverage: Math.round((7 - missing.length) / 7 * 100),
    recommendedSpeed: null, batteryMode: null, efficiencyScore: null, energyStatus: null,
    performance: null,
    recommendation: 'Waiting for sensor data', reason: 'Start the weather station and connect its data feed.',
    observations: [], forecasts: {}, horizonMinutes: 5,
  };
  if (snapshot.state !== 'live') {
    if (snapshot.state === 'stale') {
      result.recommendation = 'Sensor data is stale';
      result.reason = 'Analysis is paused until a fresh measurement arrives. Last values remain visible.';
    }
    return result;
  }
  result.observations.push(t.temperature === null ? 'Temperature unavailable.' :
    t.temperature >= 38 ? 'Elevated measured air temperature.' : 'Air temperature is below the original 38 °C heat-rule threshold.');
  result.observations.push(t.wind === null ? 'Wind reading unavailable.' :
    t.wind >= 35 ? 'High measured wind; direction is not measured.' : `Measured wind is ${round(t.wind)} km/h; direction is not measured.`);
  if (t.humidity !== null && t.humidity > 85) result.observations.push('High measured humidity; this does not establish rainfall.');
  const specs = [['temperature', 'temperature_c', 1, -80, 85, 0.1], ['wind', 'wind_speed_ms', 3.6, 0, 360, 0.1], ['irradiance', 'irradiance_wm2', 1, 0, 2000, 1]];
  for (const [name, ...args] of specs) result.forecasts[name] = forecast(snapshot.history, ...args);
  const efficiencyHistory = snapshot.history.map(packet => {
    const h = packet.values, car = packet.vehicleValues || {};
    const inputs = { temperature:h.temperature_c, humidity:h.humidity_pct,
      wind:h.wind_speed_ms == null ? null : h.wind_speed_ms*3.6,
      irradiance:h.irradiance_wm2, rain:h.rainfall_mmh, speed:car.speed_kmh, battery:car.battery_pct };
    const complete = Object.values(inputs).every(value => value != null);
    const score = complete ? efficiencyScore(inputs, speedTarget(inputs)) : null;
    return { observedAt:packet.observedAt, values:{ efficiency:score } };
  });
  result.forecasts.efficiency = forecast(efficiencyHistory, 'efficiency', 1, 0, 100, 0.15);
  if (missing.length) result.forecasts.efficiency = { value:null, trend:'Missing current inputs', samples:0 };
  if (result.forecasts.efficiency.value !== null && t.rain > 0) result.forecasts.efficiency.value = Math.max(0,result.forecasts.efficiency.value-2);
  if (t.battery !== null && t.irradiance !== null) {
    result.batteryMode = batteryMode(t.battery, t.irradiance); result.energyStatus = energyStatus(t.irradiance, t.battery);
  }
  if ([t.irradiance, t.temperature, t.wind, t.rain, t.battery].every(value => value !== null)) result.recommendedSpeed = speedTarget(t);
  if (!missing.length) {
    result.efficiencyScore = efficiencyScore(t, result.recommendedSpeed);
    [result.recommendation, result.reason] = recommendation(t, result.recommendedSpeed);
    const future = result.forecasts;
    if ([future.irradiance.value, future.wind.value, future.efficiency.value].every(value => value !== null)) {
      result.performance = t.battery < 20 ? 'Energy reserve at risk' : t.rain >= 2 ? 'Reduced performance expected' :
        future.wind.value >= 35 ? 'Efficiency may decrease' :
        future.irradiance.value >= 900 && future.efficiency.value >= 80 ? 'Excellent performance expected' :
        future.irradiance.value >= 650 && future.efficiency.value >= 70 ? 'Stable performance expected' :
        future.irradiance.value < 350 ? 'Lower solar input expected' : 'Normal performance expected';
    }
  } else {
    result.recommendation = 'Weather analysis active';
    result.reason = 'Full vehicle optimisation is waiting for the missing measured inputs listed below.';
  }
  return result;
}
module.exports = { optimize, speedTarget, batteryMode, efficiencyScore, energyStatus, forecast };
