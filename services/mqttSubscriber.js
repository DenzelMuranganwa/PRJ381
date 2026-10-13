'use strict';
const fs = require('node:fs');
const path = require('node:path');
const mqtt = require('mqtt');

function startMqtt(config, store) {
  const settings = config.mqtt;
  try {
    if (!settings.host || !settings.caPath || !settings.certPath || !settings.keyPath) throw new Error('Incomplete MQTT configuration');
    const read = name => fs.readFileSync(path.resolve(config.root, name));
    const client = mqtt.connect({
      protocol: 'mqtts', host: settings.host, port: settings.port, clientId: settings.clientId,
      ca: read(settings.caPath), cert: read(settings.certPath), key: read(settings.keyPath),
      rejectUnauthorized: true, clean: true, reconnectPeriod: 5000, connectTimeout: 10000, protocolVersion: 4,
    });
    const state = (value, message = null) => { store.transport = { state: value, message }; };
    client.on('connect', () => {
      state('subscribing');
      client.subscribe(settings.topic, { qos: 1 }, (error, granted) => {
        if (error || !granted?.length || granted.some(item => item.qos === 128)) {
          state('error', 'MQTT subscription refused. Check the dashboard certificate policy.'); return;
        }
        state('connected');
      });
    });
    client.on('message', (topic, payload) => {
      if (topic !== settings.topic) return;
      try {
        if (payload.length > 8192) throw new Error('Oversized packet');
        store.ingest(JSON.parse(payload.toString('utf8')), 'weather', 'mqtt');
      } catch (error) {
        if (!error.status) store.stats.rejected += 1;
        console.warn('Weather packet rejected:', error.status ? error.message : 'Invalid JSON or oversized packet');
      }
    });
    client.on('reconnect', () => state('reconnecting'));
    client.on('offline', () => state('offline'));
    client.on('error', () => state('error', 'MQTT connection failed. Check host, certificates and network.'));
    return () => client.end(true);
  } catch {
    store.transport = { state: 'configuration-error', message: 'MQTT setup incomplete. Check .env and certificate paths.' };
    console.warn(store.transport.message);
    return () => {};
  }
}
module.exports = { startMqtt };
