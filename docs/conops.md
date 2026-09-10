# Concept of Operations (ConOps)

## 1. Purpose and scope

This ConOps describes how Assisted Vessel Intelligence is intended to operate conceptually: what the system does, who does what, and where authority sits. It is illustrated by, but broader than, the browser demonstrator — the demonstrator implements a representative subset of the concept described here.

## 2. Operational functions

- Navigation situational awareness and collision-risk advisory
- Machinery condition monitoring and anomaly detection
- Predictive maintenance planning
- Voyage and energy optimisation
- Cargo/reefer condition monitoring
- Intelligent alarm correlation
- Safety hazard management
- Human decision support and audit
- Shore-assisted specialist support

## 3. Roles

| Role | Summary |
|---|---|
| Officer of the Watch | Primary bridge watchkeeper; first reviewer of navigation and general operational recommendations. |
| Master | Overall vessel authority; decides on high-risk and voyage-level recommendations; accountable for safety decisions. |
| Chief Engineer | Technical authority for machinery and maintenance recommendations. |
| Shore Marine Operations | Fleet-level operational oversight; supports navigational and operational queries on request. |
| Shore Technical Support | Specialist machinery/maintenance guidance on request. |
| Shore Safety Support | Specialist safety/incident guidance on request. |
| Fleet Performance / Energy (shore) | Reviews voyage and energy efficiency trends across the fleet. |

## 4. Operating modes

OPEN SEA, COASTAL, TRAFFIC SEPARATION, CONGESTED WATERS, PORT APPROACH, MANOEUVRING, ANCHORED, ALONGSIDE.

Each assisted function declares which of these modes it is available in (see the Operational Envelope screen and `safety-engine/oddFunctions.ts`). A function outside its permitted mode is not offered, regardless of how favourable other conditions are.

## 5. Human authority model

Human operational authority is never bypassed. Every recommendation, regardless of confidence or urgency, is presented for review, and every consequential outcome is the result of an explicit human decision (or an explicit human delegation to a shore specialist). The system's role is to **shorten the path from data to a well-evidenced decision**, not to shorten the decision itself out of the loop.

### AI can:
Observe · Correlate · Detect · Predict · Optimise · Retrieve · Recommend · Explain

### AI cannot:
Assume command · Override the Master · Silently control navigation · Silently change propulsion · Bypass safety constraints · Execute high-risk actions without authority

## 5a. Assistance-level framework

| Level | Name | Behaviour |
|---|---|---|
| L0 | Conventional | Crew performs the operational function; the system does not assist it. |
| L1 | Monitoring | System observes, correlates and alerts. No recommendation is generated. |
| L2 | Decision Support | System analyses and recommends; a human decides. This is the default level for most assisted functions in this POC. |
| L3 | Supervised Execution | A specifically permitted, low-risk action may proceed only after explicit human authorisation (demonstrated here by voyage-speed adoption). |
| L4 | High Automation | Future conceptual capability only — not implemented for any safety-critical function in this POC, and no function is configured to reach it. |

Each assisted function is configured independently and its *available* level is recalculated every simulation tick from the operational envelope, sensor confidence, connectivity and system health — see the in-app Envelope & Assistance view for the live per-function state.

## 6. Interaction model

1. The system continuously senses and understands vessel condition (digital twin).
2. Analytics and rules predict developing conditions and, where thresholds are crossed, generate recommendations.
3. Every recommendation passes an independent safety validation before it can be shown as actionable.
4. The Human Decision Centre presents the recommendation with full evidence and required authority.
5. A human accepts, modifies, rejects, requests more information, or escalates to shore.
6. Outcomes are monitored on the same views that raised the condition, and every step is recorded to the audit trail.

## 7. Fallback behaviour and system boundaries

- **Loss of ship-shore communications**: communications system state moves to DEGRADED then FALLBACK; onboard assistance continues unaffected; shore-dependent functions (those declaring `requiresCommunications`) become unavailable and are shown as OUTSIDE OPERATIONAL ENVELOPE with the specific limiting factor named; the event is notified to the crew and recorded to the audit trail.
- **GNSS/sensor confidence degradation**: navigation-dependent functions restrict as confidence falls below their declared threshold; the crew is advised to cross-check position by alternate means.
- **Machinery contingency**: at high anomaly scores the main-engine system state moves to CONTINGENCY and machinery recommendations escalate to require Chief Engineer authority.
- **General principle**: a function whose supporting condition is unmet degrades gracefully to "unavailable" or "advisory-only" rather than silently continuing to offer full-confidence recommendations.

## 8. System boundaries

- The system does not connect to, or exchange data with, any real vessel, sensor, or shore system.
- The system does not provide navigational or engineering advice for actual operational use.
- The system does not simulate, request, or perform autonomous control of steering, propulsion, machinery, or cargo equipment.
