# Requirements Traceability

| Business Objective | Requirement | Use Case | Component | Demo Scenario | Verification |
|---|---|---|---|---|---|
| BUS-001 Decision chain | SAFE-001, HMI-101/102 | UC-03 | `safety-engine/validate.ts`, `decision-engine/builders.ts` | ENGINE DEGRADATION | Manual: recommendation shows PASSED/CONDITIONAL/BLOCKED with check breakdown |
| BUS-001 Decision chain | SIM-004 | UC-15 | `features/audit/AuditPage.tsx`, `store/simulationStore.ts` | Any scenario | Manual: audit timeline shows scenario → alarm → recommendation → safety validation → decision chain |
| BUS-002 Reduce workload, preserve authority | HMI-003, NAV-003 | UC-04 | `features/navigation/NavigationPage.tsx` | COLLISION-RISK DEVELOPMENT | Manual: navigation authority notice always shown; no course/speed auto-change |
| BUS-002 Reduce workload, preserve authority | HMI-101 | UC-06 | `decision-engine/alarmCorrelation.ts`, `features/alarms/AlarmsPage.tsx` | ALARM CASCADE | Unit test: 7 raw alarms correlate into 2 events; manual: UI shows RAW vs CORRELATED counts |
| BUS-002 Reduce workload, preserve authority | HMI-001, HMI-002 | UC-03, UC-11 | `features/assistance/DecisionCentrePage.tsx` | Any scenario producing a recommendation | Manual: all required fields and actions present on every recommendation |
| BUS-003 Engineering narrative | BUS-003 | UC-16 | `features/architecture/ArchitecturePage.tsx`, `features/conops/ConOpsPage.tsx`, `docs/*` | n/a | Review: documents present and cross-linked |
| BUS-004 Independent, self-contained | CYBER-001, CYBER-002 | n/a | Entire `src/` tree | n/a | Manual/code review: no secrets, no real-company references |
| MACH-001–004 Machinery intelligence | MACH-101, MACH-102 | UC-03 | `decision-engine/machineryAnalytics.ts` | ENGINE DEGRADATION | Unit test: anomaly score increases monotonically with deviation |
| MACH-004 Predictive maintenance | — | UC-10 | `features/maintenance/MaintenancePage.tsx`, `simulation/baseline.ts` | n/a (static synthetic data, voyage-aware) | Manual: RUL, failure probability, spare availability rendered per item |
| NAV-001–003 Navigation | SAFE-104 | UC-04 | `simulation/navigation.ts`, `components/charts/NavPlot.tsx` | COLLISION-RISK DEVELOPMENT | Unit test: CPA/TCPA geometry against known inputs |
| ENERGY-001–002 Voyage/energy | — | UC-09 | `features/voyage/VoyagePage.tsx`, `store/simulationStore.ts` (`setVoyageSpeed`, `acceptVoyageRecommendation`) | EXCESSIVE FUEL CONSUMPTION | Manual: speed slider updates fuel/ETA; acceptance required before "adopted" |
| CARGO-001–002 Cargo/reefer | — | UC-05 | `simulation/engine.ts` (reefer branch), `features/cargo/CargoPage.tsx` | REEFER TEMPERATURE EXCURSION | Manual: unit deviates, risk escalates, recommendation generated |
| SAFE-001–003 Safety assurance | SAFE-101–104 | UC-03, UC-04, UC-08 | `safety-engine/*` | Multiple | Unit tests: PASSED/CONDITIONAL/BLOCKED verdicts for representative inputs |
| SAFE-002 Hazard management | — | UC-11 | `features/safety/SafetyPage.tsx`, `store/simulationStore.ts` (`updateHazardStatus`) | SAFETY EVENT | Manual: hazard workflow buttons transition status correctly |
| HMI-201–204 State & UI cohesion | — | UC-01, UC-02 | `store/simulationStore.ts`, all `features/*` | Any | Manual: a value changed by one scenario is reflected consistently across console, digital twin, and relevant feature page |
| HMI-301–303 Copilot | — | UC-14 | `services/copilotService.ts`, `features/assistance/CopilotPage.tsx` | Any | Manual: answers reference live state; no network calls made |
| SHORE-001–003 Shore operations | — | UC-12, UC-13 | `features/shore/ShoreCentrePage.tsx`, `store/simulationStore.ts` (`createShoreCase`, `updateShoreCase`) | Any recommendation → "Request Shore Support" | Manual: case appears in Shore Centre; lifecycle actions work |
| SIM-001–002 Simulator & scenarios | SIM-101–105 | All UC-03 through UC-11 | `simulation/engine.ts`, `simulation/scenarioEffects.ts`, `features/assistance/ScenarioControlPage.tsx` | All ten scenarios | Manual: each scenario visibly propagates across ≥2 system areas within its ramp window |
| SIM-004 Audit trail | — | UC-15 | `features/audit/AuditPage.tsx` | Any | Manual: filter by event kind; chronological order preserved |
| CYBER-001 No secrets | — | n/a | Build config | n/a | Code review: grep for API keys/secrets returns none |
| BUS-005–006 Non-functional | — | n/a | `vite.config.ts`, `tsconfig*.json`, `.github/workflows/deploy.yml` | n/a | `npm run build` succeeds; strict TypeScript passes |
| BUS-007 Console display floor | HMI-401 | n/a | `layouts/AppShell.tsx`, `components/layout/SmallScreenNotice.tsx`, `hooks/useMinViewportWidth.ts` | n/a | e2e: `e2e/small-screen-gate.spec.ts` — console gated below 900px with a live-resize toggle; landing page verified responsive at 375px with no horizontal scroll |
