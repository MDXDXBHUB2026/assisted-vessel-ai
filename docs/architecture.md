# System Architecture

## 1. Conceptual layered architecture

```
VESSEL SYSTEMS
(AIS, GNSS, Radar, ECDIS/Route Information, Engine, AMS/IAS, Electrical Power,
 Fuel, PMS, Cargo, Reefers, Safety Systems, Sensors)
        │
        ▼
VESSEL INTEGRATION GATEWAY
        │
        ▼
STANDARDISED MARITIME DATA LAYER
        │
        ▼
VESSEL OPERATIONAL STATE / DIGITAL TWIN
        │
        ▼
RULE ENGINE · ANALYTICS / ML · OPTIMISATION
        │
        ▼
DECISION FUSION
        │
        ▼
SAFETY ASSURANCE
        │
        ▼
ASSISTANCE MANAGER
        │
        ▼
CREW HMI
        │
        ▼
HUMAN OPERATIONAL AUTHORITY
        │
        ▼
SECURE SHIP-SHORE SYNCHRONISATION
        │
        ▼
SHORE ASSISTED OPERATIONS
```

All vessel-system connections above the "Vessel Integration Gateway" line are **conceptual interfaces** in this prototype. No real equipment is connected; the same shape of data is instead produced by the browser-based simulation engine described below. This diagram is also rendered interactively in-app at `/architecture`.

## 2. How the prototype realises each layer

| Conceptual layer | Prototype realisation |
|---|---|
| Vessel Systems | `src/simulation/baseline.ts`, `src/data/*` — synthetic starting values and identities |
| Vessel Integration Gateway / Standardised Data Layer | `src/types/*` — a single shared TypeScript type system all features consume |
| Vessel Operational State / Digital Twin | `src/simulation/state.ts` (`SimulationState`) held in `src/store/simulationStore.ts` |
| Rule Engine / Analytics / ML / Optimisation | `src/decision-engine/*` (machinery analytics, recommendation builders, alarm correlation) |
| Decision Fusion | `src/simulation/engine.ts` `tick()` — orchestrates which analytics fire and merges results into state |
| Safety Assurance | `src/safety-engine/*` (`oddEngine.ts`, `validate.ts`) — independent of the decision engine |
| Assistance Manager | Recommendation lifecycle fields (`status`, `decidedByRole`, `outcome`) plus shore-case creation in the store |
| Crew HMI | `src/features/*`, `src/components/*`, `src/layouts/AppShell.tsx` |
| Human Operational Authority | The Human Decision Centre (`src/features/assistance/DecisionCentrePage.tsx`) — every consequential action requires an explicit decision call |
| Secure Ship-Shore Synchronisation | Modelled as `communications` state (link up/down, confidence, latency) driving fallback behaviour; a real implementation would add an encrypted transport here |
| Shore Assisted Operations | `src/features/shore/ShoreCentrePage.tsx`, `ShoreCase` records in the store |

## 3. Source tree

```
src/
  app/                 Application-level composition (reserved for future app-shell logic)
  components/
    ui/                Badge, Panel, Button, StatTile, ProgressBar, Tabs, Modal
    layout/            TopBar, SideNav
    charts/            Sparkline, NavPlot
  layouts/             AppShell (top bar + side nav + routed content)
  features/
    vessel/            Assisted Console, Digital Twin
    navigation/         Navigation situational awareness
    machinery/          Machinery Intelligence
    maintenance/        Predictive Maintenance
    voyage/             Voyage & Energy Intelligence
    energy/             (voyage/energy share one feature; reserved for split-out)
    cargo/              Cargo / Reefer Intelligence
    safety/             Safety Intelligence
    alarms/             Intelligent Alarm Management
    assistance/         Operational Envelope, Human Decision Centre, Copilot, Scenario Control
    shore/              Shore Assisted Operations Centre
    audit/              Decision Audit Trail
    architecture/       Interactive architecture view
    landing/            Landing / marketing page
    conops/             Concept of Operations page
  simulation/           Baseline state, tick engine, navigation/alarm/health helpers, scenario effects
  decision-engine/      Machinery analytics, recommendation builders, alarm correlation
  safety-engine/        Operational envelope (ODD) definitions & assessment, safety validation
  services/             copilotService (swappable AI service boundary)
  data/                 Static synthetic reference data (vessel identity, route, fleet, voyage plan)
  hooks/                useSimulationLoop, useMetricHistory
  store/                simulationStore (Zustand)
  types/                Shared TypeScript domain types
  utils/                random/geo/format/theme helpers
docs/                   This documentation set
.github/workflows/      GitHub Pages deployment workflow
```

## 4. Decision-chain data flow (single tick)

1. **Sense** — `tick()` advances simulated time, position, and every continuous sensor-like value via a mean-reverting random walk toward a scenario-dependent target.
2. **Understand** — `recomputeSystemHealth()` and `analyseMainEngine()` turn raw values into health/anomaly scores and system states (NORMAL/DEGRADED/FALLBACK/CONTINGENCY).
3. **Predict** — predictive-maintenance figures and voyage/energy projections are computed from current trends and baselines.
4. **Recommend** — when a scenario-specific threshold is crossed, a builder in `decision-engine/builders.ts` produces a `RecommendationContent`.
5. **Safety Validate** — `safety-engine/validate.ts` independently checks operational mode, ODD, sensor confidence, source-system availability and authority-gating, returning PASSED / CONDITIONAL / BLOCKED.
6. **Explain** — the recommendation carries evidence, confidence, model/rule ID and the safety-validation breakdown, all shown in the Human Decision Centre.
7. **Human Decision** — a human role (or shore specialist) accepts, modifies, rejects, requests more information, or requests shore support. Nothing executes automatically.
8. **Controlled Action** — for this prototype, "action" is represented by the decision's `outcome` field (e.g. adopted speed profile, hazard status change) — no vessel system is actually actuated.
9. **Monitor Outcome** — subsequent ticks continue to reflect the vessel's evolving condition, which the crew observes on the same views.
10. **Audit** — every step above appends a structured `AuditEvent` to the persistent-for-session audit trail.

## 5. State management

A single Zustand store (`useSimulationStore`) holds the entire `SimulationState` plus the actions that mutate it. Feature components subscribe to only the slices they need. The simulation clock (`useSimulationLoop`) ticks the store roughly once per second (via a Web Worker where available, to remain accurate even in a throttled/backgrounded tab), scaled by elapsed real time and the selected speed multiplier — never by a fixed step — so the demo remains correct if the browser delays or batches callbacks.

## 6. Security posture (conceptual)

| Concern | Prototype posture | Real-system posture (conceptual) |
|---|---|---|
| Secrets | None present; none required | Managed via a backend secret store, never shipped to the browser |
| Ship-shore transport | Simulated link state only | Authenticated, encrypted transport with store-and-forward on link loss |
| Data layer access | In-memory client state | Role-scoped access to the standardised data layer, least-privilege by function |
| Safety logic integrity | Deterministic TypeScript, code-reviewable | Would require independent verification & validation and change control (see [conops.md](conops.md)) |
