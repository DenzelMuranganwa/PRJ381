'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { once } = require('node:events');
const path = require('node:path');
const { loadConfig } = require('../config');
const { createApp } = require('../app');
const { TelemetryStore } = require('../services/telemetryStore');
const { UserStore } = require('../services/userStore');

test('account registration, login, protected pages, profile preferences, and logout', async t => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /SESSION_SECRET/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'too-short' }), /SESSION_SECRET/);
  const config = loadConfig({ SESSION_SECRET: 'test-session-secret-which-is-long-enough' });
  const userStore = new UserStore();
  const server = createApp(config, new TelemetryStore(config), userStore).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const uploadedPaths = [];
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await Promise.all(uploadedPaths.map(url => fs.unlink(path.join(config.root, 'public', ...url.slice(1).split('/')))));
  });

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
  function csrfToken(html) {
    const match = html.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(match, 'expected a CSRF token in the page');
    return match[1];
  }

  const guestDashboard = await request('/dashboard');
  assert.equal(guestDashboard.status, 200);
  const guestHtml = await guestDashboard.text();
  assert.match(guestHtml, />Guest</);
  assert.match(guestHtml, /TELEMETRY FEED/);
  assert.equal((await request('/', { redirect: 'manual' })).headers.get('location'), '/dashboard');

  for (const route of ['/sync-sessions', '/route-setup', '/settings']) {
    const response = await request(route);
    assert.equal(response.status, 302, `${route} should require an account`);
    assert.equal(response.headers.get('location'), '/signup');
  }

  const registerPage = await request('/register');
  assert.equal(registerPage.status, 200);
  const registerHtml = await registerPage.text();
  assert.match(registerHtml, /href="\/dashboard"[^>]*>.*Back to Dashboard/);
  assert.doesNotMatch(registerHtml, /name="avatar"/);
  assert.match(registerHtml, /add a profile picture later in Personalization/i);
  const registrationToken = csrfToken(registerHtml);
  const blockedPost = await request('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ fullName: 'Test User', email: 'test@example.com', password: 'StrongPass123', vehicleNickname: 'IWOS-07' }),
  });
  assert.equal(blockedPost.status, 403);

  const registration = new URLSearchParams({
    _csrf: registrationToken,
    fullName: 'Test User',
    email: 'TEST@example.com',
    password: 'StrongPass123',
    vehicleNickname: 'IWOS-07',
  });
  const registerResponse = await request('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: registration,
  });
  assert.equal(registerResponse.status, 302);
  assert.equal(registerResponse.headers.get('location'), '/dashboard');
  const profile = await userStore.authenticate('test@example.com', 'StrongPass123');
  assert.equal(profile.fullName, 'Test User');
  assert.equal(profile.email, 'test@example.com');
  assert.equal(Object.hasOwn(profile, 'passwordHash'), false);
  assert.equal(await userStore.authenticate('test@example.com', 'wrong-password'), null);
  assert.equal(profile.profilePictureUrl, '');

  const dashboard = await request('/dashboard');
  assert.equal(dashboard.status, 200);
  const dashboardHtml = await dashboard.text();
  assert.match(dashboardHtml, /Test User/);
  assert.doesNotMatch(dashboardHtml, /profile-avatar-image/);
  assert.doesNotMatch(dashboardHtml, /Profile picture URL/);
  assert.match(dashboardHtml, /method="post" action="\/logout"/);
  assert.doesNotMatch(dashboardHtml, /href="\/logout"/);
  assert.match(dashboardHtml, /optimization-section/);
  const authenticatedToken = csrfToken(dashboardHtml);
  assert.equal((await request('/sync-sessions')).status, 200);
  assert.equal((await request('/route-setup')).status, 200);
  const routePage = await request('/route-setup');
  assert.match(await routePage.text(), /Waiting for a fresh GPS fix/);
  const zeroOriginResponse = await request('/api/calculate-solar-route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startLat: 0, startLng: 0, destination: '', headwind: 0 }),
  });
  assert.equal(zeroOriginResponse.status, 400);
  assert.match((await zeroOriginResponse.json()).error, /Destination/);
  const badWindResponse = await request('/api/calculate-solar-route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startLat: 0, startLng: 0, destination: 'Pretoria', headwind: 'strong' }),
  });
  assert.equal(badWindResponse.status, 400);

  const themeResponse = await request('/settings/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: authenticatedToken, themePreference: 'light' }),
  });
  assert.equal(themeResponse.status, 204);
  assert.equal((await userStore.getById(profile.id)).themePreference, 'light');
  const settings = await request('/settings');
  assert.equal(settings.status, 200);
  assert.match(await settings.text(), /data-theme="light"/);

  const avatarToken = csrfToken(await (await request('/dashboard')).text());
  const avatarResponse = await request('/settings/avatar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      _csrf: avatarToken,
      profilePictureUrl: 'https://images.example.test/avatar.png',
    }),
  });
  assert.equal(avatarResponse.status, 302);
  assert.equal((await userStore.getById(profile.id)).profilePictureUrl, 'https://images.example.test/avatar.png');
  assert.match(await (await request('/dashboard')).text(), /profile-avatar-image/);

  const insecureAvatarResponse = await request('/settings/avatar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      _csrf: avatarToken,
      profilePictureUrl: 'http://images.example.test/avatar.png',
    }),
  });
  assert.equal(insecureAvatarResponse.status, 400);

  const settingsUploadToken = csrfToken(await (await request('/settings')).text());
  const settingsUpload = new FormData();
  settingsUpload.set('_csrf', settingsUploadToken);
  settingsUpload.set('fullName', 'Updated User');
  settingsUpload.set('vehicleNickname', 'Green Machine');
  settingsUpload.set('avatar', new Blob([Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])], { type: 'image/gif' }), 'avatar.gif');
  const settingsUploadResponse = await request('/settings', { method: 'POST', body: settingsUpload });
  assert.equal(settingsUploadResponse.status, 302);
  const updatedAvatar = await userStore.getById(profile.id);
  assert.match(updatedAvatar.profilePictureUrl, /^\/uploads\/[a-f0-9-]+\.gif$/);
  uploadedPaths.push(updatedAvatar.profilePictureUrl);

  const settingsToken = csrfToken(await (await request('/settings')).text());
  const profileResponse = await request('/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      _csrf: settingsToken,
      fullName: 'Updated User',
      vehicleNickname: 'Green Machine',
    }),
  });
  assert.equal(profileResponse.status, 302);
  assert.equal((await userStore.getById(profile.id)).vehicleNickname, 'Green Machine');
  assert.match(await (await request('/dashboard')).text(), /Green Machine/);

  const duplicatePage = await request('/dashboard');
  const duplicateResponse = await request('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      _csrf: csrfToken(await duplicatePage.text()),
      fullName: 'Another User',
      email: 'test@example.com',
      password: 'StrongPass123',
      vehicleNickname: 'Other',
    }),
  });
  assert.equal(duplicateResponse.status, 409);

  const logoutToken = csrfToken(await (await request('/dashboard')).text());
  const logoutResponse = await request('/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: logoutToken }),
  });
  assert.equal(logoutResponse.status, 302);
  assert.equal(logoutResponse.headers.get('location'), '/dashboard');
  const afterLogout = await request('/dashboard');
  assert.equal(afterLogout.status, 200);
  assert.match(await afterLogout.text(), />Guest</);

  const signinPage = await request('/signup');
  const signinResponse = await request('/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      _csrf: csrfToken(await signinPage.text()),
      email: 'test@example.com',
      password: 'StrongPass123',
    }),
  });
  assert.equal(signinResponse.status, 302);
  assert.equal(signinResponse.headers.get('location'), '/dashboard');
  assert.equal((await request('/logout')).status, 404);
  const postLogoutToken = csrfToken(await (await request('/dashboard')).text());
  const postLogoutResponse = await request('/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: postLogoutToken }),
  });
  assert.equal(postLogoutResponse.status, 302);
  assert.equal(postLogoutResponse.headers.get('location'), '/dashboard');
});
