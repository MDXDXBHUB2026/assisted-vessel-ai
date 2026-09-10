# System Requirements

This document translates the product requirements into system-level, testable requirements against the demonstrator's implemented architecture. Each requirement links back to a business objective and forward to the component that implements it — see [requirements-traceability.md](requirements-traceability.md) for the full table.

## 1. Platform

| ID | Requirement |
|---|---|
| BUS-101 | The system shall be built with React, TypeScript, Vite and Tailwind CSS. |
| BUS-102 | The system shall run entirely client-side; no requests to a backend service are required for core functionality. |
| BUS-103 | The system shall be buildable via `npm run build` producing a static `dist/` directory suitable for GitHub Pages. |
| BUS-104 | The Vite `base` path shall be configurable via the `VITE_BASE_PATH` environment variable without code changes. |

## 2. Simulation engine

| ID | Requirement |
|---|---|
| SIM-101 | The simulation engine shall model a `SimulationState` comprising a vessel snapshot, target vessels, maintenance items, hazards, raw alarms, recommendations, audit events, fleet summary, shore cases and voyage plan. |
| SIM-102 | The engine shall advance simulated time based on elapsed real time and a user-selectable speed multiplier (1x/2x/4x/8x), decoupled from the wall-clock tick interval so that irregular callback timing does not freeze or corrupt simulated time. |
| SIM-103 | The engine shall expose deterministic, pure functions for computing scenario severity targets, alarm sets, and health/state classification, so that the same inputs always produce the same outputs. |
| SIM-104 | Scenario activation shall reset severity ramp state and clear recommendation trigger flags, allowing a scenario to be re-activated after a reset. |
| SIM-105 | A RESET ENVIRONMENT action shall restore the simulation to its baseline snapshot while preserving the audit trail (recording the reset itself as an audit event). |

## 3. Decision engine

| ID | Requirement |
|---|---|
| MACH-101 | The decision engine shall compute a machinery anomaly score and health score from exhaust temperature deviation and lubricating oil pressure relative to fixed baselines. |
| MACH-102 | The decision engine shall classify probable condition into at least four bands (normal, early-stage, developing anomaly, significant anomaly) with an associated confidence and recommended response. |
| HMI-101 | The decision engine shall correlate raw alarms sharing a common cause tag into a single correlated operational event with primary/secondary alarms, probable common cause, and recommended crew response. |
| HMI-102 | Every recommendation produced by the decision engine shall be passed to the safety engine before being stored, and shall carry the resulting verdict. |

## 4. Safety engine

| ID | Requirement |
|---|---|
| SAFE-101 | The safety engine shall be implemented as a module independent of the decision engine, taking a recommendation's function ID, current snapshot, risk level and required authority as input. |
| SAFE-102 | The safety engine shall evaluate: operational-mode permission, operational-envelope (ODD) status, sensor-confidence sufficiency, source-system availability, presence of a required human authority, and risk-appropriate authority gating. |
| SAFE-103 | The safety engine shall return one of PASSED, CONDITIONAL, or BLOCKED, with a per-check breakdown and, where relevant, a reason string. |
| SAFE-104 | The operational envelope (ODD) module shall define, per assisted function, allowed operational modes and threshold limits for visibility, wave height, GNSS confidence, radar/AIS/chart-data availability, communications, sensor confidence and ship-shore data latency (applied only to functions that actually depend on the shore link). |
| SAFE-105 | Each ODD parameter shall report a continuous margin-to-limit fraction, not only a boolean, so the UI can distinguish INSIDE / NEAR LIMIT / OUTSIDE rather than a single pass/fail cliff-edge. |
| SAFE-106 | Sensor-confidence evaluation shall be scoped to only the domains a given function depends on (e.g. a communications-only degradation shall never reduce an onboard-only function's assessed confidence). |

## 4a. Assistance-level framework

| ID | Requirement |
|---|---|
| ASSIST-101 | Every assisted function shall declare an L0–L4 configured assistance level (Conventional / Monitoring / Decision Support / Supervised Execution / High Automation) and a maximum ceiling it may never exceed. No function in this POC is configured above L3, and L4 is never reached for any function. |
| ASSIST-102 | The available assistance level for a function shall be computed dynamically each tick from its ODD status: OUTSIDE caps availability at L1 (monitoring only); NEAR LIMIT caps it at L2 (decision support, extra human oversight advised); mode-not-permitted caps it at L0. |
| ASSIST-103 | An assistance-level change for any function shall be recorded to the audit trail as a first-class `assistance_level_change` event, distinct from the underlying system-state transition. |
| ASSIST-104 | At least one function (voyage speed optimisation) shall demonstrate L3 Supervised Execution: a recommended speed profile is only applied to the simulated vessel after explicit human (Master) authorisation, never automatically. |

## 5. State management and UI

| ID | Requirement |
|---|---|
| HMI-201 | Application state shall be held in a single client-side store (Zustand) exposing both the simulation state and the actions that mutate it (scenario control, decisions, hazard workflow, shore cases). |
| HMI-202 | The UI shall be composed of reusable presentational components (badges, panels, stat tiles, charts) shared across feature pages, rather than duplicated per-page markup. |
| HMI-203 | Routing shall use hash-based client-side routing so the built site works unmodified from any static host path, including GitHub Pages project sites. |
| HMI-204 | The Human Decision Centre, Digital Twin, Machinery, Navigation, Cargo, Safety, Alarms, Voyage, Maintenance, Audit, Shore and Copilot views shall all read from the same simulation store, so a scenario's effects are visible consistently across every view. |

## 6. AI / Copilot and Connected-POC service boundary

| ID | Requirement |
|---|---|
| HMI-301 | The Operations Copilot shall be implemented behind a narrow `CopilotAdapter` interface (`ask(question, context) => Promise<CopilotResponse>`) with interchangeable `deterministicCopilotAdapter` and `connectedAICopilotAdapter` implementations. |
| HMI-302 | The demonstrator's default (Offline Demonstration Mode) Copilot implementation shall derive every answer deterministically from current simulation state and shall not call any external network service. |
| HMI-303 | The Copilot shall never itself determine or override a safety verdict; it may only describe the verdicts already computed by the safety engine, and every Copilot answer shall carry an honest data-provenance tag. |
| POC-101 | Every external data source (telemetry, weather, copilot, documents, system health, audit, shore cases) shall be reachable only through an adapter interface with both a simulated/offline and a connected implementation, selected by a single POC-mode toggle. |
| POC-102 | A connected adapter that fails to reach its backend shall fall back to its offline implementation automatically, and the fallback shall be surfaced honestly in the UI (System Assurance, Command Ribbon) rather than presented as a live success. |
| POC-103 | No API key, token, or credential shall be present in frontend source, bundled output, or committed configuration. |

## 7. Real-time and animation architecture

| ID | Requirement |
|---|---|
| RT-101 | Engineering state updates (the simulation tick) shall be decoupled from visual render rate; visual motion shall be produced by requestAnimationFrame-driven interpolation, not by re-running simulation logic per frame. |
| RT-102 | Heading interpolation shall take the shortest angular path (e.g. 359°→0° shall rotate forward through 0°, never backward through 180°). |
| RT-103 | The navigation operating picture shall render own-ship and target motion continuously between engineering ticks, with historical track, predicted track and CPA/TCPA geometry recomputed every frame from the live interpolated state. |

## 8. Testing and quality

| ID | Requirement |
|---|---|
| BUS-105 | The project shall compile with strict TypeScript (`strict: true`) and zero type errors. |
| BUS-106 | The project shall pass its configured lint checks before being considered complete. |
| BUS-107 | Core deterministic logic (safety validation, alarm correlation, machinery analytics, CPA/TCPA geometry) shall be covered by unit tests, including full scenario-chain tests exercising sense→understand→predict→recommend→safety-validate→audit end to end. |
| BUS-108 | The primary human-decision journeys (accept, reject, shore-support request, comms-loss fallback and recovery, collision-risk development) shall be covered by Playwright end-to-end tests running against a production build. |
