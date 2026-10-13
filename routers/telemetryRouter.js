'use strict';

const { randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');

function createTelemetryRouter(userStore, avatarUpload, publicRoot) {
  const router = express.Router();
  const authenticated = (req, res, next) => requireAuth(req, res, next, userStore);

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
    await startUserSession(req, user);
    res.redirect('/dashboard');
  });

  router.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('views/register', { error: null, values: {} });
  });

  router.post('/register', avatarUpload, requireCsrf, async (req, res) => {
    const body = req.body || {};
    const values = {
      fullName: field(body.fullName),
      email: field(body.email).toLowerCase(),
      vehicleNickname: field(body.vehicleNickname),
    };
    const password = typeof body.password === 'string' ? body.password : '';
    let error = validateRegistration({ ...values, password });
    if (error) return res.status(400).render('views/register', { error, values });
    const avatarExtension = req.file && validateAvatar(req.file);
    if (req.file && !avatarExtension) return res.status(400).render('views/register', {
      error: 'The selected file is not a supported JPEG, PNG, GIF, or WebP image.',
      values,
    });

    try {
      let user = await userStore.createUser({ ...values, password });
      if (req.file) {
        const profilePictureUrl = await saveAvatar(req.file, avatarExtension, publicRoot);
        user = await userStore.updateProfilePicture(user.id, profilePictureUrl);
      }
      await startUserSession(req, user);
      res.redirect('/dashboard');
    } catch (creationError) {
      if (creationError.code === 'EMAIL_EXISTS') {
        return res.status(409).render('views/register', { error: creationError.message, values });
      }
      throw creationError;
    }
  });

  router.get('/logout', destroySession);
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

  router.get('/sync-sessions', authenticated, (req, res) => {
    res.render('pages/Sync&Sessions', { activePage: 'sync', pageTitle: 'Sync & Logs' });
  });

  // 1. ROUTE SETUP PAGE: Passes position and default markers
  router.get('/route-setup', (req, res) => {
    res.render('pages/route-setUp', {
      pageTitle: 'Route Navigation - IWOS',
      activePage: 'route-setup',
      initLat: -25.7479,
      initLng: 28.2293,
      windSpeed: 13,
      piPosition: {
        lat: '-25.7479',
        lng: '28.2293',
        lastSeen: new Date(),
        windKmh: 13,
        tempC: 25,
        irradiance: 850
      },
      savedPlaces: [
        { name: 'Kempton Park Hub', coords: '-26.1325, 28.2312', distance: 'Sector 1' },
        { name: 'Pretoria Proving Loop', coords: '-25.7479, 28.2293', distance: 'Sector 2' }
      ]
    });
  });

  // 2. LIVE PI GPS POLLING API
  router.get('/api/vehicle/gps', (req, res) => {
    res.json({
      latitude: '-25.7479',
      longitude: '28.2293',
      wind_speed_ms: 3.6,
      temperature_c: 25,
      timestamp: new Date()
    });
  });

  // 3. SOLAR ROUTE CALCULATION API: OSRM with Steps + Komoot/Photon + Physics Engine
  router.post('/api/calculate-solar-route', async (req, res) => {
    const { startLat, startLng, destination, headwind } = req.body || {};

    if (!startLat || !startLng || !destination) {
      return res.status(400).json({ success: false, error: 'Start coordinates and destination are required' });
    }

    try {
      let destLat, destLng;
      const destStr = destination.trim();

      // Check for coordinate format (e.g. "-25.76746, 28.23726")
      const coordMatch = destStr.match(/^([-+]?\d+(?:\.\d+)?)[,\s]+([-+]?\d+(?:\.\d+)?)$/);
      if (coordMatch) {
        destLat = parseFloat(coordMatch[1]);
        destLng = parseFloat(coordMatch[2]);
      } else {
        // Geocode with Komoot / Photon
        let resolved = false;
        try {
          const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(destStr)}&limit=1`;
          const photonRes = await fetch(photonUrl, {
            headers: { 'User-Agent': 'IWOS-SolarVehicleTracker/1.0' }
          });
          if (photonRes.ok) {
            const photonData = await photonRes.json();
            if (photonData?.features?.length > 0) {
              const [lon, lat] = photonData.features[0].geometry.coordinates;
              destLat = lat;
              destLng = lon;
              resolved = true;
            }
          }
        } catch (e) {
          console.warn('Photon fallback:', e.message);
        }

        // Fallback to Nominatim
        if (!resolved) {
          const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destStr)}`;
          const nomRes = await fetch(nomUrl, {
            headers: {
              'User-Agent': 'IWOS-TelemetryApp-V2/1.0 (telemetry-contact@iwos.org)',
              'Accept': 'application/json'
            }
          });
          const nomData = await nomRes.json();
          if (!nomData || !nomData.length) {
            throw new Error(`Could not find destination: "${destStr}"`);
          }
          destLat = parseFloat(nomData[0].lat);
          destLng = parseFloat(nomData[0].lon);
        }
      }

      // Fetch driving route from OSRM with steps=true for navigation maneuvers
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true&alternatives=true`;
      const osrmRes = await fetch(osrmUrl, {
        headers: { 'User-Agent': 'IWOS-SolarVehicleTracker/1.0' }
      });
      const osrmData = await osrmRes.json();

      if (osrmData.code !== 'Ok' || !osrmData.routes?.length) {
        return res.status(404).json({ success: false, error: 'No driving route found.' });
      }

      // Solar Car Physics
      const carMass = 280;
      const panelArea = 4.0;
      const irradiance = 850;
      const windSpeedKmh = parseFloat(headwind) || 0;
      const rho = 1.2;
      const cdA = 0.14;
      const crr = 0.0035;
      const g = 9.81;
      const motorEff = 0.90;
      const panelEff = 0.22;

      const evaluatedRoutes = [];

      for (let i = 0; i < osrmData.routes.length; i++) {
        const r = osrmData.routes[i];
        const durationSec = r.duration;
        const distanceM = r.distance;
        const avgSpeedMS = distanceM / durationSec;

        let elevationGain = 0;
        try {
          const sampled = r.geometry.coordinates.filter((_, idx) => idx % 10 === 0);
          const lats = sampled.map(c => c[1]).join(',');
          const lons = sampled.map(c => c[0]).join(',');
          const elevRes = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`);
          if (elevRes.ok) {
            const elevData = await elevRes.json();
            const arr = elevData.elevation || [];
            for (let j = 1; j < arr.length; j++) {
              const diff = arr[j] - arr[j - 1];
              if (diff > 0) elevationGain += diff;
            }
          }
        } catch {
          elevationGain = 0;
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

      res.json({
        success: true,
        origin: [parseFloat(startLat), parseFloat(startLng)],
        destination: [destLat, destLng],
        routes: evaluatedRoutes
      });

    } catch (error) {
      console.error('Route calculation error:', error.message);
      res.status(500).json({ success: false, error: error.message || 'Route calculation failed' });
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

function destroySession(req, res, next) {
  if (!req.session) return res.redirect('/signup');
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie('iwos.sid', { httpOnly: true, sameSite: 'lax', secure: Boolean(req.app.get('env') === 'production') });
    res.redirect('/signup');
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