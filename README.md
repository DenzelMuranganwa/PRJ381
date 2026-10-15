# IWOS Field — Telemetry Dashboard

IWOS Field is a Node.js, Express, and EJS dashboard for viewing vehicle and
weather telemetry. It supports the configured HTTP sensor bridge or MQTT feed
and provides a guest-first dashboard with optional driver accounts.

## Data and persistence architecture

The application handles account data and sensor telemetry separately:

- **Accounts and login:** In the production server, MongoDB stores user
  profiles, including bcrypt password hashes, so registered users can sign in
  again after a restart. Plain-text passwords are never stored. MongoDB also
  stores Express browser sessions and guest/driver synchronization records.
  The in-memory `UserStore` is only an option for isolated tests; it is not
  used by the production `server.js` startup.
- **Live sensor telemetry:** Telemetry means the weather or vehicle readings
  sent by the sensor feed. The dashboard receives those readings from its
  configured HTTP or MQTT source and keeps the latest readings and bounded
  analysis history in `TelemetryStore` process memory. The dashboard does not
  query MongoDB for telemetry records. Those in-memory readings are lost when
  the Node.js process restarts.
- **Optional telemetry archive:** If an AWS IoT Rule invokes a Lambda function
  that writes incoming readings to MongoDB, that is a separate AWS data
  pipeline. It can archive readings without changing the dashboard's current
  live-feed behavior; the dashboard will not display archived readings from
  MongoDB unless a MongoDB telemetry read path is added.

In short, MongoDB persistence is required here for registered accounts and
browser sessions, while live dashboard telemetry is delivered by HTTP or MQTT
and held in memory.

### Startup and MongoDB connection

On startup, `server.js` loads the repository's `.env` file when it exists,
requires `MONGODB_URI`, connects using the native MongoDB `MongoClient`, creates
unique indexes, and then starts listening for HTTP requests. Connection and
index setup are awaited; the database connection is **not** started as a
detached background process. If configuration, connection, index setup, or
server startup fails, the server does not continue to serve requests.

The client is closed after the HTTP server closes on `SIGINT` or `SIGTERM`.
The database name is explicitly set to `iwos_database` in `server.js`,
regardless of the database name included in the URI.

## MongoDB database and collections

All three collections are in the `iwos_database` database.

### `users` — account profiles

`services/userStore.js` uses native MongoDB collection operations. User IDs
are UUID strings stored in MongoDB `_id`; the public profile API exposes that
identifier as `id`.

Example document:

```javascript
{
  _id: "UUID string",
  fullName: "Driver Name",
  email: "driver@example.com", // trimmed and lowercased
  passwordHash: "bcrypt hash",
  vehicleNickname: "Solar One",
  themePreference: "dark",
  profilePictureUrl: ""
}
```

`passwordHash` is created with `bcryptjs` using a work factor of 12. During
authentication, the supplied email is normalized, the matching user is loaded
from `users`, and `bcrypt.compare()` checks the supplied password against the
stored hash. Plain-text passwords are never saved or included in returned
profiles. The `email` field has a unique MongoDB index.

The store also implements profile lookup and updates for the driver's name,
vehicle nickname, theme preference, and profile picture.

### `sync_sessions` — guest and authenticated activity

This collection records dashboard guest activity and the driver's authenticated
session. Each document has a unique `sessionId` index and uses the following
fields:

```javascript
{
  sessionId: "SES-GUEST-xxxxxxxx", // authenticated IDs use SES-DRIVER-...
  driverName: "Guest Observer",
  duration: "00h 02m",
  isGuest: true,
  packetsSent: 0,
  segment: "Public Spectator View",
  status: "Active",
  statusClass: "status-active",
  updatedAt: ISODate()
}
```

Authenticated driver documents use the same fields, with `driverName` set to
the user's full name, `isGuest: false`, and `segment: "Solar Route Track
Active"`. `updatedAt` is a BSON date. The guest heartbeat calculates elapsed
duration from the start time held in that browser's Express session and formats
it as `HHh MMm`. Driver duration is set when the authenticated session is
created.

The current application writes these records with upserts and sets their status
to `Active`. It does not currently run a background job to expire old sync
records or change their status on logout.

### `express_sessions` — persistent Express sessions

`app.js` configures `connect-mongo` with the connected `MongoClient`, the
`iwos_database` database, and the `express_sessions` collection. Express
session middleware reads and writes session data through this store instead
of its default in-process `MemoryStore` when the production entry point passes
the Mongo client to `createApp()`.

The stored session data includes application session fields such as the
authenticated user profile, CSRF token, and guest/driver session identifiers.
`connect-mongo` also stores the session ID and expiration metadata; its internal
document shape is managed by the adapter. The Mongo session TTL and cookie
lifetime are configured for eight hours. The cookie is HTTP-only, SameSite
Lax, and Secure when `NODE_ENV=production`.

## Guest-first heartbeat and sign-in transition

1. A guest can open `/dashboard` without registering. The rendered page marks
   whether the current request is authenticated using `data-authenticated`.
2. `public/telemetry.js` detects a guest, sends an initial
   `POST /api/sessions/guest-heartbeat`, and schedules another request every
   30 seconds. The request uses the browser's session cookie.
3. The route creates a `SES-GUEST-...` ID on the first heartbeat, then upserts
   the guest document in `sync_sessions` on each heartbeat. Repeated requests
   from the same browser update the same record rather than creating duplicates.
   Authenticated requests do not create guest records.
4. On successful sign-in (`POST /signup` or `/signin`) or registration
   (`POST /register`), the router first retains the current guest session ID,
   regenerates the Express session, and sets the authenticated user. It then
   deletes the record matching both that guest `sessionId` and `isGuest: true`.
5. The router creates a `SES-DRIVER-...` identifier and upserts the authenticated
   driver's `sync_sessions` record with `isGuest: false` and the
   `"Solar Route Track Active"` segment. The dashboard is redirected to
   `/dashboard`; its authenticated marker prevents further guest heartbeats.

Cleanup is scoped to the guest record associated with the signing-in browser
session; it does not delete guest records belonging to other visitors.

## Requirements

- Node.js `>=22.16.0`
- npm
- A MongoDB Atlas deployment or other reachable MongoDB deployment
- A sensor bridge or MQTT broker and certificates if receiving live telemetry

## Setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create `.env` in the repository root by copying `.env.example` if the file
   does not exist. Add the live MongoDB connection string to **`.env`**, not
   `.env.example`:

   ```dotenv
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/?retryWrites=true&w=majority
   ```

   Replace the placeholders with the connection string copied from your
   MongoDB deployment. Keep the URI private; do not paste it into source files,
   commit it, or share it in logs. Ensure `.env` is ignored by Git. The app
   connects specifically to the `iwos_database` database.

   In this workspace, `.env` exists and has a `MONGODB_URI` entry. Its value
   has deliberately not been read or displayed here, and its validity has not
   been established by a live database connection.

3. Generate a unique `SESSION_SECRET` locally and set it in `.env`:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   This signs Express browser sessions; it is not the sensor API token. Keep
   it private and stable between restarts. Changing it invalidates existing
   sessions. Production requires at least 32 bytes. For local development,
   the app generates an ephemeral value if this setting is empty.

4. Configure the sensor source in `.env`:

   - For HTTP ingestion, set `SENSOR_SOURCE=http` and generate a separate
     local random value for `SENSOR_API_TOKEN` (run the command above again).
     Set it in the server's `.env` and configure the same value on the HTTP
     sensor bridge. It authenticates sensor requests and is not issued by
     MongoDB.
   - For MQTT, set `SENSOR_SOURCE=mqtt` and provide the broker, topic, and
     certificate paths described in `.env.example`. `.env` should contain
     paths to the TLS files, not the certificate or private-key contents.
     Keep those files in the Git-ignored `certs/` directory; use a separate
     dashboard identity with AWS subscribe permission. MQTT mode does not use
     the HTTP sensor API token.

5. Start the server:

   ```powershell
   npm start
   ```

   By default, it listens at `http://127.0.0.1:3000`. Configure `HOST` and
   `PORT` to change the bind address.

6. Run the automated tests:

   ```powershell
   npm test
   ```

## Dashboard simulator scripts

The scripts in `scripts/` send simulated weather and vehicle readings to the
local dashboard. They use `SENSOR_API_TOKEN` and `PORT` from the project `.env`
and default to `http://127.0.0.1:<PORT>`. The server must be running with
`SENSOR_SOURCE=http`; MQTT mode intentionally rejects HTTP weather packets.

Run one simulator at a time in a second terminal, after starting the server:

```powershell
node .\scripts\KP-Simultion.js
```

Alternatively, run `FNB_Stadium.js` or `simulate-motion.js`. Each script
continues to send route points until stopped with Ctrl+C. Add `--once` to send
one point and exit. Open `/dashboard`; accepted data updates the display
automatically. If the server uses a non-default URL, set `SENSOR_API_URL`, for
example `http://127.0.0.1:3100`.

For a quick browser-based simulation, open `/dashboard` in a non-production
environment. The simulated feed starts automatically and sends synthetic readings
through the same telemetry store and optimizer as the sensor integration, so
the live cards and analysis update together. If a navigation trip is active,
choose **Begin Simulation** on the dashboard to move the simulated GPS along
that route; the map and navigation guidance update with it. The telemetry feed
continues whether or not a route is selected or simulated. Route selection is
optional and remains under the driver's control. Updates continue while the
dashboard is open; closing or leaving the dashboard ends that browser's simulated feed
feed. During route playback, vehicle speed accelerates from zero and varies
along the route; **Log Today** adds the distance actually traveled. Without a
running route simulation, simulated speed and distance remain zero. The simulation is
disabled in production;
set `ENABLE_TELEMETRY_SIMULATION=false` to disable it in other environments. It will
not overwrite readings from a real sensor feed. The optimizer is a prototype
rule-based system, not a trained or autonomous AI model.

## Account, route, and security notes

- `/` redirects to the public `/dashboard`.
- `/signup` and `/signin` show the sign-in screen; successful sign-in and
  registration regenerate the Express session ID.
- `/route-setup` and its route-planning APIs require an authenticated user.
  Planning uses a fresh GPS fix from weather telemetry; without one, the
  dashboard displays that GPS is unavailable and does not submit a calculation.
- Route calculations, location suggestions, and guest heartbeats are
  rate-limited. Route calculations validate coordinates and wind input, and
  return a provider error rather than treating unavailable elevation as zero.
- Registration collects account details only. Profile pictures can be added or
  changed later from Personalization & Settings; JPEG, PNG, GIF, and WebP
  uploads are limited to 5 MB and stored under `public/uploads/`. That
  directory should be backed up or cleaned separately from MongoDB. New upload
  files are ignored by Git; files already tracked in that directory remain
  tracked and should be reviewed before removal because a stored profile may
  reference them.
- Profile settings, including theme preference and profile picture, update the
  MongoDB user record.
- Account forms use per-session CSRF tokens. Logout is available at `/logout`.
- The session cookie is HTTP-only and SameSite Lax. Production deployments
  should use HTTPS and set `NODE_ENV=production`, a stable `SESSION_SECRET`,
  and appropriate trusted proxy configuration.
- `SESSION_SECRET` and `SENSOR_API_TOKEN` are separate locally generated
  secrets. Keep the session secret on the server; share the sensor token only
  with the HTTP sensor bridge when using HTTP ingestion.
- Do not commit `.env`, live MongoDB credentials, either secret, or private
  MQTT certificates.

## Main project areas

- `server.js` — loads environment configuration, connects MongoDB, and starts
  the HTTP server and optional MQTT consumer.
- `app.js` — configures Express middleware, `connect-mongo`, static assets, and
  routers.
- `services/userStore.js` — MongoDB-backed user management and bcrypt password
  hashing/verification.
- `services/telemetryStore.js` — in-memory sensor readings, history, and
  analysis inputs.
- `routers/telemetryRouter.js` — dashboard, authentication, profile, and
  guest/driver session routes.
- `routers/apiRouter.js` — telemetry API endpoints.
- `public/telemetry.js` — dashboard telemetry rendering and guest heartbeat
  timer.
- `pages/` and `views/` — EJS dashboard and account screens.
- `partials/` — shared navigation and footer.

For Windows sensor setup and the project data contract, see
[START_HERE.md](START_HERE.md), [docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md),
and [docs/VERIFICATION.md](docs/VERIFICATION.md).
