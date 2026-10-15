# Verification record — 23 September 2026

## Passed in the development workspace

- Node 24.19.0: `npm install` completed and the lockfile was regenerated with MQTT.js.
- `npm test`: **13 tests passed**, including HTTP integration and rendered EJS routes.
- Python standard-library unittest: **7 tests passed** for incremental CSV delivery, incomplete rows, rotation, null/non-finite handling, GPS fix validity/zero coordinates, bounded GPS waits and explicit UTC timestamps.
- **256 deterministic reference cases** generated directly from the uploaded `SolarCarAI_v2/ai_optimizer.py` agree with the JavaScript speed, efficiency score, battery-mode and energy-status functions. These are rule-parity checks, not validation of vehicle performance.
- Local TLS MQTT test: connected with test-only certificates, subscribed to `iwos/weather`, received JSON and automatically populated the store. This used a local protocol test server; no connection to the user's AWS account was attempted.
- End-to-end CSV test: appended a test row to a temporary CSV, read it using the actual bridge, authenticated to the Node API, and verified the analysis response.
- Chromium browser: initial waiting screen, automatic partial-data updates, wind conversion (2 m/s → 7.2 km/h), three-sample trend, drawer navigation, real received-packet log and loss-of-server handling.
- Desktop 1440×1000 and mobile 390×844 screenshots visually inspected. No horizontal page overflow on the phone layout. Map caption and compact metric formatting corrected after review.
- The original `public/css.css`, `public/js.js`, and `routers/telemetryRouter.js` are preserved byte-for-byte.

Test packets, timestamps, certificates and screenshots were used only in the QA workspace. They are not part of the runtime feed. The non-production dashboard can generate synthetic readings for testing; production requires an actual configured source.

## Not verified on physical equipment

- Raspberry Pi GPIO/I2C/UART access, actual BME280/anemometer calibration, GPS antenna reception or clock synchronisation.
- User's AWS credentials, IoT policies and live sensor messages.
- User's Windows firewall/private-network connectivity.
- Calibrated solar-car efficiency, safe or optimal driving speed, battery predictions or forecast accuracy.

The integration is configured for one station. Restarting Node clears its in-memory history. Existing station CSV logging remains the persistent record. Follow START_HERE.md for the equipment connection steps and DATA_CONTRACT.md for adding future real measurement feeds.
