# V4 — Assurance Review and Remediation

Record of the defects found in the V3 codebase by an independent quality and security review, and
what was changed in response. Written so the reasoning survives after the details are forgotten.

**Review date:** 16–17 September 2026
**Baseline reviewed:** `f8abac4` — *V3: real-time engine, canvas navigation picture, streaming telemetry, Demo Voyage*

Every defect below survived a green build: at baseline, `oxlint` passed, `tsc -b` passed under
strict mode, and 33 unit tests passed. That is the point worth remembering — none of these were
findable by the toolchain, and none had been reviewed, because no review agent had ever been run
against this repository.

---

## 1. The headline defects

### 1.1 The traceability matrix asserted verification that did not exist

`src/data/traceability.ts` cited eight Playwright specs — `blocked-recommendation`,
`gnss-degradation`, `collision-risk`, `reefer-excursion`, `communication-loss`,
`human-acceptance`, `human-rejection`, `shore-support-request`. None had ever been written; `e2e/`
contained two files, neither on that list. The phantom names rendered in green on the Requirements
& Verification page as the evidence column.

For a project whose entire thesis is engineering-assurance rigour, an artifact that overstates its
own evidence is the most damaging defect available to it.

**Changed.** Every row now cites a file that exists, with the specific test name where the
coverage is partial. `TraceabilityRow` gained a `verificationStatus` of `verified` / `partial` /
`not_verified`, rendered as a distinct badge rather than colouring every row green.
`src/data/traceability.test.ts` now fails the build if any cited test file or component path does
not resolve on disk, if a row claims `verified` without citing an automated test, or if a row
claims `not_verified` while citing one. This class of drift is now structurally impossible.

### 1.2 BLOCKED was unreachable — the third verdict tier was dead code

Running all nine scenarios for 400 ticks each produced six `passed`, one `conditional` and **zero
`blocked`**. Two causes:

- `passed: Boolean(requiredAuthority)` — `RequiredAuthority` is a required, non-optional union of
  nine non-empty string literals, so in typed code this is always `true`.
- No code path produced `riskLevel: 'severe'`. All six builders cap at `'high'`, and
  `overallHealthToRisk` declares `'severe'` in its return type while mapping `critical → 'high'`.

The headline PASSED / CONDITIONAL / BLOCKED gate had two reachable states.

**Changed.** The authority check is now `isRequiredAuthority()`, a real runtime guard against an
absent or unrecognised value arriving from an untyped boundary — the only way that field can
actually be wrong. BLOCKED is now reached by five independent, genuinely reachable conditions:
invalid authority, function not permitted in the current operational mode, assistance ceiling
breached, a dead source-data feed, and a high- or severe-risk action assigned to a shore/advisory
role (SHORE-003 — shore guidance never removes operational authority from the vessel).

### 1.3 A check that could not fail, guarding a ceiling that was never enforced

`'Assistance level does not exceed configured ceiling'` was hardcoded `passed: true`. Worse,
`AssistedFunctionDefinition.maxAssistanceLevel` — documented as *"may never exceed, regardless of
conditions"* — had **zero reads anywhere in the codebase**. The ceiling was declared, rendered as
a passing check, and never enforced.

A check hardcoded to pass is worse than no check, because it renders to the operator as validated.

**Changed.** `assessOdd` now clamps the available level to the declared ceiling, the validation
check compares the two for real, and a breach is a blocking failure.

### 1.4 Source-system availability could never fail, and its semantics were inverted

The check gated on `relevantHealth.confidence >= 40`, fed from
`machineryAnalysis.confidencePercent`, which is clamped to `[50, 96]` — so it could never fail for
machinery functions. And `confidencePercent` **rises as the engine degrades**: it is the model's
confidence in its own anomaly call, consumed as though it described source-system availability.

At `anomalyScore 100 / healthScore 5` — the worst the model can express — the safety sheet
reported seven green ticks including *"Source system availability confirmed — confidence 96%"*.

**Changed.** `SystemHealthSummary` gained `dataAvailabilityPercent` and `availabilityStatus`,
derived in `health.ts` from sensor and feed liveness only — never from a health or confidence
score. Implausible readings are treated as a broken sensor, not as an extreme-but-valid
measurement. The safety engine gates on availability; the existing `confidence` field remains,
documented explicitly as *not* an availability signal.

### 1.5 The L3 supervised-execution path bypassed the safety engine entirely

`acceptVoyageRecommendation` is the only action in the application that actually changes vessel
behaviour — the adopted speed becomes the commanded speed in the engine. It called neither
`validateRecommendation` nor `assessOdd`, did not check operational mode, and wrote an audit event
hardcoding *"Master accepted … L3 supervised execution"* with `responsibleRole: 'master'`
regardless of conditions or of who clicked. Accepting it while Alongside adopted the speed and
recorded an authorised L3 execution, while the ODD for that same function reported
`L0 — Not offered in Alongside`.

`traceability.ts` named this function as the mitigation for *HAZ-OPS-04 Unintended speed change
without human authorisation*.

**Changed.** The action now validates through the safety engine, refuses on a blocked verdict or
below L3 availability, records the refusal as a `safety_validation` audit event, and reports the
actual authorising role and the verdict actually computed. The compiler caught a second hazard
while this was being fixed: `onClick={acceptVoyageRecommendation}` passed the React
`MouseEvent` as the authorising role.

### 1.6 Nothing gated on the verdict

ACCEPT / MODIFY / REJECT rendered unconditionally and `decideRecommendation` never read
`safetyValidation.verdict`. *"A BLOCKED recommendation is never presented as executable"* was
unimplemented — masked only by BLOCKED being unreachable.

**Changed.** ACCEPT and MODIFY are disabled on a blocked recommendation and refused in the store
even if invoked directly; the refused attempt is itself written to the audit trail, since an
operator trying to action a blocked recommendation is exactly the event an audit trail exists to
capture. REJECT, REQUEST INFORMATION and REQUEST SHORE SUPPORT remain available.

---

## 2. Integrity and correctness

| Defect | Evidence | Change |
|---|---|---|
| **Duplicate audit IDs.** `resetEnvironment` restarted the ID counter at 1 while deliberately retaining prior events. A reset→run→reset→run probe produced 21 events with **10 duplicate IDs**. Store actions minted from `Date.now()` while the engine used a counter — two schemes and two clocks in one ledger, with `AUD-CASE-` shared between two actions. | Runtime probe | One ID authority (`mintId`), one meaning for `nextIdCounter` (last issued), carried across resets. Shore cases keep a readable `CASE-0001` form via their own persistent sequence. Uniqueness is now asserted by test. |
| **The PRNG was frozen in the default state.** Seeded from `scenarioElapsedMinutes`, which decays to exactly 0 in normal operations, the seed was the constant `43` forever and the first draw `0.99981` on every tick. The "mean-reverting random walk" was applying an identical near-maximal bias each tick — steady-state values sat measurably off target and the charts flatlined on the landing state. | Runtime probe | Seeded from a monotonic `tickCount` that never resets. Determinism is preserved: the same tick index yields the same draw. |
| **Safety verdicts went stale silently.** A verdict was computed once at generation time and never refreshed. Change mode, degrade GNSS, and the card still showed the original green PASSED badge and a check-list describing conditions that no longer held. `'expired'` was a declared `DecisionStatus` that was never assigned. | Code review | Undecided recommendations are re-validated every tick, with an audit event whenever a verdict actually changes; recommendations undecided for 240 simulated minutes expire with an audit event. |
| **`safety_event` could not genuinely re-fire.** `maybeFire('safety_event_rec', true, …)` is only ever called with `condition === true`, so its reset branch never ran and the flag latched for the session. A second safety event raised a hazard with no recommendation, no safety validation and no audit of either. | Code review | The trigger is reset alongside `safety_hazard`. |
| **Duplicate collision recommendations.** An oscillating condition re-fired, stacking near-identical cards. A product whose stated value is reducing crew workload through correlation was flooding its own decision channel. | Code review | De-duplicated while an equivalent recommendation is still awaiting a decision. |
| **Unbounded growth.** `auditEvents` and `recommendations` grew without limit; `syncQueueCount` incremented by an arbitrary `+1` per tick, reaching 436 over 500 ticks that generated 10 events; `newAuditEvents.reverse()` mutated in place mid-expression. | Runtime probe | Both collections capped; the queue counts records actually queued; the reverse is non-mutating. |
| **Stale adapter probes could overwrite newer ones.** Two probes could be in flight; with a 2.5s timeout the older was frequently the slower, so it won. | Code review | Generation guard. |
| **Auxiliary machinery health was hardcoded `healthy`**, so it could never be reported as degraded and could never reach `overallHealth`. | Code review | Derived from its own health score. |
| **Values exactly at a stated ODD limit were classified `outside`.** Visibility of exactly 2.0 nm violated *"Requires ≥ 2 nm"*. | Code review | Boundary corrected to `< 0`; boundary cases at `min`, `min ± ε`, `max`, `max ± ε` are now tested. |
| **Source-system availability checked the wrong system for three of six functions.** Everything non-machinery was checked against `navigation`, so a shore-sync recommendation reported *"source system availability confirmed — all navigation sensors nominal"* while the satellite link was down. | Code review | `requiredSourceAreas` declared per assisted function and checked against those areas, failing closed when a required area is absent. |
| **The Copilot provenance tag was hardcoded `"calculated"`** — the strongest-trust label in the application — on text that in connected mode is generative (`ai_generated`), sitting inches from the safety verdict being decided on. Violated HMI-303. | Code review | The tag tracks the adapter's actual provenance. |

---

## 3. Test quality

The baseline suite was 33 green assertions. A material fraction could not fail.

- **Both BLOCKED tests exercised inputs the system cannot produce** — one passing
  `undefined as unknown as 'chief_engineer'` (the cast existing precisely because the type makes
  it impossible), the other passing `riskLevel: 'severe'`, which no builder emits. Together they
  gave the verdict 100% apparent coverage while it was unreachable in production.
- **The test guarding the project's central claim asserted nothing.** *"…without moving own-ship
  course/speed autonomously"* captured `initialHeading`, then wrote `void initialHeading` —
  explicitly discarding the one comparison that would have given it meaning — and asserted instead
  that a heading is a number, is not `NaN`, and is not `undefined`.
- **Tautological assertions**: `expect(['passed','conditional','blocked']).toContain(verdict)`
  where `SafetyVerdict` *is* that union; `toBeDefined()` on a field with a `?? 'inside'` default.
- **Conditional assertions** wrapped in `if (rec) { … }`, passing silently when the path never ran.
- **A re-activation test that could not fail**: it reconstructed `scenarioTriggers: {}` by hand
  rather than exercising the engine's own reset, and its final assertion was already satisfied by
  the first run's output.

**Changed.** 33 tests became 81, across three new suites:

- `validate.properties.test.ts` — property-based verification with `fast-check` over the whole
  reachable ODD parameter space: determinism, verdict totality, PASSED implies every check passed,
  outside-envelope never PASSED, mode-not-permitted always BLOCKED, SHORE-003 gating, ceiling never
  exceeded, L4 never reached, margins always finite in `[0,1]`, and — most usefully — **every check
  must fail for at least one reachable input**. That property immediately found two checks that
  cannot fail through the typed API; both are genuine defensive guards, so they are declared in an
  explicit `DEFENSIVE_CHECKS` allowlist with a written rationale, each covered by a targeted test
  that forces the guarded condition, with a further test capping the allowlist size so checks
  cannot be neutralised by adding them to it.
- `boundaries.test.ts` — the safety engine's independence was previously true **by convention**;
  nothing would have caught a future import across the boundary. It is now enforced: no React, no
  services, no store, no features, no decision-engine, no Node, no I/O, no `Date.now()`, no
  `Math.random()`. Plus explicit generative-AI containment checks in both directions.
- `traceability.test.ts` — described in 1.1.
- The collision test is now a differential test: the same engine run with and without the scenario
  active, asserting own-ship heading, speed and position are identical.

---

## 4. Security

An independent security review confirmed **CYBER-001 / POC-103 hold**: no secret, key, token or
credential anywhere in the tree, and no code path capable of attaching one. `npm audit` reported
0 vulnerabilities across 196 packages. There were **zero** HTML/JS injection sinks — no
`dangerouslySetInnerHTML`, `innerHTML`, `eval` or `document.write` anywhere. `localStorage` reads
were already validated against an allowlist with a safe default.

The weaknesses found were all latent, at the connected-POC boundary:

| Finding | Change |
|---|---|
| `response.json() as T` with no runtime validation — a compile-time lie. A malformed body reached the UI and, with no error boundary, could take the console down mid-scenario. Unvalidated weather data is also the one path by which a hostile backend could influence a displayed safety verdict, since it feeds `snapshot.environment`, which the ODD engine reads for visibility and wave-height. | `attemptConnectedCall` takes an optional runtime validator and rejects a non-JSON content type; validators added for the copilot, weather and document-search adapters. Weather values are range-checked as well as type-checked — an implausible reading is a broken sensor, not a valid extreme. A failed validation is treated exactly like a network failure. |
| `VITE_API_BASE_URL` accepted any string as the base for all eight endpoints. Build-time only, so not user-influenceable — but a misconfiguration or compromised CI could point it at an arbitrary host, after which every human decision including free-text comments would be POSTed there. | Constrained at module load: relative paths always allowed, absolute URLs must be HTTPS, anything else falls back to `/api`. |
| `credentials` defaulted implicitly to `same-origin`. | Set explicitly to `'omit'`, so a future edit cannot quietly widen it. |
| No Content-Security-Policy. | Added — see the caveat in §6 below. |
| The build job held `pages: write` and `id-token: write` while running `npm ci` (arbitrary package lifecycle scripts). | Least privilege at workflow level; elevated permissions scoped to the deploy job only. |
| `${{ github.event.repository.name }}` interpolated directly into shell. Not exploitable — GitHub repository names contain no shell metacharacters, and the trigger set is push-to-main and `workflow_dispatch` only — but it is the pattern that gets copied somewhere it *is* dangerous. | Passed through the environment. |
| `date-fns` and `framer-motion` declared with zero imports — install-script attack surface for no benefit. | Removed. |

---

## 5. Pipeline

`.github/workflows/deploy.yml` previously ran a step labelled *"Type check, lint and test"* that
ran lint and test only; type-checking happened implicitly inside the build. BUS-108 asserts
Playwright coverage of the primary human-decision journeys, and the pipeline did not run
Playwright at all.

Now: separate named `verify` (lint, explicit `tsc -b`, unit and property tests) and `e2e` jobs,
both gating the build, with the Playwright report uploaded on failure, and pull requests verified
without deploying.

---

## 6. One defect this work introduced, and what it teaches

Adding the Content-Security-Policy froze the simulation clock. The policy's `script-src 'self'`
blocked the Blob-URL Web Worker that drives the tick (`useSimulationLoop.ts`), which exists to
escape background-tab timer throttling. The failure mode is quiet and instructive: a worker
blocked by CSP **does not throw from the constructor** — it constructs and simply never posts a
message — so the existing `try/catch` fallback to `setInterval` never engaged. The UI kept
reporting "running" while simulated time sat at 02:00.

Every unit test still passed, because Node has no CSP. Only the end-to-end suite caught it — which
is the argument for the `e2e` CI job in §5, made concrete.

**Fixed** by adding `worker-src 'self' blob:` and by replacing the ineffective `try/catch` with a
watchdog: if no tick arrives within three intervals, the worker is abandoned and `setInterval`
takes over. The console can no longer freeze silently in any CSP-restricted deployment.

**Known limitation, stated rather than papered over:** `frame-ancestors` is ignored in `<meta>`
form and requires a real response header. GitHub Pages cannot set headers, so this deployment has
no clickjacking protection.

---

## 7. What was deliberately left alone

The review confirmed several things are genuinely well-built, and they were not touched:

- **The safety-engine boundary is real** — one-way dependencies, pure functions, no I/O, no
  framework, no generative-AI reachability. Verified by import graph, not by assertion. It is now
  pinned by a test so it stays that way.
- **`relevantSensorConfidence` and the shore-latency scoping** — scoping sensor confidence and
  ship-shore latency to the domains a function actually depends on, so a comms outage cannot
  throttle onboard machinery monitoring. The best piece of domain modelling in the repository.
- **`marginFraction` as a continuous quantity** rather than a boolean, driving a three-state
  `near_limit` band. Only the boundary comparison needed correcting.
- **The multivariate machinery analytics** — deviation, OLS slope, persistence and cylinder spread
  over a real bounded rolling window, with correct `n < 3` and zero-denominator guards.
- **`utils/geo.ts`** — the CPA/TCPA relative-motion solve is textbook-correct, including the
  degenerate parallel-motion case.
- **The adapter fallback pattern** — a real `fetch` with a timeout that never reports failure as
  success, and visibly labels fallback output.
- **The Canvas2D navigation picture and 2D topology** in place of a WebGL basemap and a 3D twin.
  `assumptions.md` items 18–19 give the correct reasoning: a real-world basemap over synthetic
  geography would misleadingly imply a real, identifiable position.
- **The scope disclaimers.** Independent demonstrator, entirely synthetic data, no affiliation
  with any operator, class society or vendor, not for operational use. Unchanged.

---

## 8. Known limitations that remain

Stated plainly, because an assurance artifact that hides its gaps is the thing this review
existed to prevent.

1. **The authority model is labelling, not enforcement.** There is no authenticated identity, no
   session and no server-side authorisation. The audit trail attributes decisions to a role that
   was never authenticated, so it demonstrates the *shape* of an accountability record without its
   evidentiary value. Correct for a browser-only demonstrator; it must never be described as more.
2. **The audit trail is session-lifetime and not tamper-evident.** A page refresh clears it, and
   nothing prevents it being rewritten. Hash-chaining is the next structural step.
3. **No e2e coverage** for the reefer excursion, GNSS degradation or blocked-recommendation
   journeys. The matrix says so.
4. **No clickjacking protection** on this deployment (§6).
5. **Git history has not been scanned for secrets.** The working copy reviewed had no `.git`, so
   `gitleaks` or equivalent should be run against the real repository.
6. **Models are illustrative, not calibrated.** Unchanged from `assumptions.md` items 5–9.

---

## 9. Verification status of this work

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npx tsc -b` (strict) | clean |
| `npm run test` | 81 passed / 9 files |
| `npm run build` | succeeds |
| `npm run test:e2e` | 7 passed |
| `npm audit` | 0 vulnerabilities |

Three review agents are now defined under `.claude/agents/` — `safety-reviewer`,
`assurance-auditor` and `security-reviewer` — so this review is repeatable rather than a one-off.
None existed before; that is why these defects reached V3.
