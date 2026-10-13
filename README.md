# IWOS Field — Telemetry Dashboard

IWOS Field is a Node.js, Express, and EJS dashboard for viewing live vehicle and
weather telemetry. It can receive telemetry over the configured HTTP or MQTT
transport. The dashboard is **guest-first**: its root and dashboard pages are
public, and signing in is optional for viewing telemetry.

## Requirements

- Node.js `>=22.16.0`
- npm
- The sensor bridge or MQTT broker/certificates if you want to receive live data

## Install and run

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy `.env.example` to `.env` and configure the sensor transport. For an HTTP
   sensor bridge, set a private `SENSOR_API_TOKEN`. For MQTT, set the broker
   hostname and certificate paths as described in `.env.example`.

3. Set `SESSION_SECRET` to a random value at least 32 bytes long before running
   in production. The app rejects a production configuration without a
   sufficiently long secret. Do not commit `.env` or certificates.

4. Start the app:

   ```powershell
   npm start
   ```

By default, the app listens at `http://127.0.0.1:3000`. Configure `HOST` and
`PORT` in `.env` to change the address.

Run the automated checks with:

```powershell
npm test
```

## Guest and account flow

- `/` redirects to `/dashboard`.
- `/dashboard` is public. Guests can view the telemetry feed, graphs, and
  measured weather/vehicle values without creating an account.
- The header profile dropdown identifies a visitor as **Guest** and links to
  `/signup` and `/register`.
- `/signup` (also available as `/signin`) displays the sign-in page.
- `/register` creates an account and signs the new user in.
- Authenticated users can access `/sync-sessions`, `/route-setup`, and
  `/settings`. Those pages redirect guests to `/signup`.
- The header dropdown allows an authenticated user to change the theme, set a
  profile-picture URL, visit profile settings, and sign out through `/logout`.
- Guests can switch themes as well. Their preference is kept in browser
  `localStorage`; a signed-in user's preference is saved with their profile.

All account forms use a per-session CSRF token. Session identifiers are
regenerated at login and registration. The session cookie is HTTP-only,
SameSite Lax, and Secure when `NODE_ENV=production`.

## Where user and session data is stored

There is currently **no MongoDB configuration or persistent user database**.
The `UserStore` in `services/userStore.js` keeps account records in an
in-memory JavaScript `Map` for the lifetime of the running Node process. A
profile contains:

- `fullName`
- normalized `email`
- `passwordHash` (bcrypt hash; the plain-text password is never stored)
- `vehicleNickname`
- `themePreference`
- `profilePictureUrl`

Profile picture URLs are stored as text only; the app does not upload or retain
image files when a URL is used. Alternatively, registration and profile settings
accept JPEG, PNG, GIF, or WebP uploads up to 5 MB. Uploads are checked against
their MIME type and file signature, assigned a random filename, and saved under
`public/uploads/`; the public profile stores the generated `/uploads/...` path.
Uploaded images are public static assets. They remain on disk when an account
or in-memory user record is lost, so deployments should back up or periodically
clean that directory as appropriate.

Sessions are managed by `express-session` using its default in-process
`MemoryStore`. The session contains the signed-in profile and CSRF token. Like
the user map, sessions disappear when the server restarts. In development, if
no `SESSION_SECRET` is set, a random secret is generated at startup; this also
invalidates sessions on restart.

**These in-memory stores are intended for local development and demonstration,
not multi-process or production persistence.** For production, use a durable
database-backed user store and a shared, durable session store (for example,
MongoDB-backed adapters), configure a stable secret with `SESSION_SECRET`, and
use HTTPS. MongoDB adapters are not currently installed or configured in this
project.

## Main project areas

- `server.js` — loads `.env`, starts the HTTP server and optional MQTT consumer.
- `app.js` — Express configuration, session middleware, static files, and
  routers.
- `routers/telemetryRouter.js` — public dashboard, authentication, settings,
  and logout routes.
- `routers/apiRouter.js` — telemetry API endpoints.
- `services/userStore.js` — in-memory account store and bcrypt password checks.
- `services/telemetryStore.js` — in-memory telemetry and history.
- `pages/` and `views/` — EJS dashboard and authentication/profile screens.
- `partials/` — shared navigation and footer.
- `public/css.css` — dashboard and authentication styling.
- `public/telemetry.js` — live telemetry UI updates.

For Windows setup, sensor replacement instructions, and the project data
contract, see [START_HERE.md](START_HERE.md), [docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md),
and [docs/VERIFICATION.md](docs/VERIFICATION.md).
