'use strict';
(() => {
  const text = (selector, value) => document.querySelectorAll(selector).forEach(node => { node.textContent = value; });
  const format = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';
  const names = { temperature:'air temperature', humidity:'humidity', wind:'wind speed', irradiance:'irradiance', rain:'rainfall', battery:'battery level', speed:'vehicle speed' };

  function renderTrack(history) {
    const line = document.getElementById('gps-line');
    if (!line) return;
    // Break the trace on loss of GPS; never join positions across missing fixes.
    const fixes = [];
    for (const packet of [...history].reverse()) {
      const w = packet.values;
      if (w.latitude == null || w.longitude == null) break;
      fixes.unshift(w);
    }
    const point = document.getElementById('gps-point');
    text('#gps-empty', fixes.length ? '' : 'Waiting for GPS positions');
    point.setAttribute('visibility', fixes.length ? 'visible' : 'hidden');
    if (!fixes.length) { line.setAttribute('points', ''); return; }
    const origin = fixes[0], cos = Math.cos(origin.latitude * Math.PI / 180);
    const xs = fixes.map(p => (p.longitude - origin.longitude) * cos), ys = fixes.map(p => p.latitude - origin.latitude);
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    const scale = Math.min(620 / Math.max(xmax - xmin, 0.00001), 160 / Math.max(ymax - ymin, 0.00001));
    const coords = xs.map((x, i) => [350 + (x - (xmin+xmax)/2)*scale, 120 - (ys[i] - (ymin+ymax)/2)*scale]);
    line.setAttribute('points', coords.map(p => p.join(',')).join(' '));
    point.setAttribute('cx', coords.at(-1)[0]); point.setAttribute('cy', coords.at(-1)[1]);
  }
  function renderLogs(data) {
    text('[data-count="accepted"]', data.stats.accepted);
    text('[data-count="rejected"]', data.stats.rejected);
    text('[data-count="duplicates"]', data.stats.duplicates);
    text('[data-count="buffer"]', `${data.history.length} / 120`);
    const tbody = document.getElementById('sensor-log-body');
    if (!tbody) return;
    tbody.replaceChildren();
    for (const packet of [...data.history].reverse().slice(0, 20)) {
      const row = document.createElement('tr'), w = packet.values;
      for (const value of [new Date(packet.timestamp).toLocaleTimeString(),format(w.temperature_c),format(w.humidity_pct),format(w.pressure_hpa),format(w.wind_speed_ms == null ? null : w.wind_speed_ms*3.6),packet.source]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      tbody.append(row);
    }
    if (!data.history.length) {
      const row = tbody.insertRow(), cell = row.insertCell(); cell.colSpan=6; cell.textContent='No sensor readings received in this server session.';
    }
  }
  function render(data) {
    const w = data.weather?.values || {}, v = data.vehicleFresh ? data.vehicle.values : {}, ai = data.analysis;
    document.body.dataset.feed = data.state;
    text('[data-feed-state]', {waiting:'Waiting for sensor',live:'Live sensor data',stale:'Stale sensor data'}[data.state]);
    text('[data-feed-detail]', data.transport.message || `${data.weather?.source?.toUpperCase() || 'Sensor'} · ${data.transport.state}${data.weather?.timezoneAssumed ? ' · sensor timezone from configuration' : ''}`);
    text('[data-transport]', `Feed: ${data.transport.state}`);
    text('[data-age]', data.weatherAgeMs == null ? 'No reading yet' : `Measured ${Math.floor(data.weatherAgeMs/1000)}s ago`);
    text('[data-battery]', v.battery_pct == null ? '—' : `${format(v.battery_pct,0)}%`);
    const values = {
      temperature:w.temperature_c, irradiance:w.irradiance_wm2, rainfall:w.rainfall_mmh,
      wind:w.wind_speed_ms == null ? null : w.wind_speed_ms*3.6, humidity:w.humidity_pct,
      pressure:w.pressure_hpa, altitude:w.altitude_m, speed:v.speed_kmh, distance:v.distance_today_km,
    };
    for (const [key,value] of Object.entries(values)) text(`[data-value="${key}"]`,format(value));
    for (const key of ['temperature','irradiance','wind','rainfall']) text(`[data-note="${key}"]`, values[key] == null ? 'No sensor measurement' : data.state === 'live' ? 'Measured by sensor' : 'Last reading · stale');
    text('[data-value="timestamp"]',data.weather ? new Date(data.weather.timestamp).toLocaleString() : '—');
    text('[data-value="gps"]',w.latitude == null || w.longitude == null ? 'No GPS fix available' : `${Math.abs(w.latitude).toFixed(5)}° ${w.latitude<0?'S':'N'}, ${Math.abs(w.longitude).toFixed(5)}° ${w.longitude<0?'W':'E'}`);
    for (const key of ['recommendation','reason','batteryMode','energyStatus']) text(`[data-ai="${key}"]`, ai[key] ?? 'Unavailable');
    text('[data-ai="performance"]',ai.performance ?? 'Waiting for complete measured inputs and history');
    text('[data-ai="status"]',{waiting:'Waiting',partial:'Partial inputs',ready:'All inputs available',stale:'Paused · stale'}[ai.status]);
    text('[data-ai="recommendedSpeed"]',ai.recommendedSpeed == null ? 'Unavailable' : `${ai.recommendedSpeed} km/h`);
    text('[data-ai="efficiencyScore"]',ai.efficiencyScore == null ? 'Unavailable' : `${ai.efficiencyScore} / 100`);
    text('[data-ai="inputCoverage"]', `${ai.inputCoverage}%`);
    text('#missing-inputs',ai.missing.length ? `Missing measured inputs: ${ai.missing.map(key=>names[key]).join(', ')}. These are never filled with assumed values.` : 'All required inputs are present. Results remain prototype estimates.');
    const observations=document.getElementById('weather-observations');
    if (observations) { observations.replaceChildren(); ai.observations.forEach(value=>{const li=document.createElement('li');li.textContent=value;observations.append(li);}); }
    for (const key of ['temperature','wind','irradiance','efficiency']) {
      const f=ai.forecasts[key]; text(`[data-forecast="${key}"]`,format(f?.value));
      text(`[data-trend="${key}"]`,data.state!=='live' ? 'Waiting for fresh readings' : f?.value==null ? `Waiting · ${f?.samples || 0} valid samples` : `${f.trend} · ${f.samples} samples`);
    }
    renderTrack(data.history); renderLogs(data);
  }
  async function poll() {
    try {
      const response=await fetch('/api/status',{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(!response.ok) throw new Error('Status unavailable');
      render(await response.json());
    } catch {
      document.body.dataset.feed='offline';
      text('[data-feed-state]','Dashboard offline'); text('[data-feed-detail]','Cannot reach the server. Reconnecting automatically…');
      text('[data-transport]','Server unreachable');text('[data-age]','Updates paused');
      text('[data-ai="recommendation"]','Analysis paused'); text('[data-ai="reason"]','Server connection lost. Last readings may be stale.');
      for(const key of ['recommendedSpeed','batteryMode','efficiencyScore','energyStatus','inputCoverage']) text(`[data-ai="${key}"]`,'Unavailable');
      text('[data-ai="status"]','Offline');text('[data-forecast]','—');text('[data-trend]','Updates paused');
      text('[data-ai="performance"]','Unavailable');
      text('[data-note]','Last reading · connection lost');
    } finally { window.setTimeout(poll,2000); }
  }
  poll();
})();
