# Use Cases

Each use case names the primary actor, trigger, main flow and the requirement(s) it demonstrates. All use cases are demonstrated with synthetic data via the Scenario Control Centre.

## UC-01 — Monitor Overall Vessel Status
**Actor:** Officer of the Watch / Master
**Trigger:** Opening the Assisted Console.
**Flow:** The console displays operating mode, position, speed, engine load, fuel rate, active alarms, system health summary and recommendations awaiting decision, all sourced from one shared simulation state.
**Requirements:** HMI-004, HMI-204

## UC-02 — Investigate a System via the Digital Twin
**Actor:** Any crew role
**Trigger:** Clicking a system tile on the Digital Twin.
**Flow:** A detail panel opens showing health, state, a live trend sparkline, active events for that system, and any associated recommendations.
**Requirements:** HMI-202, HMI-204

## UC-03 — Detect and Respond to Main Engine Degradation
**Actor:** Chief Engineer
**Trigger:** Activating the ENGINE DEGRADATION scenario (or organic drift in a long-running session).
**Flow:** Exhaust temperature deviation and lubricating oil pressure drift from baseline → anomaly/health scores recompute → machinery system state moves NORMAL → DEGRADED → CONTINGENCY → alarms raise → a recommendation is generated and safety-validated → Chief Engineer reviews evidence and accepts, defers, or rejects → outcome recorded to audit trail.
**Requirements:** MACH-001–004, SAFE-001, HMI-001–003, SIM-002

## UC-04 — Evaluate a Developing Collision Risk
**Actor:** Officer of the Watch
**Trigger:** Activating the COLLISION-RISK DEVELOPMENT scenario.
**Flow:** A synthetic target's course is steered toward a closing solution; CPA/TCPA are recomputed each tick; when CPA drops inside threshold, a navigation recommendation is generated advising evaluation of course alteration, speed reduction, or enhanced monitoring — never an automatic helm command.
**Requirements:** NAV-001–003, SAFE-101–103

## UC-05 — Manage a Reefer Temperature Excursion
**Actor:** Officer of the Watch
**Trigger:** Activating the REEFER TEMPERATURE EXCURSION scenario.
**Flow:** One monitored reefer unit's actual temperature drifts from its set point; risk classification escalates; an alarm and a recommendation are raised; the Cargo/Reefer view highlights the affected unit and recommended action.
**Requirements:** CARGO-001–002

## UC-06 — Correlate an Alarm Cascade
**Actor:** Officer of the Watch / Chief Engineer
**Trigger:** Activating the ALARM CASCADE scenario.
**Flow:** Multiple related raw alarms fire across main engine and electrical power; the alarm correlation engine groups them into correlated operational events with a probable common cause and a single recommended crew response, reducing the number of items requiring individual triage.
**Requirements:** HMI-101

## UC-07 — Operate Through a Ship-Shore Communication Loss
**Actor:** Officer of the Watch / Shore Marine Operations
**Trigger:** Activating the SHIP-SHORE COMMUNICATION LOSS scenario.
**Flow:** Satellite confidence degrades and the link drops; the communications system state moves to FALLBACK; onboard assistance functions continue; shore-dependent functions (Operational Envelope) show as unavailable; the event is notified and recorded to the audit trail.
**Requirements:** SIM-002, SAFE-104, HMI-204

## UC-08 — Operate Under GNSS/Sensor Degradation
**Actor:** Officer of the Watch
**Trigger:** Activating the GNSS / SENSOR DEGRADATION scenario.
**Flow:** GNSS confidence falls; navigation assistance functions move outside their operational envelope on the Operational Envelope screen with the limiting factor identified; a recommendation advises cross-checking position by alternate means.
**Requirements:** NAV-003, SAFE-104

## UC-09 — Optimise Voyage Speed and Energy
**Actor:** Master
**Trigger:** Opening Voyage & Energy Intelligence, or activating EXCESSIVE FUEL CONSUMPTION.
**Flow:** Current, recommended and user-modified speed/fuel/ETA scenarios are compared; the Master adjusts the proposed speed and observes the fuel/CO₂ consequence; acceptance is required before the recommendation is marked adopted.
**Requirements:** ENERGY-001–002

## UC-10 — Predict Maintenance Needs
**Actor:** Chief Engineer
**Trigger:** Opening Predictive Maintenance.
**Flow:** For each monitored component, running hours, remaining useful life, failure probability, predicted failure mode, spare availability and next suitable opportunity are displayed, considering the current voyage.
**Requirements:** MACH-004

## UC-11 — Respond to a Safety Event
**Actor:** Master / Chief Officer
**Trigger:** Activating the SAFETY EVENT scenario.
**Flow:** A hazard is raised with risk, likelihood, severity, exposure and mitigation; the crew acknowledges, assigns, investigates, escalates or closes it; a linked recommendation requires Master-level decision.
**Requirements:** SAFE-002–003, HMI-001–003

## UC-12 — Request Shore Support
**Actor:** Officer of the Watch / Chief Engineer → Shore Technical/Marine/Safety Support
**Trigger:** Selecting "Request Shore Support" on a recommendation, or manually raising a request from the Shore Centre.
**Flow:** A shore case is created carrying function, priority, reason and requested expertise; a shore specialist accepts the case, reviews evidence, provides guidance, and returns or closes the case; onboard authority is never removed.
**Requirements:** SHORE-001–003

## UC-13 — Review Fleet-Wide Operational Picture
**Actor:** Shore Marine Operations
**Trigger:** Opening the Shore Assisted Operations Centre.
**Flow:** A table of fictional fleet vessels shows operational mode, assistance status, risk, communications and open request counts, alongside open cases grouped by specialist function.
**Requirements:** SHORE-001

## UC-14 — Ask the Operations Copilot
**Actor:** Any crew or shore role
**Trigger:** Asking a suggested or free-text question in the Operations Copilot.
**Flow:** The copilot inspects current simulation state (machinery analysis, alarms, recommendations, shore cases, communications) and returns a state-grounded answer with cited evidence sources.
**Requirements:** HMI-301–303

## UC-15 — Review the Decision Audit Trail
**Actor:** Any role / auditor
**Trigger:** Opening the Audit Trail and filtering by event kind.
**Flow:** A chronological, filterable list of scenario activations, mode changes, recommendations, safety validations, human decisions, alarms, system-state changes and shore cases is displayed with model/rule ID, confidence, safety result, decision and outcome.
**Requirements:** SIM-004

## UC-16 — Explore the System Architecture and ConOps
**Actor:** Engineering / technical stakeholder
**Trigger:** Opening System Architecture or Concept of Operations from the Engineering section.
**Flow:** An interactive layered-architecture view and a ConOps page describing roles, modes, AI-can/cannot boundaries and fallback behaviour are presented for technical review.
**Requirements:** BUS-003
