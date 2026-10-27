'use strict';
const express = require('express');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const multer = require('multer');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createApiRouter } = require('./routers/apiRouter');
const { createTelemetryRouter } = require('./routers/telemetryRouter');
const { UserStore } = require('./services/userStore');

// If your custom router file is located at ./routes/index.js (or ./routes/routes.js), require it:
let customRouter = null;
try {
  customRouter = require('./routes/index'); // Adjust if your file is named ./routes.js or similar
} catch (e) {
  try {
    customRouter = require('./routes');
  } catch (err) {
    // If it's located elsewhere, require the exact path
  }
}

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10, parts: 12 },
  fileFilter(req, file, callback) {
    const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
    if (!acceptedTypes.has(file.mimetype)) {
      const error = new Error('Upload a JPEG, PNG, GIF, or WebP image no larger than 5 MB.');
      error.status = 400;
      callback(error);
      return;
    }
    callback(null, true);
  },
});

function createApp(config, store, userStore = new UserStore(), {
  mongoClient = null,
  databaseName = 'iwos_database',
  syncSessionsCollection = null,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProduction) app.set('trust proxy', 1);
  app.set('view engine', 'ejs'); 
  app.set('views', config.root);

  // 1. CRITICAL: Enable JSON parsing so /api/calculate-solar-route receives req.body
  app.use(express.json({ limit: '8kb' }));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));

  app.use(session({
    name: 'iwos.sid',
    secret: config.sessionSecret || randomBytes(32).toString('hex'),
    ...(mongoClient ? {
      store: MongoStore.create({
        client: mongoClient,
        dbName: databaseName,
        collectionName: 'express_sessions',
        ttl: 8 * 60 * 60,
      }),
    } : {}),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: Boolean(config.isProduction),
      maxAge: 8 * 60 * 60 * 1000,
    },
  }));

  const pageRoutes = new Set(['/', '/signup', '/signin', '/register', '/settings', '/dashboard', '/sync-sessions', '/route-setup']);
  app.use((req, res, next) => {
    if (!pageRoutes.has(req.path)) return next();
    if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex');
    res.locals.csrfToken = req.session.csrfToken;
    res.locals.currentUser = req.session.user || null;
    res.locals.themePreference = req.session.user?.themePreference || req.session.themePreference || 'dark';
    next();
  });

  app.use(express.static(path.join(config.root, 'public')));

  // 2. Mount your custom router (where /route-setup and /api/calculate-solar-route live)
  if (customRouter) {
    app.use('/', customRouter);
  }

  // 3. Existing application routers
  app.use('/api', createApiRouter(store, config));
  app.use('/', createTelemetryRouter(
    userStore,
    avatarUpload.single('avatar'),
    path.join(config.root, 'public'),
    syncSessionsCollection,
    store,
    config,
  ));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error instanceof multer.MulterError ? 400 : 500);
    if (status >= 500) console.error('Request failed:', error);
    const message = error instanceof multer.MulterError
      ? 'Image upload rejected. Only one image up to 5 MB is allowed.'
      : error.type === 'entity.parse.failed' ? 'Malformed JSON' : error.message;
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : message });
  });

  return app;
}

module.exports = { createApp };