'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { loadConfig } = require('../config');
const { TelemetryStore } = require('../services/telemetryStore');
const { optimize, speedTarget, batteryMode, efficiencyScore, energyStatus } = require('../services/optimizer');
const { createApp } = require('../app');
const { normalise, WEATHER_FIELDS } = require('../services/normaliseTelemetry');
const config = loadConfig({ SENSOR_API_TOKEN:'test-only-token' });
const base = Date.parse('2026-09-23T12:00:00Z');
const reading = (time=base, extra={}) => ({ timestamp:new Date(time).toISOString(),temperature_c:25,humidity_pct:50,pressure_hpa:900,altitude_m:1000,wind_speed_ms:10,latitude:null,longitude:null,...extra });

test('no fake readings or recommendations at startup', () => {
  const store=new TelemetryStore(config,()=>base), a=optimize(store.snapshot());
  assert.equal(a.status,'waiting');assert.equal(a.recommendedSpeed,null);assert.equal(store.history.length,0);
});
test('actual station fields yield partial analysis and convert m/s to km/h', () => {
  const store=new TelemetryStore(config,()=>base);store.ingest(reading());
  const a=optimize(store.snapshot());assert.equal(a.status,'partial');assert.equal(a.inputCoverage,43);
  assert.deepEqual(a.missing,['irradiance','rain','battery','speed']);assert.equal(a.recommendedSpeed,null);
  assert.ok(a.observations.some(s=>s.includes('High measured wind')));assert.equal(a.forecasts.irradiance.value,null);
});
test('nulls are missing; numeric zero and zero-coordinate GPS are valid', () => {
  const store=new TelemetryStore(config,()=>base);
  store.ingest(reading(base,{wind_speed_ms:0,temperature_c:0,latitude:0,longitude:0}));
  assert.equal(store.weather.values.latitude,0);assert.equal(store.weather.values.wind_speed_ms,0);
  assert.equal(optimize(store.snapshot()).missing.includes('temperature'),false);
  store.ingest(reading(base+1,{temperature_c:null,latitude:1,longitude:null}));
  assert.equal(store.weather.values.latitude,null);assert.ok(optimize(store.snapshot()).missing.includes('temperature'));
});
test('validation rejects bad types, ranges, future times and empty packets', () => {
  const store=new TelemetryStore(config,()=>base);
  for(const packet of [reading(base,{humidity_pct:101}),reading(base,{temperature_c:'25'}),reading(base,{wind_speed_ms:-1}),reading(base+6000),[],{},reading(base,{wind_speed_ms:Infinity})]) assert.throws(()=>store.ingest(packet));
  assert.equal(store.history.length,0);
});
test('timezone-less original timestamp uses configured offset, explicit UTC remains UTC', () => {
  const a=normalise({...reading(),timestamp:'2026-09-23T14:00:00.000123'},WEATHER_FIELDS,{now:base,timezoneOffset:'+02:00'});
  assert.equal(a.observedAt,base);assert.equal(a.timezoneAssumed,true);
  assert.equal(normalise(reading(),WEATHER_FIELDS,{now:base}).timezoneAssumed,false);
});
test('duplicate and out-of-order packets do not grow history or refresh sample age', () => {
  let now=base;const store=new TelemetryStore(config,()=>now);store.ingest(reading());
  const received=store.weather.receivedAt;now+=30000;
  assert.equal(store.ingest(reading()).duplicate,true);assert.equal(store.history.length,1);
  assert.equal(store.weather.receivedAt,received);assert.throws(()=>store.ingest(reading(base-1000)));
});
test('stale data pauses outputs and recovery resets trend window', () => {
  let now=base;const store=new TelemetryStore(config,()=>now);store.ingest(reading());now+=61000;
  assert.equal(optimize(store.snapshot()).status,'stale');assert.deepEqual(optimize(store.snapshot()).forecasts,{});
  store.ingest(reading(now));assert.equal(store.history.length,1);assert.equal(store.snapshot().state,'live');
});
test('forecast needs distinct timestamps and respects elapsed time and missing fields', () => {
  let now=base;const store=new TelemetryStore(config,()=>now);
  for(let i=0;i<3;i++){now=base+i*10000;store.ingest(reading(now,{temperature_c:20+i*0.1}));}
  let a=optimize(store.snapshot());assert.equal(a.forecasts.temperature.value,23.2);assert.equal(a.forecasts.wind.value,36);
  for(let i=0;i<10;i++)optimize(store.snapshot());assert.equal(store.history.length,3);
  now+=10000;store.ingest(reading(now,{temperature_c:null}));a=optimize(store.snapshot());assert.equal(a.forecasts.temperature.value,null);
});
test('complete measured inputs enable original rules and stale vehicle inputs disable them', () => {
  let now=base;const store=new TelemetryStore(config,()=>now);
  store.ingest({timestamp:new Date(now).toISOString(),battery_pct:87,speed_kmh:92},'vehicle');
  store.ingest(reading(now,{wind_speed_ms:5,irradiance_wm2:1000,rainfall_mmh:0}));
  let a=optimize(store.snapshot());assert.equal(a.status,'ready');assert.equal(a.recommendedSpeed,101);assert.equal(a.efficiencyScore,100);
  now+=61000;store.ingest(reading(now,{irradiance_wm2:1000,rainfall_mmh:0}));a=optimize(store.snapshot());assert.equal(a.recommendedSpeed,null);assert.equal(a.batteryMode,null);
});
test('history is bounded and historical measurements stay stale', () => {
  let now=base;const store=new TelemetryStore(config,()=>now);
  for(let i=0;i<130;i++){now=base+i*1000;store.ingest(reading(now));}assert.equal(store.history.length,120);
  const old=new TelemetryStore(config,()=>base);old.ingest(reading(base-86400000));assert.equal(old.snapshot().state,'stale');
});
test('original Python rule outputs agree with the native port', () => {
  for(const c of require('./optimizer-reference.json')){
    assert.equal(speedTarget(c.input),c.speed);assert.equal(efficiencyScore(c.input,c.speed),c.efficiency);
    assert.equal(batteryMode(c.input.battery,c.input.irradiance),c.batteryMode);assert.equal(energyStatus(c.input.irradiance,c.input.battery),c.energyStatus);
  }
});
test('HTTP ingestion, authentication, page rendering, limits and malformed JSON', async t => {
  const store=new TelemetryStore(config,()=>base), server=createApp(config,store).listen(0,'127.0.0.1');
  await once(server,'listening');t.after(()=>server.close());const url=`http://127.0.0.1:${server.address().port}`;
  const post=(body,token=config.token)=>fetch(url+'/api/telemetry/weather',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:typeof body==='string'?body:JSON.stringify(body)});
  assert.equal((await post(reading(),'bad')).status,401);assert.equal(store.history.length,0);
  assert.equal((await post('{')).status,400);assert.equal((await post({payload:'x'.repeat(9000)})).status,413);
  assert.equal((await post(reading())).status,200);
  const data=await (await fetch(url+'/api/status')).json();assert.equal(data.analysis.status,'partial');assert.equal(data.history.length,1);
  const guestDashboard=await fetch(url+'/dashboard');
  assert.equal(guestDashboard.status,200);
  const guestHtml=await guestDashboard.text();
  assert.match(guestHtml,/>Guest</);
  assert.match(guestHtml,/TELEMETRY FEED/);
  assert.doesNotMatch(guestHtml,/data-value="(?:irradiance|rainfall)"/);
  assert.match(guestHtml, /href="\/dashboard#optimization-section"/);
  assert.equal((await fetch(url+'/',{redirect:'manual'})).headers.get('location'),'/dashboard');
  for(const route of ['/sync-sessions','/route-setup']) {
    const response=await fetch(url+route,{redirect:'manual'});
    assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/signin');
  }
  for(const route of ['/telemetry.js','/session-sync.js','/integration.css']) assert.equal((await fetch(url+route)).status,200);
});

test('browser simulation feed uses the telemetry store and enables complete optimization', async t => {
  const store = new TelemetryStore(config);
  const server = createApp(config, store).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const dashboard = await fetch(`${url}/dashboard`);
  const html = await dashboard.text();
  const csrf = html.match(/data-csrf-token="([^"]+)"/)?.[1];
  const cookie = dashboard.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(csrf);
  assert.ok(cookie);
  assert.match(html, /Starting automatic simulated feed/);
  assert.doesNotMatch(html, /id="simulation-feed-toggle"/);
  assert.match(html, /Set \/ Change Route/);
  assert.match(html, /id="beginSimulationBtn"/);
  assert.match(html, /Begin Simulation/);

  const simulationResponse = await fetch(`${url}/api/simulation/telemetry`, {
    method: 'POST',
    headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      latitude: -25.751,
      longitude: 28.231,
      speed_kmh: 32.5,
      distance_today_km: 0.012,
    }),
  });
  assert.equal(simulationResponse.status, 200);
  const statusResponse = await fetch(`${url}/api/status`, { headers: { Cookie: cookie } });
  const status = await statusResponse.json();
  assert.equal(status.weather.source, 'simulation');
  assert.equal(status.vehicle.source, 'simulation');
  assert.equal(status.weather.values.latitude, -25.751);
  assert.equal(status.weather.values.longitude, 28.231);
  assert.equal(status.vehicle.values.speed_kmh, 32.5);
  assert.equal(status.vehicle.values.distance_today_km, 0.012);
  assert.equal(status.analysis.status, 'ready');
  assert.equal(status.analysis.inputCoverage, 100);

  const invalidGpsResponse = await fetch(`${url}/api/simulation/telemetry`, {
    method: 'POST',
    headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: 91, longitude: 28 }),
  });
  assert.equal(invalidGpsResponse.status, 400);
});

test('simulation feed requires CSRF protection and cannot replace real or production telemetry', async t => {
  const store = new TelemetryStore(config);
  store.ingest(reading(Date.now(), { irradiance_wm2: 900, rainfall_mmh: 0 }));
  const server = createApp(config, store).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const dashboard = await fetch(`${url}/dashboard`);
  const html = await dashboard.text();
  const csrf = html.match(/data-csrf-token="([^"]+)"/)?.[1];
  const cookie = dashboard.headers.get('set-cookie')?.split(';', 1)[0];

  const missingToken = await fetch(`${url}/api/simulation/telemetry`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(missingToken.status, 403);
  const protectedResponse = await fetch(`${url}/api/simulation/telemetry`, {
    method: 'POST',
    headers: { Cookie: cookie, 'X-CSRF-Token': csrf },
  });
  assert.equal(protectedResponse.status, 409);
  assert.equal(store.weather.source, 'http');

  const productionConfig = loadConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'production-test-session-secret-32-bytes',
    SENSOR_API_TOKEN: 'test-only-token',
    ENABLE_TELEMETRY_SIMULATION: 'true',
  });
  const productionServer = createApp(productionConfig, new TelemetryStore(productionConfig))
    .listen(0, '127.0.0.1');
  await once(productionServer, 'listening');
  t.after(() => productionServer.close());
  const productionUrl = `http://127.0.0.1:${productionServer.address().port}`;
  const productionDashboard = await fetch(`${productionUrl}/dashboard`);
  const productionHtml = await productionDashboard.text();
  const productionToken = productionHtml.match(/data-csrf-token="([^"]+)"/)?.[1];
  const productionCookie = productionDashboard.headers.get('set-cookie')?.split(';', 1)[0];
  assert.doesNotMatch(productionHtml, /Starting automatic simulated feed/);
  const disabledResponse = await fetch(`${productionUrl}/api/simulation/telemetry`, {
    method: 'POST',
    headers: { Cookie: productionCookie, 'X-CSRF-Token': productionToken },
  });
  assert.equal(disabledResponse.status, 404);
});

test('complete aligned history enables efficiency and performance forecasts; stale vehicle pauses them', () => {
  let now=base;const store=new TelemetryStore(config,()=>now);
  for(let i=0;i<3;i++){
    now=base+i*10000;
    store.ingest({timestamp:new Date(now-1000).toISOString(),battery_pct:87,speed_kmh:92},'vehicle');
    store.ingest(reading(now,{wind_speed_ms:5,irradiance_wm2:1000,rainfall_mmh:0}));
  }
  let a=optimize(store.snapshot());assert.equal(a.forecasts.efficiency.value,100);assert.equal(a.performance,'Excellent performance expected');
  now=base+79500; // Weather age 59.5 seconds; vehicle age 60.5 seconds.
  a=optimize(store.snapshot());assert.equal(store.snapshot().state,'live');assert.equal(a.forecasts.efficiency.value,null);assert.equal(a.performance,null);
});
