# Product Requirements

## 1. Purpose

Assisted Vessel Intelligence is a technology demonstrator exploring how digitalisation, analytics, optimisation, deterministic safety logic and generative-AI concepts could support container-vessel and shore operations while preserving human operational authority. This document defines the product-level requirements the demonstrator implements.

## 2. Requirement classification

Every requirement below is tagged with one of three classifications:

- **REGULATORY / ENGINEERING BASELINE** — reflects a widely recognised maritime safety, human-factors, or engineering-assurance principle (e.g. keeping a human in the loop for high-risk decisions, maintaining an audit trail).
- **PROBABLE OPERATOR REQUIREMENT** — a requirement judged likely to matter to a generic maritime operator, based on common industry practice. This is **not** attributed to any named or real company.
- **DEMO IMPLEMENTATION** — a requirement whose purpose is to make the concept demonstrable and legible in a browser prototype (e.g. adjustable playback speed), not a claim about a production system.

## 3. Business objectives

| ID | Objective |
|---|---|
| BUS-001 | Demonstrate a credible decision chain (Sense → Understand → Predict → Recommend → Safety Validate → Explain → Human Decision → Controlled Action → Monitor Outcome → Audit) for vessel and shore operations. |
| BUS-002 | Show how analytics, optimisation and generative-AI concepts can reduce crew workload without displacing human operational authority. |
| BUS-003 | Provide a reusable engineering narrative (requirements, use cases, architecture, ConOps) suitable for discussing AI-assisted maritime operations with a technical or engineering audience. |
| BUS-004 | Keep the demonstrator fully self-contained, deployable as a static site, and free of any real-company branding or data. |

## 4. Functional requirement areas

### Navigation (NAV)
| ID | Requirement | Classification |
|---|---|---|
| NAV-001 | The system shall display own-ship position, heading, speed, and route against a synthetic chart plot. | DEMO IMPLEMENTATION |
| NAV-002 | The system shall track synthetic target vessels and compute CPA/TCPA and a relative risk classification. | PROBABLE OPERATOR REQUIREMENT |
| NAV-003 | The system shall never simulate autonomous control of rudder, heading, or speed; navigation authority statements shall be shown wherever navigation recommendations appear. | REGULATORY / ENGINEERING BASELINE |

### Machinery (MACH)
| ID | Requirement | Classification |
|---|---|---|
| MACH-001 | The system shall monitor main-engine thermal and lubrication parameters against baseline and compute an anomaly/health score. | PROBABLE OPERATOR REQUIREMENT |
| MACH-002 | The system shall present probable condition, confidence, consequence and recommended response for detected machinery anomalies. | PROBABLE OPERATOR REQUIREMENT |
| MACH-003 | Machinery degradation shall be gradual and observable over time rather than an instantaneous failure. | DEMO IMPLEMENTATION |

### Predictive Maintenance (MAINT, grouped under MACH for traceability)
| ID | Requirement | Classification |
|---|---|---|
| MACH-004 | The system shall estimate remaining useful life, failure probability, and recommend a maintenance opportunity considering the current voyage. | PROBABLE OPERATOR REQUIREMENT |

### Energy & Voyage (ENERGY)
| ID | Requirement | Classification |
|---|---|---|
| ENERGY-001 | The system shall compare current, recommended and user-modified speed profiles with fuel and CO₂ impact. | PROBABLE OPERATOR REQUIREMENT |
| ENERGY-002 | Voyage speed changes shall require explicit human acceptance before being marked adopted. | REGULATORY / ENGINEERING BASELINE |

### Cargo / Reefer (CARGO)
| ID | Requirement | Classification |
|---|---|---|
| CARGO-001 | The system shall monitor synthetic reefer containers for temperature excursions and recommend crew response. | PROBABLE OPERATOR REQUIREMENT |
| CARGO-002 | No real customer, container, or cargo data shall be used or implied. | REGULATORY / ENGINEERING BASELINE |

### Safety (SAFE)
| ID | Requirement | Classification |
|---|---|---|
| SAFE-001 | The system shall run an independent, deterministic safety validation on every recommendation before it may be shown as actionable, returning PASSED, CONDITIONAL, or BLOCKED. | REGULATORY / ENGINEERING BASELINE |
| SAFE-002 | The system shall maintain a hazard register with likelihood, severity, exposure, mitigation and residual risk, and a structured acknowledge/assign/investigate/escalate/close workflow. | REGULATORY / ENGINEERING BASELINE |
| SAFE-003 | A BLOCKED recommendation shall never be presented as executable. | REGULATORY / ENGINEERING BASELINE |

### Human-Machine Interface & Decision Support (HMI)
| ID | Requirement | Classification |
|---|---|---|
| HMI-001 | Every recommendation shall present recommendation ID, timestamp, detected condition, source data, confidence, risk, expected benefit, safety validation, ODD status, required authority and evidence. | REGULATORY / ENGINEERING BASELINE |
| HMI-002 | The system shall provide Accept / Modify / Reject / Request More Information / Request Shore Support actions for every recommendation. | REGULATORY / ENGINEERING BASELINE |
| HMI-003 | High-risk recommendations shall require explicit human acceptance and shall never execute automatically. | REGULATORY / ENGINEERING BASELINE |
| HMI-004 | A command-level top bar shall always show operating mode, overall status, connectivity, active recommendation count, simulated time and playback controls. | DEMO IMPLEMENTATION |

### Shore Operations (SHORE)
| ID | Requirement | Classification |
|---|---|---|
| SHORE-001 | The system shall provide a Shore Assisted Operations Centre with a fleet operational picture and specialist functions (Marine Operations, Technical Support, Safety Support, Fleet Performance). | PROBABLE OPERATOR REQUIREMENT |
| SHORE-002 | A vessel shall be able to raise a shore assistance request with function, priority, reason and requested expertise; shore shall be able to accept, review, guide, return, or close the case. | PROBABLE OPERATOR REQUIREMENT |
| SHORE-003 | Shore guidance shall never remove operational authority from the vessel. | REGULATORY / ENGINEERING BASELINE |

### Simulation & Scenarios (SIM)
| ID | Requirement | Classification |
|---|---|---|
| SIM-001 | The system shall provide a synthetic vessel data simulator with play, pause, speed and reset controls. | DEMO IMPLEMENTATION |
| SIM-002 | The system shall provide at least the ten specified scenario buttons, each of which shall propagate effects across multiple system areas (machinery, alarms, recommendations, safety validation, audit). | DEMO IMPLEMENTATION |
| SIM-003 | Scenario effects shall ramp in progressively rather than appearing as an instantaneous toast notification. | DEMO IMPLEMENTATION |
| SIM-004 | The system shall maintain a chronological, filterable audit trail of scenario, recommendation, safety-validation, decision, alarm, and system-state events for the duration of the session. | REGULATORY / ENGINEERING BASELINE |

### Cybersecurity (CYBER)
| ID | Requirement | Classification |
|---|---|---|
| CYBER-001 | No API keys or secrets shall be embedded in frontend code. | REGULATORY / ENGINEERING BASELINE |
| CYBER-002 | A production realisation would apply the conceptual security posture described in [architecture.md](architecture.md) (secure ship-shore synchronisation, least-privilege data layer); this prototype has no live attack surface beyond a static page. | DEMO IMPLEMENTATION |

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| BUS-005 | The application must build and run as a static site deployable to GitHub Pages, with no backend dependency. |
| BUS-006 | The codebase must be written in strict TypeScript with a clean, feature-oriented directory structure. |
| BUS-007 | The operations console must follow a cohesive operations-centre visual language and requires a desktop-class display (≥900px); below that width it must show an explicit notice rather than a broken or misleading layout. The landing page is exempt from the 900px floor and must remain fully responsive down to phone widths, so a mobile visitor still receives the value proposition and disclaimers. |
