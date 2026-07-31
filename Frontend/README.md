# AHU · IoT Test Rig — HIL Dashboard (Vue 3)

Frontend for the 7" touchscreen panel driving hardware-in-the-loop testing of
an AHU controller. Talks to Node-RED over a single WebSocket; renders whatever
it's told; never holds logic Node-RED doesn't already know.

## Run it

```bash
npm install
cp .env.example .env.local   # point VITE_WS_URL at your Node-RED instance
npm run dev
```

## The core idea: everything is driven by a test plan, not by code

`src/data/seedTestPlan.js` is what an uploaded FAT sheet looks like once
parsed into JSON — sections (`AI`, `AO`, `DI`, `DO`, or whatever a future job
calls them) each holding an arbitrary-length list of points. **Nothing in the
components assumes a section has a fixed number of points, or that there are
exactly 4 sections.** Tabs, the signal rack, the pass-percentage footer, and
the spotlight all read their shape from `rig.testPlan` at render time.

Swap in a real uploaded plan with `rig.loadTestPlan(newPlan)` — everything
reflows automatically.

## Signal rack, not a tree graph

The device topology used to be a radial hub-spoke tree — it capped out fast
(past ~8 leaves per hub the angles get cramped) and had no home for
time-based information. It's been replaced with `SignalRack.vue`: stacked,
scrollable lanes, one per point, grouped by module as a text tag rather than
a spatial position:

- **Analog lanes** (`AnalogLane.vue`) — live line trace with the tolerance
  band shaded behind it, normalized to `% of span` so Pa/°C/% can stack
  together without unit chaos.
- **Digital lanes** (`DigitalLane.vue`) — a proper stepped 0/1 trace, not a
  static badge, so contact bounce or a slow transition is actually visible.
- **Role + status filter chips** and a **Dense/Full toggle** (compact mode
  shrinks lane height for scanning 30+ points without scrolling forever).
- **Cross-reference badges** (`↳ drives EC-FAN` / `↲ from DPT-2`) replace the
  old dashed causal-link curve — tap one to jump straight to the paired lane.

## The transfer plot (the main new piece)

`TransferPlot.vue` is what actually validates a stimulus→response coupling:
a live XY plot of the response value against the stimulus value, with a
dashed ideal-proportional reference line. A healthy loop tracks the diagonal;
a broken one visibly bends or flattens. It's embedded automatically:

- in `StimulusSpotlight.vue`, using the point's first `relatedPoints` entry
- in `ResponseSpotlight.vue`, via `rig.drivingStimulusFor(pointId)` — the
  reverse lookup, so it shows up whichever side you select from

Both directions pull from the same `rig.history` buffer, so they can't
disagree with each other.

## Demo simulator

`useDemoSimulator.js` ticks fake-but-plausible values into `rig.history`
every ~1.2s, including a real simulated transfer function between `DPT-2`
and `EC-FAN` so the transfer plot has something meaningful to show without
hardware attached. It's started in `App.vue`, gated by `VITE_DEMO_SIMULATOR`
— set that to `false` once Node-RED is streaming real telemetry, and delete
the file entirely once you're confident the real pipeline covers everything
it stubs.

Every point has a `role`:

- **`stimulus`** — the rig injects this value into the controller under test
  (AI, DI in the FAT sheet's terms). Gets an injection slider or command
  toggle (`StimulusSpotlight.vue`) and a **blue ring** on its lane identity dot.
- **`response`** — the controller drives this value and the rig reads it back
  (AO, DO). Gets a read-only trace or a manual confirm toggle
  (`ResponseSpotlight.vue`) and a **copper ring**.

Module grouping (`Base`, `EXP-1`, `EXP-2`, ...) is parsed from the terminal
string itself (`src/utils/moduleParser.js`) — a job with 4 expansion modules
works with zero code changes.

## Status is computed, never stored as a flag

`src/utils/statusEngine.js` is the single place that decides `pass` / `fail`
/ `pending` / `awaiting-manual` by comparing `hmiValue` and `controllerValue`
(the sheet's two verification columns) against `commandedValue ?? acceptableValue`
within `tolerancePercent`. The signal rack, both spotlights, and the transfer
plot's live dot all call the same function — there's no way for them to disagree.

## Structure

```
src/
  data/seedTestPlan.js       — demo test plan (19 AI + 3 AO + 8 DI + 3 DO)
  utils/
    moduleParser.js          — terminal string -> module name, any count
    graphGeometry.js         — small trig helpers (kept for any future radial view)
    statusEngine.js          — pass/fail/pending logic, single source of truth
  engine/
    sequenceGenerator.js     — auto-generates a baseline sequence from the test plan
    sequenceEngine.js        — executes steps, pushes test.step/test.log/test.status
  stores/rig.js              — test plan state, history buffer, WS message router
  composables/
    useWebSocket.js
    useDemoSimulator.js      — DEMO ONLY: fake telemetry + a real transfer function
  components/
    TopNav.vue               — dynamic section tabs + SIM ON + Release All Outputs
    rack/
      SignalRack.vue         — stacked lanes, grouped by module, filters, dense mode
      AnalogLane.vue         — reactive line trace + tolerance band, no chart lib
      DigitalLane.vue        — stepped 0/1 trace
    io/
      AddIoPanel.vue         — add a point to the active section live
    spotlight/
      StimulusSpotlight.vue  — injection slider (analog) / command toggle (digital)
      ResponseSpotlight.vue  — passive readout (analog) / confirm buttons (digital)
      TransferPlot.vue       — live stimulus-vs-response XY plot (item D)
    automation/
      TestRunnerPanel.vue    — Run Baseline button, live step list, manual-entry pause
    alerts/AlertPanel.vue
    cards/KpiCard.vue, GaugeCard.vue  — generic widgets, not wired into this
                                         screen but kept for other views
  views/DashboardView.vue    — assembles everything; right column switches between
                                Spotlight / Add I/O / Automation
  App.vue                    — owns the WebSocket, starts the demo simulator,
                                provides send() to children
```

## Recent fixes

- **Signal rack scroll containment.** `main`'s CSS grid row had no height
  constraint (`auto`), so tall content silently grew the whole page instead
  of the rack scrolling internally. Fixed with `grid-rows-[minmax(0,1fr)]`
  on `main` plus `h-full`/`min-h-0` down the chain — the rack (and the right
  column) now each own their scroll, styled with a thin `.scroll-thin`
  scrollbar (`style.css`) so it visibly reads as its own region.
- **Exact-value command input.** The slider and % presets are fast but
  coarse. `StimulusSpotlight.vue` now also has a plain number input + Set
  button for commanding a precise figure (e.g. `483`), clamped to the
  point's min/max.
- **CSV export.** The footer's Export button now does something —
  `src/utils/exportCsv.js` builds a CSV of the active section (id, terminal,
  role, commanded, controller display, HMI reading, computed status) and
  triggers a real browser download. Split into a pure `buildSectionCsv()`
  (unit-testable without a DOM) and a side-effecting `downloadCsv()`.



## Automated testing

`generateBaselineSequence(section)` synthesizes a working sequence from data
every point already has — no hand-authoring required to get a "Run Baseline"
button. For each point it produces:

- **stimulus analog** → `command` → `wait` (settle-detect, not just a fixed
  clock — polls until the reading stops moving) → `requireManual` → `assert`
- **stimulus digital** → `command` → short `wait` → `requireManual` → `assert`
- **response analog/digital** → `wait`/`requireManual` → `assert` (no
  command — assumes the driving stimulus already ran)

`createSequenceEngine(rig, wsSend)` (`src/engine/sequenceEngine.js`) executes
these steps and pushes updates through the **exact same** `test.step` /
`test.log` / `test.status` message shapes a real Node-RED backend would send
— it's pretending to be Node-RED. Point this at a real backend later by
simply not calling `engine.run()` locally; nothing in `TestRunnerPanel.vue`
changes, since it only ever reads `rig.testRun`.

Two things worth understanding about the engine:

- **It never fakes the manual columns.** A `requireManual` step sets
  `rig.testRun.waitingManual` and genuinely blocks until a human enters the
  value — `TestRunnerPanel.vue` surfaces this as an inline pause prompt right
  in the runner, not a separate screen.
- **It checks `sequence.abortIf` before every step**, not just at the start —
  any point whose id matches `/trip/i` (e.g. `FIRE-TRIP`) going `true`
  aborts the run immediately and marks remaining steps `skipped`, regardless
  of what step it's currently on.

Run `npx vitest run test/engine.test.js` to see the happy path, fail path,
abort, and interlock-abort all exercised against the real engine (no mocked
timers) — this is what caught the settle-timing edge cases during development.

Not yet built: `ramp` steps (sweep a stimulus and capture a full calibration
curve using the same geometry as `TransferPlot.vue`), a "Run Full FAT" queue
chaining all four sections, and record-a-sequence mode (capturing manual
`commandStimulus`/`setManualControllerValue` calls as they already flow
through the store, into a replayable sequence file).

`TopNav.vue` always shows a global **SIM ON/OFF** pill and a **Release All
Outputs** button, regardless of which tab is open — a stuck simulated value
left on a wire can mask a real fault in a later test, so it's not buried in a
settings menu.

## Safety note baked into the UI

`TopNav.vue` always shows a global **SIM ON/OFF** pill and a **Release All
Outputs** button, regardless of which tab is open — a stuck simulated value
left on a wire can mask a real fault in a later test, so it's not buried in a
settings menu.

## Not included yet (next steps)

- Storage panel (SD/SQLite), report download, sequence file upload — same
  patterns as everything above. They're HTTP endpoints against Node-RED, not
  WebSocket messages — don't route file transfer through the socket.
  (Note: automated *sequence running* is now implemented — see "Automated
  testing" above; what's left there is ramp steps, a full-FAT queue, and
  record mode.)
- A real on-screen numeric keypad for `StimulusSpotlight`'s manual entry —
  currently a plain `<input type="number">` for simplicity; swap in a custom
  keypad overlay if the native mobile keyboard isn't acceptable on the panel's
  browser.
- Causal-link authoring UI — `relatedPoints` currently only comes from the
  seed data. Decide whether testers draw these live or they stay part of the
  uploaded test plan (recommended — keeps them documented per job).

