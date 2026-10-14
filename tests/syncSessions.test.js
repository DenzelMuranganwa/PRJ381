'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { loadConfig } = require('../config');
const { createApp } = require('../app');
const { TelemetryStore } = require('../services/telemetryStore');
const { UserStore } = require('../services/userStore');

class SyncSessionsCollection {
  constructor() {
    this.documents = new Map();
  }

  async updateOne(filter, update) {
    const existing = this.documents.get(filter.sessionId);
    this.documents.set(filter.sessionId, {
      ...(existing || update.$setOnInsert),
      ...update.$set,
    });
  }

  async deleteOne(filter) {
    const document = this.documents.get(filter.sessionId);
    if (document && document.isGuest === filter.isGuest) this.documents.delete(filter.sessionId);
  }
}

test('guest heartbeat upserts a guest session and registration transitions it to a driver session', async t => {
  const config = loadConfig({ SESSION_SECRET: 'test-session-secret-which-is-long-enough' });
  const syncSessionsCollection = new SyncSessionsCollection();
  const server = createApp(
    config,
    new TelemetryStore(config),
    new UserStore(),
    { syncSessionsCollection },
  ).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  async function request(route, options = {}) {
    const headers = { ...options.headers };
    if (cookie) headers.cookie = cookie;
    const response = await fetch(`${baseUrl}${route}`, { ...options, headers, redirect: 'manual' });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';', 1)[0];
    return response;
  }

  const registerPage = await request('/register');
  const registerHtml = await registerPage.text();
  const csrfToken = registerHtml.match(/name="_csrf" value="([^"]+)"/)[1];
  const heartbeat = await request('/api/sessions/guest-heartbeat', { method: 'POST' });
  assert.equal(heartbeat.status, 204);
  assert.equal(syncSessionsCollection.documents.size, 1);
  const [guestSession] = syncSessionsCollection.documents.values();
  assert.match(guestSession.sessionId, /^SES-GUEST-[a-f0-9]{8}$/);
  assert.deepEqual(
    Object.keys(guestSession).sort(),
    ['sessionId', 'driverName', 'duration', 'isGuest', 'packetsSent', 'segment', 'status', 'statusClass', 'updatedAt'].sort(),
  );
  assert.equal(guestSession.driverName, 'Guest Observer');
  assert.equal(guestSession.duration, '00h 00m');
  assert.equal(guestSession.isGuest, true);
  assert.equal(guestSession.packetsSent, 0);
  assert.equal(guestSession.segment, 'Public Spectator View');
  assert.equal(guestSession.status, 'Active');
  assert.equal(guestSession.statusClass, 'status-active');
  assert.ok(guestSession.updatedAt instanceof Date);

  const registration = new URLSearchParams({
    _csrf: csrfToken,
    fullName: 'Test Driver',
    email: 'driver@example.com',
    password: 'StrongPass123',
    vehicleNickname: 'Solar One',
  });
  const registered = await request('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: registration,
  });
  assert.equal(registered.status, 302);
  assert.equal(syncSessionsCollection.documents.size, 1);
  const [driverSession] = syncSessionsCollection.documents.values();
  assert.match(driverSession.sessionId, /^SES-DRIVER-[a-f0-9-]+$/);
  assert.equal(driverSession.driverName, 'Test Driver');
  assert.equal(driverSession.duration, '00h 00m');
  assert.equal(driverSession.isGuest, false);
  assert.equal(driverSession.packetsSent, 0);
  assert.equal(driverSession.segment, 'Solar Route Track Active');
  assert.equal(driverSession.status, 'Active');
  assert.equal(driverSession.statusClass, 'status-active');
  assert.ok(driverSession.updatedAt instanceof Date);
});
