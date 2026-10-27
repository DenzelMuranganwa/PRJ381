'use strict';
(() => {
  const text = (selector, value) => document.querySelectorAll(selector).forEach(node => { node.textContent = value; });
  const format = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';
  const names = { temperature:'air temperature', humidity:'humidity', wind:'wind speed', irradiance:'irradiance', rain:'rainfall', battery:'battery level', speed:'vehicle speed' };
  let simulationFeedTimer = null;
  let simulationRequestInFlight = false;
  let simulationState = 'idle';
  let lastSimulationPosition = null;
  let simulationRoute = null;
  let routeDistances = [];
  let routeProgressMeters = 0;
  let routeLengthMeters = 0;
  let simulatedSpeedKmh = 0;
  let distanceTodayKm = 0;
  let lastSimulationTick = null;

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
    const feedSource = data.weather?.source === 'simulation' ? 'SIMULATED FEED' : data.weather?.source?.toUpperCase() || 'Sensor';
    text('[data-feed-detail]', data.transport.message || `${feedSource} · ${data.transport.state}${data.weather?.timezoneAssumed ? ' · sensor timezone from configuration' : ''}`);
    text('[data-transport]', `Feed: ${data.transport.state}`);
    text('[data-age]', data.weatherAgeMs == null ? 'No reading yet' : `Measured ${Math.floor(data.weatherAgeMs/1000)}s ago`);
    text('[data-battery]', v.battery_pct == null ? '—' : `${format(v.battery_pct,0)}%`);
    const values = {
      temperature:w.temperature_c, irradiance:w.irradiance_wm2, rainfall:w.rainfall_mmh,
      wind:w.wind_speed_ms == null ? null : w.wind_speed_ms*3.6, humidity:w.humidity_pct,
      pressure:w.pressure_hpa, altitude:w.altitude_m, speed:v.speed_kmh, distance:v.distance_today_km,
    };
    for (const [key,value] of Object.entries(values)) {
      const unavailable = ['irradiance','rainfall'].includes(key) ? 'Not measured' : '—';
      text(`[data-value="${key}"]`,Number.isFinite(value) ? format(value) : unavailable);
    }
    for (const key of ['temperature','wind','humidity','pressure']) {
      const value = values[key];
      text(`[data-note="${key}"]`,value == null ? (data.weather ? 'No sensor measurement' : 'Waiting for measurement') :
        data.weather?.source === 'simulation' ? 'Simulated reading' :
          data.state === 'live' ? 'Measured by sensor' : 'Last reading · stale');
    }
    text('[data-value="timestamp"]',data.weather ? new Date(data.weather.timestamp).toLocaleString() : '—');
    for (const gps of document.querySelectorAll('[data-value="gps"]')) {
      if (w.latitude == null || w.longitude == null) {
        gps.textContent = 'No GPS fix available';
        delete gps.dataset.latitude;
        delete gps.dataset.longitude;
      } else {
        gps.dataset.latitude = String(w.latitude);
        gps.dataset.longitude = String(w.longitude);
        gps.textContent = `${Math.abs(w.latitude).toFixed(5)}° ${w.latitude<0?'S':'N'}, ${Math.abs(w.longitude).toFixed(5)}° ${w.longitude<0?'W':'E'}`;
      }
    }
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
      const f=ai.forecasts[key], irradianceUnavailable=key==='irradiance'&&w.irradiance_wm2==null;
      text(`[data-forecast="${key}"]`,irradianceUnavailable?'Not measured':format(f?.value));
      text(`[data-trend="${key}"]`,irradianceUnavailable?'Not measured by station':
        data.state!=='live'?'Waiting for fresh readings':f?.value==null?`Waiting · ${f?.samples||0} valid samples`:`${f.trend} · ${f.samples} samples`);
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

  if (document.body.dataset.simulationEnabled === 'true') {
    const simulationStatus = document.getElementById('simulation-feed-status');
    const simulationButton = document.getElementById('beginSimulationBtn');
    const distanceMeters = (first, second) => {
      const radians = degrees => degrees * Math.PI / 180;
      const latDifference = radians(second[0] - first[0]);
      const lonDifference = radians(second[1] - first[1]);
      const a = Math.sin(latDifference / 2) ** 2
        + Math.cos(radians(first[0])) * Math.cos(radians(second[0]))
          * Math.sin(lonDifference / 2) ** 2;
      return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    const readActiveTrip = () => {
      const savedTrip = localStorage.getItem('activeSolarNavigation');
      if (!savedTrip) return null;
      const trip = JSON.parse(savedTrip);
      if (!trip.isActive || !Array.isArray(trip.coordinates) || trip.coordinates.length < 2) return null;
      return trip;
    };
    const setSimulatedPosition = position => {
      lastSimulationPosition = { latitude: position[0], longitude: position[1] };
      for (const gps of document.querySelectorAll('[data-value="gps"]')) {
        gps.dataset.latitude = String(position[0]);
        gps.dataset.longitude = String(position[1]);
        gps.textContent = `${position[0].toFixed(5)}, ${position[1].toFixed(5)}`;
      }
      text('[data-value="speed"]', format(simulatedSpeedKmh, 0));
      text('[data-value="distance"]', distanceTodayKm.toFixed(2));
    };
    const positionAtDistance = progress => {
      let segment = 1;
      while (segment < routeDistances.length - 1 && routeDistances[segment] < progress) segment++;
      const startDistance = routeDistances[segment - 1];
      const segmentLength = routeDistances[segment] - startDistance;
      const ratio = segmentLength > 0 ? (progress - startDistance) / segmentLength : 0;
      const start = simulationRoute[segment - 1];
      const end = simulationRoute[segment];
      return [
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
      ];
    };
    const advanceSimulation = () => {
      if (simulationState !== 'running' || !simulationRoute) return;
      const now = performance.now();
      if (lastSimulationTick === null) {
        lastSimulationTick = now;
        return;
      }
      const elapsedSeconds = Math.min((now - lastSimulationTick) / 1000, 1.5);
      lastSimulationTick = now;
      const targetSpeed = Math.min(54, 42 + 8 * Math.sin(routeProgressMeters / 300));
      const speedChange = targetSpeed > simulatedSpeedKmh ? 8 : 14;
      const previousSpeed = simulatedSpeedKmh;
      simulatedSpeedKmh += Math.sign(targetSpeed - simulatedSpeedKmh)
        * Math.min(Math.abs(targetSpeed - simulatedSpeedKmh), speedChange * elapsedSeconds);
      const travelledMeters = ((previousSpeed + simulatedSpeedKmh) / 2) / 3.6 * elapsedSeconds;
      routeProgressMeters = Math.min(routeLengthMeters, routeProgressMeters + travelledMeters);
      distanceTodayKm = routeProgressMeters / 1000;
      setSimulatedPosition(positionAtDistance(routeProgressMeters));
      if (routeProgressMeters >= routeLengthMeters) {
        simulatedSpeedKmh = 0;
        simulationState = 'complete';
        setSimulatedPosition(simulationRoute[simulationRoute.length - 1]);
        simulationStatus.textContent = 'Route simulation complete · telemetry feed continues.';
      }
      renderSimulationButton();
    };
    const renderSimulationButton = () => {
      if (!simulationButton) return;
      const trip = readActiveTrip();
      simulationButton.disabled = !trip;
      if (!trip) {
        document.body.dataset.routeSimulation = 'idle';
        simulationButton.textContent = 'Begin Simulation';
        simulationButton.title = 'Choose and start a route first.';
      } else {
        simulationButton.title = '';
        document.body.dataset.routeSimulation = simulationState;
        simulationButton.textContent = {
          idle: 'Begin Simulation',
          running: 'Pause Simulation',
          paused: 'Resume Simulation',
          complete: 'Replay Simulation',
        }[simulationState];
      }
    };
    simulationButton?.addEventListener('click', () => {
      const trip = readActiveTrip();
      if (!trip) {
        renderSimulationButton();
        return;
      }
      if (simulationState === 'running') {
        simulationState = 'paused';
        simulatedSpeedKmh = 0;
        lastSimulationTick = null;
        text('[data-value="speed"]', '0');
      } else {
        if (simulationState === 'idle' || simulationState === 'complete') {
          simulationRoute = trip.coordinates;
          routeDistances = [0];
          for (let index = 1; index < simulationRoute.length; index++) {
            const start = simulationRoute[index - 1];
            const end = simulationRoute[index];
            if (!Array.isArray(start) || !Array.isArray(end)
              || start.length !== 2 || end.length !== 2
              || !start.every(Number.isFinite) || !end.every(Number.isFinite)
              || Math.abs(start[0]) > 90 || Math.abs(start[1]) > 180
              || Math.abs(end[0]) > 90 || Math.abs(end[1]) > 180) {
              simulationStatus.textContent = 'Saved route has invalid coordinates; simulation cannot start.';
              return;
            }
            routeDistances.push(routeDistances[index - 1] + distanceMeters(start, end));
          }
          routeLengthMeters = routeDistances[routeDistances.length - 1];
          if (routeLengthMeters <= 0) {
            simulationStatus.textContent = 'Saved route has no measurable distance; simulation cannot start.';
            return;
          }
          routeProgressMeters = 0;
          distanceTodayKm = 0;
          simulatedSpeedKmh = 0;
          setSimulatedPosition(simulationRoute[0]);
        }
        simulationState = 'running';
        lastSimulationTick = performance.now();
      }
      renderSimulationButton();
    });
    renderSimulationButton();
    const nextSimulationPosition = () => {
      const trip = readActiveTrip();
      if (trip && simulationState === 'idle') {
        const start = trip.coordinates[0];
        if (!Array.isArray(start) || start.length !== 2 || !start.every(Number.isFinite)) {
          throw new Error('Saved navigation route has invalid coordinates; simulated feed stopped.');
        }
        lastSimulationPosition = { latitude: start[0], longitude: start[1] };
      }
      if (!lastSimulationPosition) return null;
      return {
        ...lastSimulationPosition,
        speed_kmh: simulationState === 'running' ? simulatedSpeedKmh : 0,
        distance_today_km: distanceTodayKm,
      };
    };
    const sendSimulationReading = async () => {
      if (simulationRequestInFlight) return;
      simulationRequestInFlight = true;
      let response;
      try {
        const position = nextSimulationPosition();
        response = await fetch('/api/simulation/telemetry', {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': document.body.dataset.csrfToken,
          },
          body: JSON.stringify(position || {}),
          signal: AbortSignal.timeout(5000),
        });
        const result = await response.json();
        if (!response.ok) {
          const error = new Error(result.error || `Simulated feed failed with HTTP ${response.status}.`);
          error.status = response.status;
          throw error;
        }
        simulationStatus.textContent = 'Automatic simulated feed active · updating every 5 seconds.';
      } catch (error) {
        if ([400, 403, 404, 409, 422].includes(error.status)) {
          window.clearInterval(simulationFeedTimer);
          simulationFeedTimer = null;
          simulationStatus.textContent = `${error.message} Automatic simulated updates stopped.`;
        } else {
          simulationStatus.textContent = `${error.message || 'Simulated feed could not send a reading.'} Retrying automatically.`;
        }
      } finally {
        simulationRequestInFlight = false;
      }
    };
    const startSimulationFeed = () => {
      void sendSimulationReading();
      simulationFeedTimer = window.setInterval(sendSimulationReading, 5000);
    };
    window.setInterval(advanceSimulation, 1000);
    startSimulationFeed();
  }

  poll();
})();
