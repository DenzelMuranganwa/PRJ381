# IWOS Field Expo Presentation Notes

This guide is a rehearsal aid for the 20-minute expo assessment. It gives the
team a shared story, suggested speaking roles, demo cues, technical explanations,
and answers to likely assessor questions. Reassign sections to match each
member's experience; the suggested speaker order does not imply who implemented
each part.

## The one-sentence project story

IWOS Field receives weather and vehicle telemetry, checks and analyses the
available measurements, and presents live conditions and prototype route
decision support on a dashboard.

## Be precise about what is implemented

- The Raspberry Pi and sensors are the source of real hardware measurements.
- The web application receives readings through its configured HTTP or MQTT
  ingestion path, validates them, keeps current readings and a bounded history
  in server memory, and updates the dashboard.
- In development, the dashboard can generate synthetic weather and vehicle
  readings. These are clearly marked as simulated and use the same analysis
  path as received readings. They are not hardware measurements.
- The current hardware sensor list includes temperature, humidity, pressure,
  altitude, wind, and GPS. It does not include irradiance or rainfall.
- The submitted project does not currently have a real vehicle adapter for
  battery percentage or speed. The development simulator supplies example
  values for those fields; do not describe them as measured hardware data.
- The optimizer is a port of SolarCarAI v2 decision rules plus simple linear
  trends. It is not a trained machine-learning model, a validated weather
  forecast, or a vehicle controller. It provides prototype decision support.
- In this application, MongoDB stores account profiles, browser sessions, and
  sync-session records. Current live telemetry and analysis history are held
  in memory and are lost when the Node process restarts.
- Only describe AWS Lambda, Power BI, Render, or any other external component
  as part of the demonstrated end-to-end system if the team has verified that
  exact connection. The current dashboard's live readings are not retrieved
  from MongoDB.

If anything in the slides differs from these points, update the slide or explain
the distinction before presenting. In particular, show separate lines for the
live telemetry route and the MongoDB account/session storage.

## Suggested 20-minute running order

Plan to finish the prepared presentation at 10:18, leaving the last two minutes
for questions. These are suggested roles, not claims about individual
contributions. Choose the speaker who knows the relevant topic best.

| Time | Speaker | Section | Main purpose |
|---|---|---|---|
| 10:00–10:01 | 1 | Welcome | Introduce the project, team, and goal |
| 10:01–10:03 | 2 | Problem and objective | Explain the need and intended value |
| 10:03–10:05 | 3 | System architecture | Trace one reading through the system |
| 10:05–10:07 | 4 | Sensors and edge device | Explain what the hardware measures |
| 10:07–10:09 | 5 | Data communication | Explain HTTP or MQTT, whichever is demonstrated |
| 10:09–10:11 | 6 | Application and data handling | Explain validation, dashboard, and persistence accurately |
| 10:11–10:13 | 7 | Optimisation and decision support | Explain the rules, inputs, and limitations |
| 10:13–10:16 | 8 | Demonstration | Show the dashboard and identify live versus simulated data |
| 10:16–10:18 | 9 | Verification and next steps | Present evidence, limitations, and improvements |
| 10:18–10:20 | 1 + team | Questions | Host questions; topic expert answers |

Use the team members' actual names on the slides and agree on the final speaker
order before rehearsal. Keep each handoff to one sentence.

## Speaker notes and sample wording

These are prompts, not lines that everyone must recite word-for-word. Explain
the idea naturally and use the project vocabulary consistently.

### 1. Welcome — 1 minute

> Good morning. We are Group 5, and our project is IWOS Field, a weather and
> telemetry dashboard intended to support solar-car route planning. We will
> show how measurements can travel from a station to the dashboard, what our
> prototype analysis does with them, and what is currently complete versus
> still future work.

Introduce the nine members briefly. Avoid using the opening minute to read a
long list of names or thank-you notes; the team names can be displayed on the
slide.

**Handoff:** “First, [name] will explain the problem we set out to address.”

### 2. Problem and objective — 2 minutes

Explain that route planning for a solar vehicle can be affected by changing
weather and energy conditions. The project explores collecting relevant
measurements and presenting them together to help a team make more informed
planning decisions.

Be careful with the claim: this is a prototype that displays telemetry and
decision support. Do not claim that it autonomously finds the safest or most
efficient route, or that it controls the vehicle.

**Handoff:** “Here is the path a reading takes through our system.”

### 3. System architecture — 2 minutes

Point to the architecture diagram and trace one reading from left to right:

1. A sensor measures a value.
2. The Raspberry Pi-side program collects readings and forms a data payload.
3. The configured transport sends the payload to the web application. Name the
   transport used in this demo: MQTT over TLS or HTTP.
4. The Node/Express application validates the payload and updates its telemetry
   store.
5. The dashboard reads the current status and analysis and presents it.

Show MongoDB as a separate account/session data store, not as the live telemetry
source for this dashboard. If AWS IoT Core is in the actual demonstrated MQTT
path, label that path. Do not add a Lambda-to-dashboard connection unless you
have tested it end-to-end.

**Handoff:** “Now [name] will describe what the station can really measure.”

### 4. Sensors and edge device — 2 minutes

Name only the devices confirmed on your station. The project documentation
lists BME280, anemometer, GPS, and an LED indicator, with a Raspberry Pi
running Python. Explain the readings in plain language: environmental
conditions and position are collected at the edge before transmission.

Explicitly distinguish installed sensors from planned inputs:

- Current documented sensor readings include temperature, humidity, pressure,
  altitude, wind, and GPS.
- Irradiance and rainfall are not currently measured by the listed hardware.
- Real vehicle speed and battery percentage are not supplied by a vehicle
  adapter in the submitted project.

Do not imply that GPS position alone measures speed or battery state.

**Handoff:** “The readings then need a reliable way to reach the application.”

### 5. Data communication — 2 minutes

Describe the actual route used for the expo, not every possible route:

- **MQTT option:** the station publishes a JSON message and the application
  subscribes to the configured topic over TLS.
- **HTTP option:** the station-side bridge sends a JSON request to the
  application's telemetry endpoint with the configured token.

Say that the application validates the data before accepting it. If a
connection, station, or credential is not available during the presentation,
say so and switch to the prepared fallback rather than pretending the live
feed is connected.

**Handoff:** “Once a message arrives, the application checks it and updates the
dashboard.”

### 6. Application and data handling — 2 minutes

Explain that the Express application checks measurement types, ranges,
timestamps, and freshness. Invalid readings are rejected; missing values are
not silently replaced with zero. The dashboard polls the status endpoint and
shows the newest accepted values.

Clarify persistence:

- MongoDB stores user profiles and browser/session records.
- Live telemetry history is held in the running application's memory; it is
  not currently loaded from MongoDB by the dashboard and does not survive a
  Node server restart.

This distinction demonstrates that the team understands its own data flow.

**Handoff:** “The next section explains what the prototype does with those
readings.”

### 7. Optimisation and decision support — 2 minutes

Start with an honest description:

> The section is labelled AI Optimisation, but the current implementation is a
> transparent prototype of programmed rules and short-term linear trends. It
> is not a trained machine-learning model and does not send commands to the
> vehicle.

Explain the cards:

- **Prototype speed target:** begins at 90 km/h and applies rule adjustments
  for solar irradiance, battery level, wind, rain, and temperature. It is
  capped at 45–110 km/h. It is not safety-certified or vehicle-validated.
- **Battery mode / energy status:** classifies conditions from battery
  percentage and irradiance. If either input is missing, a complete
  classification is unavailable.
- **Efficiency rule score:** a heuristic score from 0 to 100, with penalties
  for selected conditions and for a large gap between actual speed and the
  target. It is not measured electrical or mechanical efficiency.
- **Input coverage:** the proportion of seven required inputs that are
  present. It is availability, not confidence.
- **Five-minute trends:** a simple estimate based on recent measurements. It
  requires at least three readings spanning 20 seconds; it is not a calibrated
  weather forecast.

If full synthetic output is on screen, state plainly that the simulator
supplies extra example inputs (including irradiance, rainfall, battery, and
speed) so the rules can be demonstrated. For a hardware-only run, explain that
missing measurements cause partial analysis and unavailable results. Do not
present simulator values as measurements from the vehicle.

**Handoff:** “We will now show the dashboard and identify the source of the
readings on screen.”

### 8. Dashboard demonstration — 3 minutes

Keep the demo to a rehearsed sequence. Do not browse source files during the
live demo.

1. Point out the feed label. Say “simulated” if the application is generating
   readings, or “live sensor data” only after confirming actual sensor packets
   are arriving.
2. Point to two or three actual displayed weather values and explain their
   units.
3. Open the optimisation section. Identify a rule output, input coverage, and
   a trend. Mention a missing-input message if using the real hardware feed.
4. If time permits, briefly show guest versus signed-in identity, but do not
   let account setup consume the telemetry demo.
5. Close with one honest sentence about what the results do and do not mean.

**Demo wording for simulated data:**

> These readings are generated by the development simulator, not received
> from the Raspberry Pi. They use the same validation, storage, and analysis
> path so we can demonstrate the dashboard and decision rules.

**Demo wording for a live hardware feed:**

> These readings are arriving from the station. The optimizer only produces
> outputs whose required inputs are available; irradiance, rainfall, battery,
> and vehicle speed are not currently measured by our listed hardware, so
> those full-optimization results remain unavailable.

**Handoff:** “Finally, [name] will summarize our testing, current limitations,
and next steps.”

### 9. Verification, limitations, and conclusion — 2 minutes

Report only tests the team can demonstrate or point to. Distinguish software
tests from physical testing:

- Software tests check application routes, validation, analysis rules, and
  session behavior.
- They do not prove sensor calibration, vehicle performance, or safe driving
  recommendations.
- Real-world vehicle validation and added sensors/adapters are future work,
  not completed capabilities.

Suggested conclusion:

> IWOS Field demonstrates a path from telemetry to a dashboard and transparent
> prototype decision support. Our next steps are to connect and validate the
> complete hardware feed, add real measurements for currently missing inputs
> if required, and test the rules under controlled real-world conditions.
> Thank you; we are ready for your questions.

## What the team should know before presenting

Every speaker should be able to answer these without looking at code:

1. **What does telemetry mean here?** Measurements such as weather or vehicle
   values sent to and processed by the application.
2. **Where does live telemetry originate?** From the hardware sensors and
   station program; the app receives it over the configured transport.
3. **Why does the dashboard show values without the hardware?** Development
   mode can generate synthetic values. The UI identifies the source as
   simulated.
4. **Are irradiance and rainfall real hardware measurements?** No, not from
   the currently documented sensor list. They can be simulated for a software
   demonstration but must not be presented as hardware readings.
5. **What about battery and vehicle speed?** The submitted project does not
   currently have a real vehicle adapter supplying these; simulated values
   exist for demonstrating the analysis path.
6. **What does the optimizer do?** Applies programmed SolarCarAI v2 rules and
   simple trends to available data. It does not train a model or control the
   car.
7. **What if inputs are missing?** The dashboard reports missing inputs and
   withholds results that depend on them instead of inventing values.
8. **Does MongoDB store the live dashboard telemetry?** Not in the current
   dashboard path. MongoDB stores account and session data; current telemetry
   is in application memory.
9. **How do we know the speed target is safe?** We do not yet; it is a
   prototype rule output requiring vehicle-specific and safety validation.
10. **What is the next practical improvement?** Connect and validate the real
    data path, then add real sensors or an adapter for whichever missing
    inputs the team decides are necessary.

## Likely assessor questions

### “Is this real data or simulated data?”

Answer from the visible feed label and the running setup. Never guess. Show
where the dashboard identifies the source. If the screen says “SIMULATED FEED,”
call it simulated.

### “Why call it AI if it is rules?”

> The current prototype uses explainable decision rules ported from
> SolarCarAI v2 and simple linear trends. It is not a trained model. We use the
> section name for the project's optimisation and decision-support function,
> while clearly disclosing the implemented method and its limitations.

### “Can your system recommend a real safe speed?”

> Not yet. The displayed value is a prototype rule target. It has not been
> validated for this vehicle or certified as a safe driving instruction, and
> the application does not control the vehicle.

### “Why are some results unavailable with the actual station?”

> The optimizer requires measured inputs for those outputs. The current
> station does not measure every required field, such as irradiance, rainfall,
> battery state, or vehicle speed. The application marks those inputs as
> missing rather than treating estimates as measurements.

### “Where is the data stored?”

> User accounts and browser sessions are stored in MongoDB. The dashboard's
> live telemetry and bounded analysis history are currently in server memory.
> Persisting historical telemetry would be a separate feature.

### “What happens if the network or feed fails?”

Explain what you observe in the actual setup: the display indicates waiting,
stale, or offline status, and analysis pauses when readings are stale. Do not
claim an untested failover or guaranteed delivery.

### “What exactly have you tested?”

Give the specific software or hardware checks completed by your group. State
clearly if physical calibration, a live AWS account, or real-road testing has
not been completed.

## Rehearsal and setup checklist

### Before the assessment

- Confirm the final presentation uses the provided template and includes all
  nine names.
- Replace placeholder slides and diagrams; remove any unverified services
  from the architecture or label them as future/separate work.
- Decide whether the demonstration uses real hardware or simulated data. Make
  the source visible and rehearse the exact wording.
- Rehearse once with a 20-minute timer. Target no later than 10:18 for prepared
  remarks.
- Test the TV connection, browser zoom, dashboard route, chosen data source,
  and video playback.
- Keep a local copy of any video and a few screenshots in case the feed or
  network fails.
- Do not project `.env`, passwords, MongoDB URIs, API tokens, AWS keys, private
  keys, or certificates.
- Confirm each speaker knows the transition and who should take questions in
  their subject area.

### If the live demo fails

1. Say what failed without blaming or hiding it.
2. Switch to a prepared local recording or screenshots.
3. Explain whether that evidence shows simulated or previously captured data.
4. Continue to the conclusion and leave time for questions.

## Technical references in this project

- `docs/Weather_System_Expo_Presentation.pdf` — supplied expo slide outline.
- `docs/DATA_CONTRACT.md` — telemetry fields, sources, validation, analysis
  assumptions, and limitations.
- `services/optimizer.js` — rule calculations and trend estimates.
- `services/telemetryStore.js` — in-memory telemetry state, history, and
  freshness.
- `routers/telemetryRouter.js` — ingestion and development simulation endpoint.
- `public/telemetry.js` — dashboard polling, rendering, and synthetic-feed
  requests.
- `config/index.js` — development simulation setting.
- `README.md` — project data and MongoDB persistence architecture.
