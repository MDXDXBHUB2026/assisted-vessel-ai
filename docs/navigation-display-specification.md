# Navigation Display — Operating Specification

How the navigation operating picture must *behave*, not just how it must look. Grounded in the
published performance and presentation standards, with the demonstrator-specific reasoning stated
where it departs from them.

**Reference standards**

| Standard | Covers |
|---|---|
| IMO Res. **MSC.192(79)** — Revised performance standards for radar equipment | Range scales, range rings, orientation and motion modes, trails, vectors, CPA/TCPA alarms, target capacity |
| IMO **SN.1/Circ.243/Rev.2** — Presentation of navigation-related symbols, terms and abbreviations | Symbol shapes and colours |
| **IEC 62288** (Ed. 2022) — Presentation of navigation-related information on shipborne navigational displays | Presentation, legibility, colour, testing |

**Scope boundary.** This demonstrator follows these conventions so the picture is legible and
credible to a mariner. It is **not** type-approved radar or ECDIS, renders synthetic positions,
and must never be used for navigation. Conformance is *stylistic*, not certified.

---

## 1. Diagnosis — why the current display "looks static"

It is not a rendering problem. It is a range-scale problem, and it is arithmetic.

The range rings in the current build are labelled 12.0 / 24.0 / 36.0 / 48.0, so the display is on a
**48 NM range scale**. Own ship is making 18.5 kn.

Displacement per second of real time, as a fraction of the display radius:

```
fraction = (SOG × simMinutesPerRealSecond) / (60 × rangeNm)
```

At 1× playback (0.5 sim-minutes per real second), on a ~250 px radius:

| Range scale | Fraction of radius per second | Pixels per second | Perceptible? |
|---|---|---|---|
| **48 NM (current)** | 0.32 % | **0.8 px/s** | No — this is the bug |
| 24 NM | 0.64 % | 1.6 px/s | Barely |
| **12 NM** | 1.3 % | 3.2 px/s | Yes |
| **6 NM** | 2.6 % | 6.4 px/s | Clearly |
| 3 NM | 5.1 % | 12.8 px/s | Very |

**Motion is imperceptible because the display is zoomed out roughly 8× too far.**

Two things caused it:

1. **Auto-range is fitting the wrong thing.** It is sizing to include the next waypoint — a voyage
   -planning extent — instead of the tactical collision-avoidance picture. No watchkeeper monitors
   traffic on 48 NM.
2. **48 NM is not in the required set.** MSC.192(79): *"Range scales of 0.25, 0.5, 0.75, 1.5, 3, 6,
   12 and 24 NM should be provided."* 48 NM is outside the mandatory scales entirely. The display
   defaulted to a scale a real radar is not even required to offer.

There is a second, deeper reason, addressed in §3: the display is in **relative motion** with own
ship pinned at the centre. By construction, own ship can never move. **True motion is required**
by MSC.192(79) and is what makes a display read as alive.

---

## 2. Range scales and auto-selection

**Required scale set — exactly these, no others as primary:**

```
0.25, 0.5, 0.75, 1.5, 3, 6, 12, 24 NM
```

Remove 48 NM. If a voyage-extent view is genuinely wanted, it belongs in a separate *route
overview* panel, not on the tactical picture.

**Range rings.** An appropriate number of equally spaced rings per scale. Conventional practice is
**4 rings** at range/4 (so on 12 NM: rings at 3, 6, 9, 12). Each ring labelled with its own range,
not the outer range only.

**Auto-range selection — fit the tactical picture, never the voyage.**

Select the **smallest** scale from the set that satisfies all of:

1. Contains every target classified DANGEROUS or CAUTION, plus its vector head.
2. Contains at least the three nearest targets of any classification.
3. Contains own ship's own vector head at the selected vector time.
4. Yields perceptible motion: `(SOG × simMinutesPerRealSecond)/(60 × rangeNm) ≥ 0.01` at 1×.
   If no scale satisfies this and the other constraints, prefer the motion constraint — a display
   that reads as frozen has failed at its job.

Explicitly **do not** include the next waypoint or route extent in the auto-range fit.

Operator RANGE − / + must override auto until AUTO is pressed again. The active state must be
visibly distinct (AUTO highlighted vs manual).

Constraint 4 is a demonstrator-specific rule, not a standards requirement. It exists because this
is a compressed-time simulation being watched for minutes, not a live radar watched for hours.
Note it as such in the code.

---

## 3. Motion and orientation modes

MSC.192(79): *"A True Motion display mode should be provided"* alongside relative motion. *"North
Up and Course Up orientation modes should be provided. Head Up may be provided."*

| Mode | Behaviour | Why it matters here |
|---|---|---|
| **True Motion** (add this — currently missing) | Own ship moves across the display; targets move at their true courses and speeds; the picture resets when own ship reaches a set fraction of radius (typically 50–66 %) or on a time interval | This is the single biggest fix for "looks static". Own ship visibly travels, then resets. |
| **Relative Motion** | Own ship fixed at the display origin; target motion shown relative to own ship | Correct for collision avoidance; keep it, but it can never make own ship appear to move |

Default the demonstrator to **True Motion** on the landing view — it is the mode that shows the
vessel is under way — with Relative Motion available and clearly indicated.

Orientation: keep North Up and Course Up. The current build shows the orientation control clipped
behind the range control (see §7).

The active motion mode and orientation mode must both be displayed as text. MSC.192(79) requires
trail time and mode to be indicated; the same principle applies to motion mode.

---

## 4. Target trails — the missing "alive" cue

MSC.192(79): *"Variable length (time) target trails should be provided, with an indication of trail
time and mode."* Trails must be distinguishable from targets, and must be available again within
about two scans after a range-scale change.

Trails are absent from the current build. They are the most effective single addition for making a
picture read as moving, because they show *where everything has been*, not just where it is.

Implement:

- Selectable trail length: **OFF / 30 s / 1 min / 3 min / 6 min**, with the selection displayed.
- True trails (ground-referenced) in True Motion; relative trails in Relative Motion. Indicate
  which — a relative trail read as a true trail is a classic misinterpretation.
- Trails visually subordinate to target symbols: thinner, lower opacity, fading with age.
- Clear and rebuild trails on a range-scale or motion-mode change rather than leaving stale
  geometry on screen.

Own ship also carries a past-track trail in True Motion.

---

## 5. Targets — presentation, density and legibility

### 5.1 Traffic density

The current picture shows **one** faint target. A single contact on an open-sea display does not
read as a real operating picture.

MSC.192(79) target capacity for a ship ≥ 10,000 gt: **40 acquired radar targets, 40 activated AIS
targets, 200 sleeping AIS targets.** A container vessel display is expected to handle a busy
picture.

Raise the simulation to a credible traffic density: on the order of **12–20 targets** within the
tactical range, with a realistic mix —

- a few **activated** targets being tracked (full symbol, vector, heading line),
- the majority **sleeping** (smaller triangle, no vector) until activated,
- 1–2 developing into CAUTION or DANGEROUS during a scenario,
- varied courses, speeds and aspects — not all on the same heading.

This is a simulation change in `packages/simulator` (or `src/simulation/`), not a rendering change.
It also exercises the label de-confliction properly, which three targets never will.

### 5.2 Symbols — SN.1/Circ.243/Rev.2

| Element | Symbol |
|---|---|
| Own ship | Double circle at the reference position. Scaled outline on appropriate (close) range scales |
| Heading line | Solid, thinner than the speed vector, drawn to the bearing ring |
| Course/speed vector | Dashed, short dashes with spaces ~2× the heading line width; **two arrowheads** = ground stabilised |
| AIS sleeping target | Isosceles acute-angled triangle oriented by heading/COG, positioned at centre-half height, **smaller** than activated |
| AIS activated target | Same triangle + dashed COG/SOG vector + solid heading line of twice the triangle length; rate of turn as a flag on the heading line |
| Selected target | Square indicated by its **corners**, centred on the symbol |
| Dangerous target | **Bold red solid triangle** with vector, **flashing until acknowledged** |
| Lost target | Triangle with a bold cross, oriented per last known value, flashing until acknowledged |
| Tracked radar target | Solid filled or unfilled circle with dashed course/speed vector |
| Range rings | Solid circles |

### 5.3 Legibility

The current build is too low-contrast: range-ring labels, bearing numerals and the target outline
all sit close to the background. Requirements:

- Target symbols and range-ring labels must be clearly readable against the background at normal
  viewing distance. Raise stroke weight and luminance contrast for symbols, ring labels and
  bearing numerals.
- Do **not** convey danger by colour alone. A dangerous target must also differ in **shape weight**
  (bold/filled) and carry the flashing state, so it survives colour-vision deficiency and
  greyscale reproduction.
- IEC 62288 addresses day/dusk/night presentation. At minimum, keep one well-tested night palette
  with adequate contrast rather than a dim palette that merely looks atmospheric.

### 5.4 Labelling policy

The current build has swung from overprinting everything to labelling nothing. Neither is right.

- Label by **priority**: DANGEROUS always; CAUTION always; the selected target always; everything
  else unlabelled.
- Label content: identifier plus the one number that matters — e.g. `ALPHA  CPA 0.8` — not a full
  data dump.
- De-conflict: try candidate offsets (NE, NW, SE, SW, then further out) and take the first that
  does not overlap an already-placed label's bounding box. Never overprint own ship.
- Full data for the **selected** target goes in a side data block: range, bearing, COG, SOG, CPA,
  TCPA, aspect, and its AIS state.

---

## 6. CPA/TCPA alarm model

MSC.192(79): *"The preset CPA/TCPA limits applied to targets from radar and AIS should be
identical."* By default the alarms apply to all activated AIS targets.

- Make the CPA and TCPA limits **operator-settable** with sensible defaults — conventionally of the
  order of 1–2 NM CPA and 12–20 min TCPA in open water — and display the current settings.
- Use **one** limit pair for all target sources.
- Classification: **DANGEROUS** when CPA ≤ limit **and** 0 < TCPA ≤ limit. A negative TCPA means
  the target is opening — never dangerous, however small the historical CPA. **CAUTION** in a band
  above the limits.
- The classification is decision logic: it belongs in a pure, unit-tested module
  (`targetRisk.ts`), not inside the canvas renderer.
- A dangerous target flashes **until acknowledged** — so there must be an acknowledge action, and
  the acknowledgement should be recorded to the audit trail like any other operator action.

---

## 7. Control layout

In the current build the RANGE control box overlaps the orientation control — only "UP" is visible
behind it — and the VECTOR control is stacked on top. The bottom of the bearing ring is also
clipped by the panel edge.

- Controls sit in a single reserved strip that never overlaps the plot area or each other.
- The plot area is sized so the bearing ring and its labels are fully inside it at every viewport
  width the app supports.
- Persistently displayed, per the standards' requirement that mode and settings be indicated:
  **range scale, ring spacing, motion mode, orientation mode, vector time, trail time, CPA/TCPA
  limits**.

---

## 8. One inconsistency to resolve

Own ship's position reads **1.515°N, 103.495°E**. That is a real, identifiable location in the
Singapore Strait approaches — one of the busiest waterways in the world.

`docs/assumptions.md` item 18 justifies omitting a basemap on the grounds that it *"would
misleadingly suggest the vessel is operating in a real, identifiable location."* The coordinates
already do exactly that, and they also make the single-target picture in §5.1 implausible for that
area specifically.

Resolve it one way or the other:

- **(a)** Move the synthetic route to open ocean with no identifiable landmark, keeping item 18's
  reasoning intact; or
- **(b)** Keep the location, state plainly in `assumptions.md` that the coordinates are in the
  Singapore Strait approaches and chosen for plausible traffic density, and drop the part of item
  18 that claims the location is unidentifiable.

Either is defensible. Leaving both as they are is not.

---

## 9. Acceptance criteria

The display is done when all of these hold:

1. Range scales are exactly 0.25 / 0.5 / 0.75 / 1.5 / 3 / 6 / 12 / 24 NM. No 48 NM.
2. Auto-range fits the tactical picture, not the route, and never selects a scale at which motion
   is imperceptible.
3. True Motion exists, is the landing default, own ship visibly travels and the picture resets.
4. Target trails exist with selectable length, and the trail time and mode are displayed.
5. 12–20 targets in a realistic mix of sleeping and activated, with varied courses and speeds.
6. A dangerous target is bold, red, filled, flashing, **and** distinguishable in greyscale.
7. Only dangerous, caution and selected targets are labelled, and no two labels overlap.
8. Selected target data appears in a side block, not on the canvas.
9. No control overlaps another control or the plot; the bearing ring is never clipped.
10. Range, rings, motion mode, orientation, vector time, trail time and CPA/TCPA limits are all
    displayed.
11. `targetRisk.ts` is a pure module with unit tests, including the negative-TCPA case.
12. `docs/assumptions.md` states the stylistic-conformance boundary and resolves §8.
