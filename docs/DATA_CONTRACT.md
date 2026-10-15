# Integration architecture and data contract

## Responsibilities

- `server.js`: process startup/shutdown; `.env`; chooses HTTP or MQTT.
- `app.js`: Express wiring. Importable without starting hardware/network connections.
- `services/mqttSubscriber.js`: TLS MQTT only; does not calculate recommendations.
- `services/normaliseTelemetry.js`: schema and bounds; does not render UI.
- `services/telemetryStore.js`: one station's newest weather and vehicle packets; independent freshness; 120 weather observations maximum.
- `services/optimizer.js`: pure calculations; no HTTP, DOM, MQTT or Python imports.
- `routers/apiRouter.js`: transport contract and ingestion authentication.
- `partials/optimization.ejs`: markup; `public/integration.css`: added styles; `public/telemetry.js`: rendering/polling.
- `sensor_additions/`: Python hardware-side patches and optional CSV transport. Never imported by Node.

The original `public/css.css` and `public/js.js` remain unchanged. In non-production, the dashboard starts a simulated feed that generates synthetic telemetry. The former Sync & Sessions sample rows are replaced by actual in-memory sensor observations; no driver sessions or network throughput are fabricated.

## Weather packet

MQTT: JSON published to the exact topic `iwos/weather` (configurable).
HTTP mode: `POST /api/telemetry/weather`, Content-Type `application/json`, Authorization `Bearer <SENSOR_API_TOKEN>`.

| Field | Unit / format | Source | Validated bounds |
|---|---|---|---|
| timestamp | ISO date/time, preferably with Z or UTC offset | Pi clock | Required; no more than 5 seconds into the future |
| temperature_c | °C | BME280 | -80 to 85 |
| humidity_pct | % | BME280 | 0 to 100 |
| pressure_hpa | hPa | BME280 | 300 to 1100 |
| altitude_m | m, barometric estimate | BME280 | -1000 to 20000 |
| wind_speed_ms | m/s | Anemometer | 0 to 100 |
| latitude | decimal degrees | GPS | -90 to 90 |
| longitude | decimal degrees | GPS | -180 to 180 |
| irradiance_wm2 | W/m² | Future measured solar feed | 0 to 2000 |
| rainfall_mmh | mm/h | Future measured rain-rate feed | 0 to 500 |

Values must be JSON numbers or null. Missing optional fields become null; strings, booleans, NaN, infinity and out-of-range values are rejected. Unknown properties are ignored. At least one recognised measurement is required. GPS is available only when both coordinates exist; numeric zero remains valid.

Each weather packet is a complete observation: missing fields do not silently carry forward from a previous packet. Feed one physical station per app instance. Do not mix stations on the same topic. If additional solar/rain sensors are added, merge those measured readings into the station's coherent weather packet. For CSV mode, also extend the logger's CSV header and rows with `irradiance_wm2` and `rainfall_mmh`; the bridge already recognises those names. A cumulative rain depth in millimetres is not a rain rate and must not be supplied as mm/h without a valid interval conversion.

The source station's timezone-less timestamps are interpreted using `SENSOR_TIMEZONE_OFFSET` and flagged in the UI. The provided `main.py` patch sends UTC explicitly. Historical packets retain their original observation times: they can be displayed as stale but cannot activate analysis. Duplicate timestamps are ignored and older-than-latest packets rejected. Re-publishing an old packet does not make it fresh.

Wind conversion happens once when preparing UI and rule inputs: `wind_speed_ms * 3.6`. Wind direction is not measured; it is not assumed to be headwind.

## Vehicle packet: extension for an actual vehicle feed

`POST /api/telemetry/vehicle` is available in both source modes with the same bearer token and JSON content type.

| Field | Meaning | Bounds |
|---|---|---|
| timestamp | Actual measurement time | Same ISO/future rules as weather |
| speed_kmh | Measured vehicle speed | 0 to 250 |
| battery_pct | Measured BMS state of charge | 0 to 100 |
| distance_today_km | Optional measured daily distance | 0 to 10000 |

Connect a real BMS/GPS/CAN adapter to this endpoint to supply these fields automatically. No such adapter or measurement exists in the submitted projects, so this integration does not invent one. Position alone is not converted into a vehicle speed without a validated sampling/filtering design.

Vehicle packets are independently fresh for the configured interval. A new vehicle packet replaces the whole vehicle observation; omitted fields become null. For efficiency history, each weather packet captures the most recent non-future vehicle observation within that freshness window; old history is never filled using today's vehicle values. Send the vehicle packet before its corresponding weather packet to populate aligned efficiency history.

## Read API and errors

`GET /api/status` returns a consistent snapshot: weather, vehicle, observed/received times, connection state, counters, bounded history and analysis. It has `Cache-Control: no-store`. It is read-only and has no authentication; keep the development server on your computer/private network.

In non-production environments, the dashboard starts a synthetic feed by default. It submits generated weather and vehicle samples through the same store and analysis path. Route playback is separate: after starting a route, choose **Begin Simulation** on the dashboard to move the simulated GPS along it. Simulated speed accelerates from rest and varies over the route; `distance_today_km` is the accumulated simulated travel distance, not a fixed per-sample increment. With no route playback, simulated speed and distance are zero. Until then, the feed continues at the route start. The request requires the dashboard session's CSRF token, is rate-limited, and refuses to overwrite readings from a live sensor. Production always disables this endpoint. New samples stop when the dashboard is closed or left; existing samples remain visible and become stale normally.

The browser polls every 2 seconds with a 5-second request timeout and no overlapping requests. Sensor acquisition remains at the station's original interval (normally 10 seconds); browser refreshes do not add forecast samples.

Responses to ingestion: 200 accepted or duplicate; 401 bad token; 409 wrong source or out-of-order observation; 413 over 8 KB; 415 wrong content type; 422 invalid telemetry; 503 missing server token. Bad JSON is 400. Invalid payloads never overwrite a valid latest reading. MQTT performs the same data validation and skips malformed packets without stopping the subscriber.

## Original algorithm and deliberate changes

The implemented rule source is `SolarCarAI_v2/ai_optimizer.py`; the similarly named files inside its `ai/` directory are empty. Core speed target, battery mode, efficiency score and energy-status rules are ported to JavaScript and checked against 256 deterministic Python reference cases.

- Missing measurements are not coerced to zero.
- The original Open-Meteo fetch, Pretoria default coordinates, random vehicle-speed updates, initial 87% battery and 142.8 km distance are removed from the data path.
- Full outputs require their actual dependencies. Weather-only observations and temperature/wind trends work independently.
- The old heuristic confidence percentage is replaced by input availability coverage. Neither is a statistically calibrated probability.
- Efficiency is labelled a rule score out of 100, not measured conversion efficiency.
- Trends follow the original first-to-last rate extrapolation over up to 12 readings and a 5-minute horizon. They now need 3 distinct valid observations over at least 20 seconds, stop across missing samples, and reset after a sampling gap longer than the freshness threshold.
- Weather forecasts use the input validation envelope rather than the original narrow display limits; these are not calibrated predictions. No pressure/GPS-to-battery or humidity-to-rain inference is made.
- Predicted efficiency uses aligned measured vehicle/weather samples and retains the original two-point rain penalty. Performance text is withheld until all required predictions exist.
- Sensor/vehicle freshness is independent; stale weather pauses all analysis. There are no vehicle actuators or control commands.

## Development references

Implementation API references: [MQTT.js maintained documentation](https://github.com/mqttjs/MQTT.js) and [Node environment-variable APIs](https://nodejs.org/api/process.html#processloadenvfilepath). The project-specific schema and decision rules come from the uploaded source files, not third-party weather data.
