'use strict';

const { randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { rateLimit } = require('express-rate-limit');

function createTelemetryRouter(
  userStore,
  avatarUpload,
  publicRoot,
  syncSessionsCollection = null,
  telemetryStore = null,
) {
  const router = express.Router();
  const authenticated = (req, res, next) => requireAuth(req, res, next, userStore);
  const routeAuthenticated = (req, res, next) => requireApiAuth(req, res, next, userStore);
  const guestHeartbeatLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many guest heartbeats. Try again shortly.' },
  });
  const routeCalculationLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, error: 'Too many route calculations. Try again later.' },
  });
  const routeSuggestionLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many location searches. Try again shortly.' },
  });

  router.get('/', (req, res) => res.redirect('/dashboard'));

  router.get(['/signup', '/signin'], (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('views/signin', { error: null, email: '' });
  });

  router.post(['/signup', '/signin'], requireCsrf, async (req, res) => {
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const user = await userStore.authenticate(email, password);
    if (!user) return res.status(401).render('views/signin', { error: 'Email or password is incorrect.', email });
    await startAuthenticatedSession(req, user, syncSessionsCollection);
    res.redirect('/dashboard');
  });

  router.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('views/register', { error: null, values: {} });
  });

  router.post('/register', requireCsrf, async (req, res) => {
    const body = req.body || {};
    const values = {
      fullName: field(body.fullName),
      email: field(body.email).toLowerCase(),
      vehicleNickname: field(body.vehicleNickname),
    };
    const password = typeof body.password === 'string' ? body.password : '';
    let error = validateRegistration({ ...values, password });
    if (error) return res.status(400).render('views/register', { error, values });
    try {
      const user = await userStore.createUser({ ...values, password });
      await startAuthenticatedSession(req, user, syncSessionsCollection);
      res.redirect('/dashboard');
    } catch (creationError) {
      if (creationError.code === 'EMAIL_EXISTS') {
        return res.status(409).render('views/register', { error: creationError.message, values });
      }
      throw creationError;
    }
  });

  router.post('/logout', requireCsrf, destroySession);

  router.get('/settings', authenticated, (req, res) => {
    res.render('views/settings', { error: null, saved: req.query.saved === '1' });
  });

  router.post('/settings', authenticated, avatarUpload, requireCsrf, async (req, res) => {
    const body = req.body || {};
    const fullName = field(body.fullName);
    const vehicleNickname = field(body.vehicleNickname);
    if (fullName.length < 2 || fullName.length > 80 || vehicleNickname.length < 1 || vehicleNickname.length > 40) {
      return res.status(400).render('views/settings', {
        error: 'Enter a name (2–80 characters) and vehicle nickname (1–40 characters).',
        saved: false,
      });
    }
    const avatarExtension = req.file && validateAvatar(req.file);
    if (req.file && !avatarExtension) {
      return res.status(400).render('views/settings', {
        error: 'The selected file is not a supported JPEG, PNG, GIF, or WebP image.',
        saved: false,
      });
    }
    let updatedUser = await userStore.updateProfile(req.session.user.id, { fullName, vehicleNickname });
    if (!updatedUser) return res.redirect('/logout');
    if (req.file) {
      const profilePictureUrl = await saveAvatar(req.file, avatarExtension, publicRoot);
      updatedUser = await userStore.updateProfilePicture(updatedUser.id, profilePictureUrl);
    }
    req.session.user = updatedUser;
    res.redirect('/settings?saved=1');
  });

  router.post('/settings/theme', requireCsrf, async (req, res) => {
    const theme = req.body && req.body.themePreference;
    if (!['dark', 'light'].includes(theme)) return res.status(400).send('Invalid theme preference.');
    if (req.session.user) {
      const updatedUser = await userStore.updateTheme(req.session.user.id, theme);
      if (!updatedUser) return res.redirect('/logout');
      req.session.user = updatedUser;
    } else {
      req.session.themePreference = theme;
    }
    res.status(204).end();
  });

  router.post('/settings/avatar', authenticated, requireCsrf, async (req, res) => {
    const pictureUrl = field(req.body && req.body.profilePictureUrl);
    if (pictureUrl.length > 2048) {
      return res.status(400).send('Profile picture URL must be 2048 characters or fewer.');
    }
    if (pictureUrl) {
      let parsedUrl;
      try {
        parsedUrl = new URL(pictureUrl);
      } catch {
        return res.status(400).send('Enter a valid HTTPS image URL.');
      }
      if (parsedUrl.protocol !== 'https:') return res.status(400).send('Profile pictures must use an HTTPS URL.');
    }
    const updatedUser = await userStore.updateProfilePicture(req.session.user.id, pictureUrl);
    if (!updatedUser) return res.redirect('/logout');
    req.session.user = updatedUser;
    res.redirect('/dashboard');
  });

  router.get('/dashboard', (req, res) => {
    res.render('pages/Dashboard', { 
      activePage: 'dashboard',
      pageTitle: 'Telemetry Dashboard',
      dynamics: { lat: '-25.7479', lng: '28.2293', speed: 13, logToday: 0 }
    });
  });

  router.post('/api/sessions/guest-heartbeat', guestHeartbeatLimiter, async (req, res) => {
    if (!syncSessionsCollection) {
      return res.status(503).json({ error: 'Session persistence is not configured.' });
    }
    if (req.session.user) return res.status(204).end();

    const now = Date.now();
    if (!req.session.guestSessionId || !req.session.guestSessionStartedAt) {
      req.session.guestSessionId = `SES-GUEST-${randomBytes(4).toString('hex')}`;
      req.session.guestSessionStartedAt = now;
    }
    await upsertSyncSession(syncSessionsCollection, req.session.guestSessionId, {
      driverName: 'Guest Observer',
      duration: formatDuration(now - req.session.guestSessionStartedAt),
      isGuest: true,
      packetsSent: 0,
      segment: 'Public Spectator View',
      status: 'Active',
      statusClass: 'status-active',
      updatedAt: new Date(now),
    });
    res.status(204).end();
  });

  router.get('/sync-sessions', authenticated, (req, res) => {
    res.render('pages/Sync&Sessions', { activePage: 'sync', pageTitle: 'Sync & Logs' });
  });

  // 1. ROUTE SETUP PAGE: Passes position and default markers
  router.get('/route-setup', authenticated, (req, res) => {
    const snapshot = telemetryStore ? telemetryStore.snapshot() : null;
    const weather = snapshot && snapshot.weatherAgeMs <= telemetryStore.config.staleAfterMs
      ? snapshot.weather
      : null;
    const values = weather ? weather.values : null;
    const hasGps = values && Number.isFinite(values.latitude) && Number.isFinite(values.longitude);
    const latitude = hasGps ? values.latitude : null;
    const longitude = hasGps ? values.longitude : null;
    const windKmh = values && Number.isFinite(values.wind_speed_ms)
      ? values.wind_speed_ms * 3.6
      : null;
    res.render('pages/route-setUp', {
      pageTitle: 'Route Navigation - IWOS',
      activePage: 'route-setup',
      piPosition: {
        lat: latitude,
        lng: longitude,
        windKmh,
      },
      hasGps: Boolean(hasGps),
      savedPlaces: [
        { name: 'Kempton Park Hub', coords: '-26.1325, 28.2312', distance: 'Sector 1' },
        { name: 'Pretoria Proving Loop', coords: '-25.7479, 28.2293', distance: 'Sector 2' }
      ]
    });
  });

  router.get('/api/vehicle/gps', routeAuthenticated, (req, res) => {
    const snapshot = telemetryStore ? telemetryStore.snapshot() : null;
    const weather = snapshot && snapshot.weatherAgeMs <= telemetryStore.config.staleAfterMs
      ? snapshot.weather
      : null;
    const values = weather ? weather.values : null;
    if (!values || !Number.isFinite(values.latitude) || !Number.isFinite(values.longitude)) {
      return res.status(503).json({ error: 'No fresh GPS fix is available from the weather telemetry.' });
    }
    res.json({
      latitude: values.latitude,
      longitude: values.longitude,
      wind_speed_ms: values.wind_speed_ms,
      temperature_c: values.temperature_c,
      timestamp: weather.timestamp,
    });
  });

  router.get('/api/route-suggestions', routeAuthenticated, routeSuggestionLimiter, async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (query.length < 3 || query.length > 120) {
      return res.status(400).json({ error: 'Search text must be between 3 and 120 characters.' });
    }
    const lat = parseCoordinate(req.query.lat, -90, 90);
    const lon = parseCoordinate(req.query.lon, -180, 180);
    if (lat === null || lon === null) {
      return res.status(400).json({ error: 'Valid location-bias coordinates are required.' });
    }

    try {
      const url = new URL('https://photon.komoot.io/api/');
      url.searchParams.set('q', query);
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lon));
      url.searchParams.set('limit', '5');
      const data = await fetchJson(url, {}, 'Location search');
      const suggestions = Array.isArray(data.features)
        ? data.features.flatMap(feature => {
          const coordinates = feature.geometry && feature.geometry.coordinates;
          const properties = feature.properties || {};
          if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
          const suggestionLat = Number(coordinates[1]);
          const suggestionLon = Number(coordinates[0]);
          if (!Number.isFinite(suggestionLat) || !Number.isFinite(suggestionLon)
            || suggestionLat < -90 || suggestionLat > 90
            || suggestionLon < -180 || suggestionLon > 180) return [];
          const street = typeof properties.street === 'string' ? properties.street : '';
          const houseNumber = typeof properties.housenumber === 'string' ? properties.housenumber : '';
          const name = typeof properties.name === 'string' ? properties.name : '';
          const primary = name || `${houseNumber ? `${houseNumber} ` : ''}${street}`.trim() || 'Location';
          const secondary = [
            street !== primary ? street : '',
            properties.city || properties.town || properties.district,
            properties.state,
            properties.country,
          ].filter(value => typeof value === 'string' && value.length > 0).join(', ');
          return [{ name: primary, secondary, latitude: suggestionLat, longitude: suggestionLon }];
        })
        : [];
      res.json({ suggestions });
    } catch (error) {
      console.error('Location search failed:', error);
      res.status(error.status || 502).json({ error: 'Location search is temporarily unavailable.' });
    }
  });

  router.post('/api/calculate-solar-route', routeAuthenticated, routeCalculationLimiter, async (req, res) => {
    const { startLat, startLng, destination, headwind } = req.body || {};
    const originLat = parseCoordinate(startLat, -90, 90);
    const originLng = parseCoordinate(startLng, -180, 180);
    const windSpeedKmh = headwind === undefined
      ? 0
      : parseCoordinate(headwind, -200, 200);
    if (originLat === null || originLng === null) {
      return res.status(400).json({ success: false, error: 'Valid start latitude and longitude are required.' });
    }
    if (typeof destination !== 'string' || destination.trim().length < 1 || destination.trim().length > 200) {
      return res.status(400).json({ success: false, error: 'Destination must be between 1 and 200 characters.' });
    }
    if (windSpeedKmh === null) {
      return res.status(400).json({ success: false, error: 'Headwind must be a number between -200 and 200 km/h.' });
    }

    try {
      let destLat, destLng;
      const destStr = destination.trim();

      // Check for coordinate format (e.g. "-25.76746, 28.23726")
      const coordMatch = destStr.match(/^([-+]?\d+(?:\.\d+)?)[,\s]+([-+]?\d+(?:\.\d+)?)$/);
      if (coordMatch) {
        destLat = parseCoordinate(coordMatch[1], -90, 90);
        destLng = parseCoordinate(coordMatch[2], -180, 180);
        if (destLat === null || destLng === null) {
          return res.status(400).json({ success: false, error: 'Destination coordinates are outside valid latitude/longitude ranges.' });
        }
      } else {
        let resolved = false;
        try {
          const photonUrl = new URL('https://photon.komoot.io/api/');
          photonUrl.searchParams.set('q', destStr);
          photonUrl.searchParams.set('limit', '1');
          const photonData = await fetchJson(photonUrl, {}, 'Photon geocoder');
          const coordinates = photonData.features?.[0]?.geometry?.coordinates;
          if (Array.isArray(coordinates) && coordinates.length >= 2) {
            destLat = parseCoordinate(coordinates[1], -90, 90);
            destLng = parseCoordinate(coordinates[0], -180, 180);
            resolved = destLat !== null && destLng !== null;
          }
        } catch (error) {
          console.warn('Photon geocoder failed; trying Nominatim:', error.message);
        }

        if (!resolved) {
          const nomUrl = new URL('https://nominatim.openstreetmap.org/search');
          nomUrl.searchParams.set('format', 'json');
          nomUrl.searchParams.set('limit', '1');
          nomUrl.searchParams.set('q', destStr);
          const nomData = await fetchJson(nomUrl, {
            headers: {
              'User-Agent': 'IWOS-TelemetryApp-V2/1.0 (telemetry-contact@iwos.org)',
              Accept: 'application/json',
            }
          }, 'Nominatim geocoder');
          if (!Array.isArray(nomData) || !nomData.length) {
            return res.status(404).json({ success: false, error: 'Could not find that destination.' });
          }
          destLat = parseCoordinate(nomData[0].lat, -90, 90);
          destLng = parseCoordinate(nomData[0].lon, -180, 180);
          if (destLat === null || destLng === null) {
            throw new Error('Nominatim returned invalid coordinates.');
          }
        }
      }

      const osrmUrl = new URL(
        `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}`,
      );
      osrmUrl.searchParams.set('overview', 'full');
      osrmUrl.searchParams.set('geometries', 'geojson');
      osrmUrl.searchParams.set('steps', 'true');
      osrmUrl.searchParams.set('alternatives', '3');
      const osrmData = await fetchJson(osrmUrl, {}, 'OSRM route service');

      if (osrmData.code !== 'Ok' || !osrmData.routes?.length) {
        return res.status(404).json({ success: false, error: 'No driving route found.' });
      }

      const carMass = 280;
      const panelArea = 4.0;
      const irradiance = 850;
      const rho = 1.2;
      const cdA = 0.14;
      const crr = 0.0035;
      const g = 9.81;
      const motorEff = 0.90;
      const panelEff = 0.22;

      const evaluatedRoutes = [];

      for (let i = 0; i < Math.min(osrmData.routes.length, 3); i++) {
        const r = osrmData.routes[i];
        if (!Number.isFinite(r.distance) || r.distance <= 0
          || !Number.isFinite(r.duration) || r.duration <= 0
          || !Array.isArray(r.geometry?.coordinates) || r.geometry.coordinates.length < 2) {
          continue;
        }
        const durationSec = r.duration;
        const distanceM = r.distance;
        const avgSpeedMS = distanceM / durationSec;

        const coordinates = r.geometry.coordinates;
        const step = Math.max(1, Math.ceil(coordinates.length / 100));
        const sampled = coordinates.filter((_, index) => index % step === 0).slice(0, 100);
        const lastCoordinate = coordinates[coordinates.length - 1];
        if (sampled.at(-1) !== lastCoordinate && sampled.length < 100) sampled.push(lastCoordinate);
        const elevationUrl = new URL('https://api.open-meteo.com/v1/elevation');
        elevationUrl.searchParams.set('latitude', sampled.map(point => point[1]).join(','));
        elevationUrl.searchParams.set('longitude', sampled.map(point => point[0]).join(','));
        const elevationData = await fetchJson(elevationUrl, {}, 'Elevation service');
        if (!Array.isArray(elevationData.elevation)
          || elevationData.elevation.length !== sampled.length
          || elevationData.elevation.some(value => !Number.isFinite(value))) {
          throw new Error('Elevation service returned incomplete elevation data.');
        }
        let elevationGain = 0;
        for (let index = 1; index < elevationData.elevation.length; index++) {
          const difference = elevationData.elevation[index] - elevationData.elevation[index - 1];
          if (difference > 0) elevationGain += difference;
        }

        const airSpeedMS = avgSpeedMS + ((windSpeedKmh * 1000) / 3600);
        const pAero = 0.5 * rho * cdA * Math.pow(airSpeedMS, 2) * avgSpeedMS;
        const pRoll = carMass * g * crr * avgSpeedMS;
        const pElevationWork = carMass * g * elevationGain;

        const totalConsumedJoules = ((pAero + pRoll) * durationSec + pElevationWork) / motorEff;
        const consumedKWh = totalConsumedJoules / 3.6e6;

        const pSolarWatts = panelArea * irradiance * panelEff;
        const generatedJoules = pSolarWatts * durationSec;
        const generatedKWh = generatedJoules / 3.6e6;

        const netKWh = (consumedKWh - generatedKWh).toFixed(2);

        // Extract maneuver steps
        const steps = (r.legs && r.legs[0] && r.legs[0].steps) ? r.legs[0].steps.map(s => ({
          instruction: s.maneuver.instruction || (s.maneuver.type + ' ' + (s.maneuver.modifier || '')),
          type: s.maneuver.type,
          modifier: s.maneuver.modifier,
          name: s.name || '',
          distance: Math.round(s.distance),
          duration: Math.round(s.duration),
          location: [s.maneuver.location[1], s.maneuver.location[0]]
        })) : [];

        evaluatedRoutes.push({
          track: i + 1,
          distanceKm: (distanceM / 1000).toFixed(1),
          durationMin: Math.round(durationSec / 60),
          elevationGainM: Math.round(elevationGain),
          netBatteryDrain: netKWh,
          consumedKWh: consumedKWh.toFixed(2),
          solarGeneratedKWh: generatedKWh.toFixed(2),
          steps: steps,
          coordinates: r.geometry.coordinates.map(([lon, lat]) => [lat, lon])
        });
      }

      evaluatedRoutes.sort((a, b) => parseFloat(a.netBatteryDrain) - parseFloat(b.netBatteryDrain));
      if (!evaluatedRoutes.length) {
        return res.status(502).json({ success: false, error: 'The routing service returned no usable route.' });
      }

      res.json({
        success: true,
        origin: [originLat, originLng],
        destination: [destLat, destLng],
        routes: evaluatedRoutes
      });

    } catch (error) {
      console.error('Route calculation failed:', error);
      res.status(error.status || 502).json({
        success: false,
        error: error.status === 504
          ? 'A routing data provider timed out. Try again shortly.'
          : 'Route calculation is temporarily unavailable because a routing data provider failed.',
      });
    }
  });

  return router;
}

async function requireAuth(req, res, next, userStore) {
  const userId = req.session.user?.id || req.session.userId;
  const user = req.session.user || (userId ? await userStore.getById(userId) : null);
  if (!user) return res.redirect('/signup');
  req.session.user = user;
  res.locals.currentUser = user;
  res.locals.themePreference = user.themePreference;
  next();
}

async function requireApiAuth(req, res, next, userStore) {
  const userId = req.session.user?.id || req.session.userId;
  const user = req.session.user || (userId ? await userStore.getById(userId) : null);
  if (!user) return res.status(401).json({ success: false, error: 'Sign in to use route planning.' });
  req.session.user = user;
  next();
}

function parseCoordinate(value, min, max) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

async function fetchJson(url, options, provider) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  } catch (error) {
    const wrappedError = new Error(`${provider} request failed: ${error.message}`);
    wrappedError.status = error.name === 'TimeoutError' || error.name === 'AbortError' ? 504 : 502;
    throw wrappedError;
  }
  if (!response.ok) {
    const error = new Error(`${provider} returned HTTP ${response.status}.`);
    error.status = 502;
    throw error;
  }
  try {
    return await response.json();
  } catch (cause) {
    const error = new Error(`${provider} returned invalid JSON.`, { cause });
    error.status = 502;
    throw error;
  }
}

function requireCsrf(req, res, next) {
  const token = req.body && req.body._csrf;
  const expected = req.session.csrfToken;
  if (typeof token !== 'string' || typeof expected !== 'string') return res.status(403).send('Invalid form token.');
  const providedBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return res.status(403).send('Invalid form token.');
  }
  next();
}

function startUserSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(error => {
      if (error) return reject(error);
      req.session.user = user;
      req.session.userId = user.id;
      req.session.csrfToken = randomBytes(32).toString('hex');
      resolve();
    });
  });
}

async function startAuthenticatedSession(req, user, syncSessionsCollection) {
  const guestSessionId = req.session.guestSessionId;
  await startUserSession(req, user);
  if (!syncSessionsCollection) return;

  if (!req.session.driverSessionId || !req.session.driverSessionStartedAt) {
    req.session.driverSessionId = `SES-DRIVER-${randomUUID()}`;
    req.session.driverSessionStartedAt = Date.now();
  }
  if (guestSessionId) {
    await syncSessionsCollection.deleteOne({ sessionId: guestSessionId, isGuest: true });
  }
  const now = Date.now();
  await upsertSyncSession(syncSessionsCollection, req.session.driverSessionId, {
    driverName: user.fullName,
    duration: formatDuration(now - req.session.driverSessionStartedAt),
    isGuest: false,
    packetsSent: 0,
    segment: 'Solar Route Track Active',
    status: 'Active',
    statusClass: 'status-active',
    updatedAt: new Date(now),
  });
}

function upsertSyncSession(collection, sessionId, fields) {
  return collection.updateOne(
    { sessionId },
    { $set: fields, $setOnInsert: { sessionId } },
    { upsert: true },
  );
}

function formatDuration(durationMs) {
  const totalMinutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}

function destroySession(req, res, next) {
  if (!req.session) return res.redirect('/dashboard');
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('iwos.sid', { httpOnly: true, sameSite: 'lax', secure: Boolean(req.app.get('env') === 'production') });
    res.redirect('/dashboard');
  });
}

function field(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateAvatar(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) return null;
  const { buffer, mimetype } = file;
  const signatures = {
    'image/jpeg': buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    'image/png': buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/gif': buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6)),
    'image/webp': buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP',
  };
  if (!signatures[mimetype]) return null;
  return { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' }[mimetype];
}

async function saveAvatar(file, extension, publicRoot) {
  const uploadDirectory = path.join(publicRoot, 'uploads');
  await fs.mkdir(uploadDirectory, { recursive: true });
  const filename = `${randomUUID()}${extension}`;
  await fs.writeFile(path.join(uploadDirectory, filename), file.buffer, { flag: 'wx', mode: 0o644 });
  return `/uploads/${filename}`;
}

function validateRegistration({ fullName, email, password, vehicleNickname }) {
  if (fullName.length < 2 || fullName.length > 80) return 'Full name must be between 2 and 80 characters.';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  if (vehicleNickname.length < 1 || vehicleNickname.length > 40) return 'Vehicle nickname must be between 1 and 40 characters.';
  if (password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) return 'Password must be at least 10 characters and no more than 72 bytes.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include an uppercase letter, a lowercase letter, and a number.';
  }
  return null;
}

module.exports = { createTelemetryRouter, validateRegistration };