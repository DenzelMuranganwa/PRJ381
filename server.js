const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { MongoClient } = require('mongodb');
const { loadConfig } = require('./config');
const { TelemetryStore } = require('./services/telemetryStore');
const { UserStore } = require('./services/userStore');
const { createApp } = require('./app');
const { startMqtt } = require('./services/mqttSubscriber');

function listen(app, config) {
  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    const onError = error => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      const address = server.address();
      if (!address) {
        server.close();
        reject(new Error('HTTP server reported listening without a bound address.'));
        return;
      }
      resolve({ server, address });
    };

    server.once('error', onError);
    server.once('listening', onListening);

    server.listen(config.port, config.host);
  });
}

async function main() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  }

  const config = loadConfig();
  if (!config.mongodbUri) throw new Error('MONGODB_URI must be configured before starting the server.');
  const client = new MongoClient(config.mongodbUri);
  const store = new TelemetryStore(config);
  let listening;
  try {
    await client.connect();
    const databaseName = 'iwos_database';
    const database = client.db(databaseName);
    const usersCollection = database.collection('users');
    const syncSessionsCollection = database.collection('sync_sessions');
    await Promise.all([
      usersCollection.createIndex({ email: 1 }, { unique: true, name: 'uniq_users_email' }),
      syncSessionsCollection.createIndex({ sessionId: 1 }, { unique: true, name: 'uniq_sync_session_id' }),
    ]);
    const userStore = new UserStore(usersCollection);
    listening = await listen(createApp(config, store, userStore, {
      mongoClient: client,
      databaseName,
      syncSessionsCollection,
    }), {
      ...config,
      host: process.env.HOST || '0.0.0.0',
    });
  } catch (error) {
    try {
      await client.close();
    } catch (closeError) {
      console.error(`MongoDB cleanup failed: ${closeError.message}`);
    }
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use. Stop the other server or change PORT in .env.`);
    } else {
      console.error(`Server could not start: ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const stopMqtt = config.source === 'mqtt' ? startMqtt(config, store) : () => {};
  const { server, address } = listening;
  const boundPort = typeof address === 'object' ? address.port : (process.env.PORT || config.port);
  console.log(`IWOS Field is running at http://localhost:${boundPort}`);
  console.log(`Weather source: ${config.source}. Waiting for real sensor readings.`);
  if (config.source === 'http' && !config.token) {
    console.log('Set SENSOR_API_TOKEN in .env to enable sensor ingestion.');
  }

  function shutdown() {
    stopMqtt();
    server.close(() => client.close().catch(error => {
      console.error(`MongoDB shutdown failed: ${error.message}`);
      process.exitCode = 1;
    }));
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Server could not start: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { listen };