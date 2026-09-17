# Safety Intelligence — Operating Specification

How the safety view must behave: risk identification, quantified assessment, lifecycle, ownership
and escalation. Grounded in the IMO methodology rather than a generic corporate risk chart.

**Reference standards**

| Standard | Covers |
|---|---|
| IMO **MSC-MEPC.2/Circ.12/Rev.2** — Revised Guidelines for Formal Safety Assessment | Frequency Index, Severity Index, Risk Index, risk evaluation criteria, ALARP |
| **ISM Code** (International Safety Management Code) | Risk assessment duty, hazardous-occurrence reporting, investigation, corrective action, Master's overriding authority |

**Scope boundary.** This demonstrator applies the FSA risk indices and the ISM reporting lifecycle
so the safety view is legible and credible to a maritime professional. It is not a certified SMS,
uses synthetic hazards, and is not for operational use.

---

## 1. Diagnosis — what is wrong with the current view

| # | Defect | Why it matters |
|---|---|---|
| 1 | **No risk matrix.** Risk is stated only as words — "Likelihood: Possible", "Severity: Major", "Residual risk: Medium". | The matrix is the central artifact of maritime risk assessment. Every SMS has one. Its absence is the most conspicuous gap. |
| 2 | **Generic corporate risk vocabulary,** not the IMO scale. | "Possible / Major / Medium" could be any industry. FSA gives a maritime-specific, citable, quantified scale. |
| 3 | **Residual risk shown without initial risk.** | Residual risk is only meaningful as a *movement* from inherent risk. Showing one number hides what the mitigation actually bought. |
| 4 | **The workflow is not a workflow.** Status reads `acknowledged` while ACKNOWLEDGE, ASSIGN, INVESTIGATE, ESCALATE and CLOSE are all simultaneously enabled. You can acknowledge an already-acknowledged hazard, or close one that was never investigated. | Five independent buttons, no state machine. Identical in kind to the safety checks that could not fail: a control that renders as meaningful but enforces nothing. |
| 5 | **No time dimension.** Raised 21:27, clock reads 23:50 — open 2h23m, stated nowhere. No target response time, no overdue state. | ISM requires hazardous occurrences to be reported and investigated. Without elapsed time and a target, there is no way to see a stalled item. |
| 6 | **No ownership beyond a static label.** "Responsible role: Chief Officer" is text, not an assignment with a timestamp and an accountable holder. | |
| 7 | **No linkage.** The safety event generated a recommendation, alarms and audit records. None are reachable from here. | The decision chain is the product's thesis; this page breaks it. |
| 8 | **No trend or history.** One card, no register view, no movement over time. | |
| 9 | **No "future steps"** — only a static "Recommended corrective action" sentence. Nothing states what happens next, who does it, by when, or what escalation looks like. | |

### 1.1 A deeper architectural gap

The command ribbon shows **SYSTEM STATE: CRITICAL** alongside **OPERATIONAL ENVELOPE: INSIDE ODD**.

A bilge high-level alarm with a watertight-integrity implication is an active flooding hazard, and
the operational envelope reports it as fully satisfied. Checking `safety-engine/oddFunctions.ts`,
the ODD parameters are: operational mode, visibility, wave height, GNSS, radar, AIS, chart data,
communications, sensor confidence, data latency, traffic density (informational) and machinery
health (informational).

**There is no hazard or safety input to the operational envelope at all.** An active critical
safety hazard cannot constrain any assisted function.

For a system whose thesis is *conditions constrain assistance*, that is a real hole. A vessel with
suspected flooding should not be offering the same assistance levels as one in nominal condition.
See §6.

---

## 2. Risk model — FSA Frequency and Severity Indices

Replace the generic likelihood/severity words with the IMO FSA indices.

### Frequency Index (FI) — logarithmic

| FI | Label | Definition | Frequency (per ship-year) |
|---|---|---|---|
| 7 | Frequent | Likely to occur once per month on one ship | 10 |
| 5 | Reasonably Probable | Likely to occur once per year in a fleet of 10 ships | 0.1 |
| 3 | Remote | Likely to occur once per year in a fleet of 1,000 ships | 10⁻³ |
| 1 | Extremely Remote | Likely to occur once in the lifetime (20 years) of a world fleet of 5,000 ships | 10⁻⁵ |

Intermediate values 2, 4 and 6 are interpolable.

### Severity Index (SI)

| SI | Level | Effects on human safety | Effects on ship |
|---|---|---|---|
| 1 | Minor | Single or minor injuries | Local equipment damage |
| 2 | Significant | Multiple or severe injuries | Non-severe ship damage |
| 3 | Severe | Single fatality or multiple severe injuries | Severe damage |
| 4 | Catastrophic | Multiple fatalities | Total loss |

### Risk Index (RI)

FSA states `Risk = Probability × Consequence`, therefore
`log(Risk) = log(Probability) + log(Consequence)`, giving:

```
RI = FI + SI          range 2 … 11
```

This is the key property to exploit visually: because the scale is logarithmic and additive,
**equal-RI cells lie on diagonals** of the matrix. Draw those diagonals — they are the iso-risk
contours, and they make the matrix read as a quantified instrument rather than a coloured grid.

### Risk evaluation criteria

FSA is explicit that no universally accepted acceptance criteria exist and that the criteria used
**must be stated explicitly** in each application. So state them, and label them as this project's
own rather than as a standard:

| RI band | Region | Required response |
|---|---|---|
| 2–4 | Broadly acceptable | Monitor. No further action required. |
| 5–7 | **ALARP** (tolerable if As Low As Reasonably Practicable) | Mitigation required; justify residual risk. |
| 8–11 | Intolerable | Immediate control required; Master informed; escalate to Company. |

Record in `docs/assumptions.md` that these bands are the demonstrator's own explicit criteria,
adopted because FSA requires explicit criteria and prescribes none.

---

## 3. The risk matrix — presentation requirements

A 4 (SI) × 7 (FI) matrix, rendered as a real instrument:

1. **Axes labelled with both index and meaning** — e.g. `SI 3 — Severe` — never bare numbers.
2. **Iso-risk diagonals** drawn, with RI values marked. This is what makes it FSA rather than a
   generic heat map.
3. **ALARP region shaded** and labelled.
4. **Every open hazard plotted** as a marker on the matrix, not just the selected one. This is the
   register at a glance.
5. **Initial and residual risk both plotted, joined by an arrow** from initial to residual. The
   arrow *is* the value of the mitigation, and its absence is defect #3.
6. **Selected hazard highlighted** on the matrix and cross-highlighted in the register list.
7. **Cell occupancy counts** where multiple hazards share a cell.
8. **Not colour alone.** RI value printed on each marker, and marker shape differing by band, so
   the matrix survives greyscale and colour-vision deficiency.
9. **Live.** When a hazard's status changes or a mitigation is applied, the marker moves, with a
   short transition so the movement is visible. This directly answers "no animated information".

---

## 4. Hazard lifecycle — a real state machine

ISM Code 9.1 requires non-conformities, accidents and hazardous situations to be *reported to the
Company, investigated and analysed*. ISM 9.2 requires procedures for implementing corrective
action, *including measures intended to prevent recurrence*.

That is a lifecycle, not a button row.

```
IDENTIFIED
    └─ acknowledge ──▶ ACKNOWLEDGED
                           └─ assign ──▶ ASSIGNED
                                             └─ begin investigation ──▶ UNDER_INVESTIGATION
                                                      └─ record corrective action ──▶ CORRECTIVE_ACTION
                                                               └─ verify effectiveness ──▶ CLOSED
   any state ── escalate ──▶ ESCALATED ──▶ (returns to ASSIGNED or CORRECTIVE_ACTION)
```

**Rules:**

- Only the transitions legal from the current state may be offered. Everything else is **disabled
  with the reason shown**, not hidden — the operator should see that CLOSE exists and why it is
  not available yet.
- **CLOSED requires** a recorded corrective action and a verification of effectiveness (ISM 9.2's
  prevention-of-recurrence requirement). A hazard cannot go straight from acknowledged to closed.
- **ESCALATED** is available from any open state and represents ISM 9.1's *reported to the
  Company* step. It must name who it was escalated to.
- Every transition writes an audit event with the actor, role, timestamp and any note — the same
  audit trail as every other decision.
- Put the state machine in a pure, unit-tested module — `src/decision-engine/hazardLifecycle.ts`
  or equivalent — exporting the legal transitions and a `canTransition()` predicate. The UI asks
  the module; it does not encode the rules itself. Test every illegal transition explicitly.

**Master's overriding authority.** ISM 5.2 gives the Master overriding authority and responsibility
to request the Company's assistance as may be necessary. An intolerable-band hazard (RI 8–11) must
surface a Master decision, consistent with the human-authority model used everywhere else in this
application.

---

## 5. Time, ownership and "future steps"

Every open hazard shows:

- **Age** since raised, live-updating — the current card hides a 2h23m open item.
- **Target response time** by RI band (e.g. intolerable: immediate; ALARP: 4h; acceptable: next
  review), with an **OVERDUE** state when exceeded, distinct in shape as well as colour.
- **Current owner** — role plus when it was assigned, not a static label.
- **Next required action** stated as an imperative with its owner and due time — this is the
  "future steps" that is currently missing. Derive it from the state machine, do not hand-write it.
- **Escalation path** — who this goes to next if it is not resolved.

## 5.1 Register view

The single-card view must become a **register**: all hazards, sortable and filterable by RI band,
status, age, overdue, category and owner, with the matrix beside it and selection synchronised
both ways. A summary strip gives counts by band and by status, and the count overdue.

---

## 6. Linkage — close the decision chain

From a hazard, the operator must be able to reach:

- the **recommendation** it generated, in the Human Decision Centre;
- the **alarms** correlated to it;
- its **audit trail** entries;
- its **ODD / assistance-level impact** (see below).

And the reverse: a recommendation should link back to its originating hazard.

**The ODD gap (§1.1).** Feed active hazards into the operational envelope. A hazard in the
intolerable band affecting watertight integrity, propulsion or steering should constrain the
available assistance level — at minimum the same treatment as an outside-envelope parameter.

This is a safety-engine change and must go through the safety-engine review process:

- Add a hazard-derived parameter to the ODD assessment.
- Extend `AssistedFunctionDefinition` so each function declares which hazard categories constrain
  it — flooding constrains different functions than a cargo hazard.
- Add property-based tests asserting that an intolerable hazard can never leave every function at
  full assistance.
- Update `validate.properties.test.ts` so the new check is covered by the "no check is decorative"
  property.

Do **not** make this change casually — it alters safety-engine behaviour. Run the `safety-reviewer`
agent in `.claude/agents/` over it before committing.

---

## 7. Acceptance criteria

1. FI, SI and RI are used throughout; generic likelihood/severity wording is gone.
2. A 4 × 7 matrix is rendered with iso-risk diagonals, marked RI values and a shaded ALARP region.
3. Every open hazard is plotted; initial and residual risk are both shown, joined by an arrow.
4. RI bands and their required responses are displayed, and `docs/assumptions.md` records them as
   the project's own explicit criteria per FSA.
5. Only legal state transitions are offered; illegal ones are disabled **with the reason visible**.
6. CLOSED is unreachable without a recorded corrective action and a verification.
7. Every transition writes an audit event with actor, role, timestamp and note.
8. The lifecycle is a pure, unit-tested module; every illegal transition has a test.
9. Age, target response time, OVERDUE state, current owner and next required action are all shown.
10. A register view exists with filtering, sorting and a summary strip, synchronised with the matrix.
11. A hazard links to its recommendation, alarms and audit entries, and back.
12. Risk band is not conveyed by colour alone — RI is printed and marker shape differs by band.
13. Matrix markers move visibly when risk changes.
14. The ODD hazard gap in §6 is either implemented with tests, or explicitly recorded in
    `docs/assumptions.md` as a known limitation with its rationale. Not left silently open.
