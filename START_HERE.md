# PRJ381 — automatic sensor and SolarCarAI integration

This is a complete, ready-to-configure copy of your Express/EJS project. The two main ZIPs you supplied are identical. The original dark theme, navigation, weather cards and vehicle panel are retained; the optimisation panel is added below them. Readings update every two seconds without a manual data-entry form.

**Start with section 1, then choose ONE connection method in section 3.** There is no need to run the old SolarCarAI desktop application on your PC.

## 1. Open and start the integrated project on Windows

1. Stop your current server with **Ctrl+C**. Keep a backup of your existing project.
2. Extract `PRJ381_Integrated.zip` into a new folder.
3. In VS Code, choose **File → Open Folder** and select the inner `PRJ381-integrated` folder containing `server.js`, `app.js` and `package.json`. Do not select its parent folder.
4. Open **Terminal → New Terminal**. Run these commands one at a time:

```powershell
node -v
npm install
Copy-Item .env.example .env
```

Your existing Node 24 installation is sufficient. The project requires Node 22.16 or newer. The supplied `package.json` has a working `start` script; `node server.js` works too. `npm ci` can replace `npm install` when using this ZIP's unchanged lockfile.

5. Before starting the server, edit `.env` and set `MONGODB_URI` to your
   MongoDB connection string. Also generate a unique `SESSION_SECRET` locally
   and place it in `.env`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`SESSION_SECRET` signs Express browser sessions. Keep it private and stable;
changing it signs out existing users. Generate it separately from the HTTP
sensor token described in section 3B. For production, it must be at least 32
bytes.

6. Start the server:

```powershell
npm start
```

7. Open **http://localhost:3000/dashboard**. You should initially see **Waiting for sensor**. This is correct: no readings are invented.
8. Stop with **Ctrl+C** before editing `.env`, and restart with `npm start` after changes. Only create `.env` once; do not overwrite it after filling in your configuration.

## 2. Apply two small sensor-side fixes

These files belong on the **Raspberry Pi**, inside your existing `PRJ381_Weather_Sensor-main` project, not in the Node server's `services` folder.

| Copy from this download | Paste into the existing sensor project | Action |
|---|---|---|
| `sensor_additions/main.py` | `main.py` | Replace after backing up the old file |
| `sensor_additions/gps_reader.py` | `sensors/gps_reader.py` | Replace after backing up the old file |

The new `main.py` preserves the sensor reads, CSV logging, MQTT publishing and LED flow. Its only functional change is recording an explicit UTC timestamp after collecting a sample. The GPS replacement validates fix status, preserves valid zero coordinates and limits the total GPS wait to the configured timeout. The original could wait about 100 seconds without a fix, which would delay weather updates.

Keep `config.py`, the hardware wiring settings, `utils`, and your sensor credentials in the sensor project. If your installed BME280 driver works, do not reinstall it. The original requirements file omitted its package; if you get `No module named adafruit_bme280`, install `adafruit-circuitpython-bme280` in the Python environment you already use for the station.

The Node website runs on Windows. The hardware station runs on the Raspberry Pi; GPIO/I2C modules do not run on a normal Windows PC.

## 3A. Existing AWS MQTT feed — use this if the station already publishes successfully

Data path: sensors → existing Python publisher → AWS `iwos/weather` topic → Node subscriber → optimisation → web page.

The station already contains this publishing code. No HTTP bridge is needed in MQTT mode.

1. Create a `certs` folder beside the Node project's `server.js`.
2. Have the AWS IoT project administrator provide a dashboard client certificate/key and Amazon root CA. The dashboard identity needs permission to connect with its client ID, subscribe to `iwos/weather`, and receive that topic's messages. A publish-only station policy is insufficient. Keep the dashboard client ID different from `iwos-lead-vehicle-01`; otherwise clients can disconnect each other.
3. Place those files in `certs` using these names (or change the paths below to their actual filenames). The `.env` settings contain paths to the files, not the PEM certificate or private-key contents. Keep the private key out of source control and do not send it to the browser.
4. Open `.env` in VS Code and set:

```dotenv
PORT=3000
HOST=127.0.0.1
SENSOR_SOURCE=mqtt
SENSOR_STALE_SECONDS=60
SENSOR_TIMEZONE_OFFSET=+02:00
MQTT_HOST=PASTE_THE_MQTT_BROKER_HOST_FROM_THE_SENSOR_CONFIG_PY
MQTT_PORT=8883
MQTT_TOPIC=iwos/weather
MQTT_CLIENT_ID=iwos-dashboard-01
MQTT_CA_PATH=certs/AmazonRootCA1.pem
MQTT_CERT_PATH=certs/dashboard-certificate.pem.crt
MQTT_KEY_PATH=certs/dashboard-private.pem.key
```

Use the hostname from the sensor project's `config.py`, without `https://`. Do not paste a literal placeholder hostname. All relative certificate paths resolve from the Node project folder.

5. On the Pi, in the sensor project folder, run:

```bash
python3 main.py
```

6. On Windows, in the integrated Node folder, run `npm start` and open the dashboard. Watch for **Feed: connected**, followed by **Live sensor data** when a new packet arrives. A broker connection alone does not mean a measurement has arrived.

The subscriber uses TLS and validates the server certificate. It reconnects automatically after a network interruption. The original sensor publisher also always calls `tls_set`, despite an unused `MQTT_USE_TLS=False` setting in its config.

Your uploaded sensor ZIP includes a private key. It is deliberately excluded from this integrated download. Ask the project administrator to replace that shared credential and issue a separate dashboard identity before distributing the project further.

For this workspace, the dashboard certificate files were copied from the
hardware publisher's `Hardware/certs` folder into the Git-ignored `certs`
folder. This avoids changing the hardware files. The dashboard uses a
different MQTT client ID, so the AWS IoT policy attached to this shared
certificate must explicitly permit that client ID to connect and subscribe.
Sharing the hardware identity is suitable only for a controlled test; create
a dedicated dashboard certificate before production use.

## 3B. Same-network CSV bridge — no AWS subscriber setup needed

Data path: sensors → real `data/weather_log.csv` → automatic Python bridge → Node API → optimisation → web page.

Use this if the sensor's CSV is updating and you want to connect your PC directly. The bridge reads the file while the station writes it. Merely opening a historical CSV or copying it once to Windows does not produce live data.

### On your Windows PC

1. Generate a dedicated sensor API token in the VS Code terminal:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

2. Copy the resulting token into `SENSOR_API_TOKEN` in the server's `.env`:

```dotenv
PORT=3000
HOST=0.0.0.0
SENSOR_SOURCE=http
SENSOR_API_TOKEN=PASTE_YOUR_GENERATED_TOKEN_HERE
SENSOR_STALE_SECONDS=60
SENSOR_TIMEZONE_OFFSET=+02:00
```

`SENSOR_API_TOKEN` is a locally generated shared credential for HTTP sensor
ingestion. It is different from `SESSION_SECRET`: the session secret stays on
the server, while the sensor token must be configured on both the server and
the Raspberry Pi bridge. The token is not issued by MongoDB or another service.
Never reuse the session secret as the sensor token.

3. Run `ipconfig` in the Windows terminal. Find the IPv4 address for the Wi-Fi/Ethernet adapter connected to the same network as the Pi, for example `192.168.1.25`.
4. Run `npm start`. If Windows asks about Node network access, allow it on your private network. The bridge must be able to reach TCP port 3000. Use this HTTP mode on a trusted local network; use TLS MQTT for cloud connections. Do not port-forward this development dashboard to the internet.

### On the Raspberry Pi

1. Copy `sensor_additions/dashboard_bridge.py` from this download into the root of your existing sensor project, beside its `main.py`.
2. In a Pi terminal, go to that sensor project folder. Set the PC address and the same generated token:

```bash
export DASHBOARD_URL='http://192.168.1.25:3000'
export SENSOR_API_TOKEN='PASTE_THE_SAME_GENERATED_TOKEN_HERE'
export WEATHER_CSV_PATH='data/weather_log.csv'
python3 dashboard_bridge.py
```

Replace the example address with **your PC's IPv4 address**. Do not use `localhost` here: on the Pi that refers to the Pi, not your PC. These exports apply to this terminal session. The bridge needs only Python's standard library.

The Pi's `SENSOR_API_TOKEN` must exactly match the value in the Windows
server's `.env`. If the token changes, update both places and restart the
server and bridge. Do not put live secrets in source control or documentation.

3. Leave the bridge running. In a **second Pi terminal**, inside the same sensor project folder, start the existing station:

```bash
python3 main.py
```

If the station is already running, leave that instance running; do not start a second copy that competes for sensor hardware.

4. Open the website on Windows. The next newly written sensor row should appear automatically. The bridge skips existing rows on startup, waits for complete CSV lines, retries a lost connection, and sends the newest reading rather than replaying a stale backlog.

The original station still initialises its MQTT publisher. Keep its original functioning credentials/configuration even when using the CSV bridge. The bridge does not require AWS, but it cannot repair a sensor collector that fails before writing CSV rows.

## 4. What you will actually see

| Input or output | With the supplied weather sensors |
|---|---|
| Temperature, humidity, pressure, altitude | Automatic measured values |
| Wind | Automatic; m/s is converted to km/h by multiplying by 3.6 |
| GPS | Actual coordinates/relative trace when a valid fix exists; otherwise unavailable |
| Air temperature and wind trend estimates | After 3 distinct valid readings spanning at least 20 seconds |
| Irradiance and rainfall | Unavailable: these sensors are not in your project |
| Battery percentage, vehicle speed, distance | Unavailable: the supplied station does not publish these |
| Full speed target, efficiency rule score, battery/energy mode | Activated only when their required real inputs arrive |
| Input coverage | Availability of 7 optimisation inputs; not model confidence |
| Sync & Logs | Received/rejected/duplicate counts and recent real packets |

The supplied weather station gives 3 of the 7 core optimisation inputs (temperature, humidity, wind), so a normal weather-only connection shows **43% input coverage** and **Weather analysis active**. Pressure and GPS are displayed but do not replace missing battery or solar measurements.

The sample CSV has historical readings, including missing GPS coordinates. They have not been retimestamped or presented as live measurements. The app contains no random speed changes, hardcoded 87% battery, or automatic external weather substitution.

After 60 seconds without a fresh measurement, analysis pauses. Last measured weather values remain visible and clearly marked stale. Vehicle telemetry has its own freshness check. Browser connection failure also clears recommendation and prediction outputs.

## 5. Exact files to copy if you want to keep your existing folder

Using the complete downloaded project is simplest. To merge into your existing working project instead, stop the server, make a backup, and use the **whole contents** of each file from this download. Do not append new code underneath old code.

Paths below are relative to the real Node project root — the folder containing `server.js` and `package.json`, not the outer ZIP extraction folder.

| Path in the download → same path in your Node project | Action | Responsibility |
|---|---|---|
| `server.js` | Replace | Startup, environment loading, source connection |
| `package.json`, `package-lock.json` | Replace together | Start/test scripts and MQTT dependency |
| `pages/Dashboard.ejs` | Replace | Original layout connected to measured data |
| `pages/Sync&Sessions.ejs` | Replace | Real received-data log; removes sample sessions |
| `partials/header.ejs`, `partials/footer.ejs` | Replace | Existing navigation and live status |
| `app.js` | Create | Express application wiring |
| `config/index.js` | Create folder/file | Configuration only |
| `services/normaliseTelemetry.js` | Create folder/file | Sensor schema, ranges and timestamps |
| `services/telemetryStore.js` | Create | Latest readings, freshness, bounded history |
| `services/optimizer.js` | Create | Ported SolarCarAI rules and trend estimates |
| `services/mqttSubscriber.js` | Create | MQTT connection and message ingestion |
| `routers/apiRouter.js` | Create | Status API and protected ingestion endpoints |
| `partials/optimization.ejs` | Create | Optimisation panel markup |
| `public/integration.css` | Create | Styles for added panels only |
| `public/telemetry.js` | Create | Polling, UI rendering, GPS trace |
| `.env.example` | Create, then copy to `.env` | Your connection settings |
| `tests/` | Copy folder | Repeatable integration tests |
| `docs/`, `START_HERE.md` | Copy | Data contract and setup documentation |
| `.gitignore` | Merge additions | Ignore `.env`, `certs/`, Python caches |

Keep `public/css.css`, `public/js.js`, and `routers/telemetryRouter.js` unchanged. The existing routes remain `/dashboard` and `/sync-sessions`; the optimisation navigation link opens `/dashboard#optimization`.

Then run `npm install` once, configure `.env`, and run `npm start`.

**Do not copy the Tkinter `ui/` directory into the website.** The actual original algorithm is `SolarCarAI_v2/ai_optimizer.py`; the original `ai/optimizer.py` and `ai/predictor.py` are empty. Its calculations are now in the dedicated JavaScript service, keeping Python hardware code separate from the Node website.

## 6. Common problems

| Symptom | What to check |
|---|---|
| `Missing script: start` | Run `dir`; make sure this folder contains the downloaded `package.json` and `server.js` |
| `EADDRINUSE` / port in use | Stop the old Node terminal with Ctrl+C; or change PORT |
| Waiting for sensor | Website is running, but no new valid measurement has arrived |
| MQTT configuration error | Real hostname and certificate paths must be set; key/cert files are not included |
| MQTT connected but no readings | Correct topic, publisher running, Receive/Subscribe permissions, and unique client IDs |
| HTTP 401 from bridge | Token differs between the Pi and Windows `.env` |
| HTTP 409 from bridge | Node is in MQTT mode, or a reading is older than the accepted reading |
| HTTP 422 / clock ahead | Check Pi and PC clocks; verify timestamp format and timezone |
| Bridge cannot connect | PC IPv4 address, shared private network, HOST=0.0.0.0, Windows firewall |
| No updates from an old CSV | Expected; the bridge only forwards new rows appended while it runs |
| GPS is unavailable | No valid hardware fix; weather analysis can still run |
| Battery, solar or full optimisation is unavailable | Those real input feeds have not been connected; see the data contract |

If you retain the original sensor `main.py`, its timestamp has no timezone. `SENSOR_TIMEZONE_OFFSET` must match the **Pi's clock**, not necessarily the PC's location. Check `date +%:z` on the Pi: use `+00:00` for UTC or `+02:00` for South Africa. The supplied UTC timestamp fix avoids this ambiguity.

## 7. Verification and limitations

Run `npm test` on Windows for the Node tests. With Python installed, run `python -m unittest discover -s tests -p 'test_*.py'` for the CSV bridge/sensor adapter tests.

The tests cover valid/invalid packets, missing inputs, zero values, wind units, timezone conversion, duplicate/order handling, stale sensor and vehicle data, bounded history, trend windows, authenticated HTTP ingestion, page rendering and rule parity against 256 reference cases computed by your original Python optimizer.

This is prototype decision support. Its fixed speed/efficiency rules are not a trained or calibrated vehicle model. It does not control a car, and its trend extrapolations are not meteorological forecasts. The old numerical “AI confidence” has been replaced by honest input coverage. Real battery, solar and rain feeds are needed for full analysis; pressure and humidity cannot substitute for them.

The Node server stores up to 120 readings in memory; a restart resets this history. The station's existing CSV remains the durable log. This is a single-station application with no user login or database. The read-only status endpoint exposes readings to users who can reach the server.

Your physical Raspberry Pi sensors, AWS account permissions and Windows firewall cannot be verified from this workspace. See `docs/VERIFICATION.md` for what was checked here.
