'use strict';
const express = require('express');
const { timingSafeEqual } = require('node:crypto');
const { optimize } = require('../services/optimizer');

function createApiRouter(store, config) {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/status', (req, res) => {
    const snapshot = store.snapshot(); res.json({ ...snapshot, analysis: optimize(snapshot) });
  });
  function authenticate(req, res, next) {
    if (!config.token) return res.status(503).json({ error: 'Set SENSOR_API_TOKEN in .env before sending readings' });
    const expected = Buffer.from(`Bearer ${config.token}`), actual = Buffer.from(req.get('Authorization') || '');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return res.status(401).json({ error: 'Invalid sensor token' });
    next();
  }
  function ingest(kind) {
    return (req, res, next) => {
      if (kind === 'weather' && config.source !== 'http') return res.status(409).json({ error: 'Weather source is MQTT; HTTP weather ingestion is disabled' });
      if (!req.is('application/json')) return res.status(415).json({ error: 'Use application/json' });
      try { res.json(store.ingest(req.body, kind, 'http')); } catch (error) { next(error); }
    };
  }
  router.post('/telemetry/weather', authenticate, express.json({ limit: '8kb', strict: true }), ingest('weather'));
  router.post('/telemetry/vehicle', authenticate, express.json({ limit: '8kb', strict: true }), ingest('vehicle'));
  return router;
}
module.exports = { createApiRouter };
