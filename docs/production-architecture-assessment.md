# Production Architecture Assessment

**Assisted Vessel Intelligence — independent review of completion, goal alignment, and the path to a production-level architecture**

| | |
|---|---|
| Reviewed | 16 September 2026 |
| Repository | `D:\Assisted Vessel AI` (local), `github.com/MDXDXBHUB2026/assisted-vessel-ai` (remote) |
| Local HEAD | `f8abac4` — *V3: real-time engine, canvas navigation picture, streaming telemetry, Demo Voyage* |
| Remote `origin/main` | `25943a8` — *Bump CI Node version to 22* |
| Reviewer scope | Static review of source, docs, tests, CI and git state. The application was not executed. |

---

## 1. Recommendation

**Do not attempt to evolve this repository into a production shipboard system. It is the wrong target, and it would destroy what the project is currently good at.**

Instead, take the demonstrator to *production-grade software quality* and publish the *production architecture* as a designed, partially-implemented, standards-referenced artifact. Where a real runtime is worth building, build it for the shore-side, non-safety-critical slice — the only slice that can legitimately be productionised without class approval and a vendor-scale assurance programme.

Three target states are credible. Only one is worth your time now.

| Option | What it means | Effort | Verdict |
|---|---|---|---|
| **A — Production-grade reference architecture + hardened demonstrator** | Same demonstrator, but built as production-quality software: extracted domain core, independently versioned safety engine, tamper-evident audit, enforced module boundaries, generated traceability, a safety case, and a fully specified (not fully built) production architecture. | 4–6 weeks part-time | **Recommended — do this** |
| **B — Production shore-side analytics platform** | Narrow to fleet performance / condition monitoring / voyage optimisation as *advisory shore software*. Real backend, real time-series store, real identity, multi-tenant. No class approval needed because nothing runs on a classed vessel. | +6–10 weeks on top of A | Optional extension if you want a live SaaS to demo |
| **C — Production shipboard system** | Type approval, class software assurance, cyber resilience conformity, FMEA, independent V&V, flag-state engagement. | Multi-year, vendor-scale, seven figures | **Not viable solo — name it, scope it, park it** |

The reason Option A wins is not modesty. It is that a hiring manager, a class surveyor, or a technical panel assesses you on *architecture judgement, assurance reasoning and standards literacy* — all of which Option A demonstrates directly — and not on whether you personally shipped a classed shipboard product, which nobody expects a single engineer to have done.

---

## 2. Current state: what actually exists

### 2.1 Completion against the project's own stated goal

Against its stated goal — *a technology demonstrator of a human-authority-preserving decision chain* — the project is **substantially complete, not partially complete**. This is an important distinction. It is not "80% of a product". It is closer to **100% of a demonstrator and ~5% of a product**, because the remaining 95% of a production system is everything beneath the UI, which by design does not exist here.

| Stated capability | Status | Evidence |
|---|---|---|
| Ten-step decision chain, Sense → Audit | Implemented end-to-end | `simulation/engine.ts` `tick()` orchestrates sense → analyse → correlate → recommend → validate → audit in one pass |
| Independent deterministic safety validation | Implemented, unit-tested | `safety-engine/validate.ts`, 5 tests covering PASSED / CONDITIONAL / BLOCKED and mode-denial paths |
| ODD with continuous margins | Implemented, better than specified | `oddEngine.ts` returns `marginFraction` per parameter, not a boolean — this is genuinely good design |
| Function-scoped sensor confidence | Implemented | `relevantSensorConfidence()` prevents a comms outage from throttling an onboard-only function. This is a real engineering insight, correctly reasoned in the code comment |
| Latency scoped to comms-dependent functions only | Implemented | `oddEngine.ts` — onboard functions keep full envelope through a comms outage |
| L0–L4 assistance framework with dynamic availability | Implemented | Recomputed per tick from ODD status; `assistance_level_change` is a first-class audit event kind |
| L3 supervised execution, human-authorised | Implemented | `acceptVoyageRecommendation()` — speed profile applies only after explicit Master authorisation |
| Connected-POC adapter boundary with honest fallback | Implemented | `connectedGateway.ts` performs a real `fetch` with timeout; never fakes a success |
| Real-time decoupling (tick vs render) | Implemented | Worker-driven ~1 Hz tick + rAF interpolation; shortest-path heading interpolation handles 359°→0° |
| Scenario chain tests | Implemented | 10 scenario tests exercising sense→audit per scenario |
| End-to-end acceptance journeys | Implemented | 5 Playwright journeys incl. comms-loss fallback and recovery |
| Engineering documentation set | Implemented | 7 documents, cross-linked, with classification tags on every requirement |

**Quality observations worth keeping.** The requirement classification scheme (REGULATORY / PROBABLE OPERATOR / DEMO IMPLEMENTATION) is unusually disciplined and does real work — it stops the document from implying operator endorsement it does not have. The disclaimers in `README.md` and `assumptions.md` are correctly scoped: independent, synthetic, unaffiliated, not for operational use. Keep that discipline exactly as it is.

### 2.2 Defects and drift found

| # | Finding | Severity | Location |
|---|---|---|---|
| 1 | **Two commits of work are unpushed.** `origin/main` sits at the second commit. The entire V2 (assistance levels, ODD hardening, POC adapters, maritime theme) and V3 (real-time engine, canvas navigation, streaming telemetry, Demo Voyage) work exists only on your machine. | **High** | git |
| 2 | **The public demonstrator does not exist.** Both `github.com/MDXDXBHUB2026/assisted-vessel-ai` and `mdxdxbhub2026.github.io/assisted-vessel-ai/` return 404 to an anonymous request — the repository is private, or Pages is not enabled, or both. The README documents a deployment that nobody outside your machine can reach. | **High** | GitHub |
| 3 | **The safety engine contains a check that cannot fail.** In `validate.ts`, "Assistance level does not exceed configured ceiling" is hardcoded `passed: true`. It renders as a passing check in the UI but validates nothing. In the one layer whose value is its independence, a decorative check is worse than no check. | **High** | `safety-engine/validate.ts` |
| 4 | **The traceability matrix has drifted behind the code.** It references `components/charts/NavPlot.tsx` and `services/copilotService.ts` — neither exists (now `NavigationCanvas.tsx` and `services/adapters/copilotAdapter.ts`). The entire V2/V3 requirement set (SAFE-105/106, ASSIST-101–104, POC-101–103, RT-101–103, BUS-107/108) has no rows at all. Most verification cells still read "Manual:" although automated tests now cover them. | **High** — it undermines the project's central claim of assurance rigour | `docs/requirements-traceability.md` |
| 5 | **CI does not run the end-to-end suite.** BUS-108 asserts Playwright coverage of the primary human-decision journeys; `deploy.yml` runs `lint` and `test` only. The requirement is claimed but not enforced. | Medium | `.github/workflows/deploy.yml` |
| 6 | The CI step is labelled "Type check, lint and test" but performs lint and test only; type-checking happens later, inside the build step. Cosmetic, but it is the kind of thing an assurance reviewer notices. | Low | `.github/workflows/deploy.yml` |
| 7 | An OUTSIDE-envelope condition yields CONDITIONAL, not BLOCKED. This is defensible (advisory-only presentation) and documented, but it means the "never presented as executable" guarantee rests entirely on UI behaviour rather than on the verdict. Worth an explicit design note. | Low — design question, not a bug | `safety-engine/validate.ts` |
| 8 | Audit IDs use `Date.now()` in the store, whereas the engine uses a deterministic counter. Mixed identity strategies make replay and test determinism harder. | Low | `store/simulationStore.ts` |

### 2.3 What is absent by design (and is the real production gap)

No persistence. No identity or authentication. No authorisation enforcement beyond a UI role selector. No multi-vessel or multi-tenant model. No backend. No data ingestion. No time-series store. No model lifecycle. No key management. No observability. No deployment topology beyond a static bundle.

None of these are oversights — the ConOps and assumptions documents state them plainly. They are listed here because **they constitute the production system**, and any credible "path to production" is a plan to build them, not a plan to extend the SPA.

---

## 3. The architectural problem with the current design

The demonstrator is well-factored *for a demonstrator*. Three properties make it unsuitable as a production foundation:

**1. Independence is by convention, not by construction.** The safety engine lives in its own folder and is disciplined about it. But it ships in the same bundle, from the same build, with the same version number, from the same repository, verified by the same test run as the code it is supposed to independently constrain. In an assurance argument, "independent" means *separately specified, separately versioned, separately verified, and separately deployable*. Today it means "a different directory".

**2. The audit trail is a React array.** `AuditEvent[]` in a Zustand store, session-lifetime, mutable, unordered by anything but insertion. For a project whose thesis is human accountability, this is the weakest link. An audit trail that a page refresh erases and that nothing prevents rewriting is a narrative, not evidence.

**3. Authority is decorative.** `requiredAuthority` is compared against a role the user picked from a control. There is no principal, no authentication, no signature, no server-side enforcement. The L3 speed-adoption gate — the single most important control in the whole concept — is a client-side `if`.

These three are the correct first targets, and all three can be fixed without building a backend.

---

## 4. Target architecture

### 4.1 Structural move: extract the domain core

Split the monolith into a workspace monorepo (pnpm workspaces + Turborepo — both free):

```
packages/
  core-domain/        Types, units, enums. Zero dependencies. Zero I/O.
  safety-engine/      ODD + validation. Pure. Independently versioned. 100% branch coverage gate.
  decision-engine/    Analytics, correlation, recommendation builders. Depends on core-domain only.
  simulator/          Synthetic data generation. Depends on core-domain only.
  contracts/          OpenAPI / JSON-Schema definitions for every service boundary.
apps/
  web/                React SPA. The only package allowed to import React.
  api/                Shore service (Phase 2+).
  edge/               Vessel-side runtime (Phase 3+).
```

Why this is the highest-leverage change: the same engine then runs in a browser, in Node, and in a test harness. It makes golden-file regression testing possible. It lets the safety engine carry its own version, changelog and verification evidence. And it converts "the generative layer must never influence the verdict" from a code comment into a structural fact.

**Enforce the boundaries mechanically**, not by review:
- `dependency-cruiser` rule in CI: `safety-engine` may not import `decision-engine`, any generative/assistive package, `react`, or anything performing I/O. Build fails otherwise.
- ESLint `no-restricted-imports` mirroring the same rules in the editor.

### 4.2 Make the safety engine a verifiable artifact

| Change | Why |
|---|---|
| Own semantic version + changelog, published independently | An assurance argument needs to cite a specific verified version |
| Pure: `now` and any randomness passed in as parameters | Deterministic replay; reproducible verification |
| Property-based tests (`fast-check`, free) over the ODD parameter space | Invariants such as *OUTSIDE never yields PASSED*, *no authority ⇒ BLOCKED*, *verdict is monotone in severity* are far stronger evidence than 5 worked examples — and this is exactly what an independent V&V reviewer asks to see |
| 100% branch coverage enforced as a CI gate for this package only | Proportionate rigour: strict where it matters, pragmatic elsewhere |
| Fix the hardcoded ceiling check | Compare `assistanceLevelRank(available) ≤ assistanceLevelRank(maxAssistanceLevel)` |
| Emit a **decision record hash** per verdict: `SHA-256(engineVersion ‖ rulesetVersion ‖ canonicalInputDigest)` | Makes every verdict independently reproducible from the record alone |

### 4.3 Tamper-evident audit trail

Replace the array with an append-only, hash-chained log:

```
event.prevHash = previous.hash
event.hash     = SHA-256(prevHash ‖ canonicalJSON(event))
```

**Status: the chain itself is done (Phase 1C, `packages/core-domain/src/auditChain.ts`) — the
persistence and server pieces below are not.** Every record now carries `seq`/`prevHash`/`hash`,
sealed incrementally outside the simulation tick, with a sealed-prefix checkpoint and an eviction
boundary anchoring both ends against tampering, deletion and reordering — see
`docs/assumptions.md` items 23 and 36 for exactly what this does and does not establish
(tamper-EVIDENT, not non-repudiable; still client memory, still cleared by a refresh). What
remains outstanding from this section:

- Browser/demo tier: IndexedDB, survives refresh. *(Still in-memory only — cleared by a refresh.)*
- Server tier: Postgres append-only table, `UPDATE`/`DELETE` blocked by trigger and by role grants.
- Verification endpoint that walks the chain and reports the first broken link. *(`verifyChain`
  exists and is exposed in the Audit page's Chain Integrity panel; there is no server-side
  endpoint, because there is no server.)*

This is cheap, needs no new infrastructure, and it is the difference between an audit trail a surveyor would accept and one they would not.

### 4.4 Standards-based data model (do this before building any backend)

Stop inventing field names. Adopt **ISO 19848** *(Ships and marine technology — standard data for shipboard machinery and equipment)* and DNV's Vessel Information Structure for tag identity; DNV publishes an open-source [Vista SDK](https://github.com/dnv-opensource/vista-sdk) for it. `exhaustTempDeviationC` becomes a standards-addressable data channel with a defined local ID.

The cost is a few days of remapping. The return is that your data model stops being *plausible* and becomes *conformant* — which is an unusually strong signal in a maritime technical conversation, and it is the single change most likely to be noticed by someone who knows the domain.

Pair it with **ISO 19847** for shipboard data servers, and the **IEC 61162 series** for onboard interface families (verify the specific part numbers against current published editions before citing them in a deliverable).

### 4.5 Three-tier runtime split by criticality

This is the most important idea to be able to articulate, because it is how safety-related systems are genuinely partitioned — and it is the direct answer to *"how do you use generative AI safely in a maritime setting?"*

| Tier | Runs where | Contains | Rules |
|---|---|---|---|
| **1 — Safety-relevant** | Vessel edge | Deterministic decision engine, safety/ODD engine, local hash-chained audit, local persistence | Must function with zero connectivity. May never depend on shore, on a network call, or on a language model. Containerised, signed, version-pinned. |
| **2 — Business-critical** | Shore platform | Fleet aggregation, ML training and inference, RUL models, benchmarking, case management, reporting | May be unavailable without affecting vessel safety functions. Store-and-forward on both sides of the link. |
| **3 — Assistive** | Shore or cloud | Explanation, document retrieval, natural-language querying over state | Strictly read-only with respect to verdicts. **No import path** to the safety engine. No write access to the recommendation store. Every output provenance-tagged. |

Your current code already respects this in spirit — `copilotAdapter.ts` tags every answer with provenance and the deterministic adapter never calls out. Tiering formalises it and makes it enforceable.

### 4.6 Identity, authority and non-repudiation

- OIDC via **Keycloak** (free, self-hostable) or an equivalent. Role claims map to `RequiredAuthority`.
- Every decision signed by the authenticated principal; the signature stored in the audit record.
- **Server-side** enforcement that only a Master-role principal can authorise an L3 speed adoption. Client-side gating stays as UX, not as the control.
- Least-privilege data access per role, per function.

### 4.7 Model lifecycle

`modelId: 'ME-Anomaly-Detector', modelVersion: 'v2.3.1'` is currently a string literal. Production needs a registry (**MLflow**, free, self-hostable), training-data lineage, drift monitoring, per-model operating domain (models have ODDs too), shadow deployment and rollback. Every recommendation should carry the version *actually loaded at runtime*, resolved from the registry — not a constant.

### 4.8 Continuous assurance

| Change | Effect |
|---|---|
| Tag tests with requirement IDs — `it('SAFE-103: returns BLOCKED when authority absent', …)` — and **generate** `requirements-traceability.md` from the test run | The matrix stops drifting. It has already drifted; generating it is the only durable fix |
| Write a **safety case** (GSN-style: goal → strategy → solution → evidence) alongside the requirements list | This is what a class society actually reviews. A flat requirements table is not a safety argument |
| Promote the ODD to a controlled specification document and **generate** `oddFunctions.ts` from it | The envelope becomes a reviewable artifact rather than hand-maintained code |
| Run Playwright in CI; add `axe` accessibility checks | Closes the BUS-108 gap; bridge-equipment ergonomics (night vision, contrast, touch targets) are a genuine maritime HMI concern |

---

## 5. Regulatory and standards positioning

Current as of 16 September 2026. Verify before quoting externally.

| Instrument | Status | Relevance to this project |
|---|---|---|
| **IMO MASS Code** | Adopted at MSC 111 (13–22 May 2026). Non-mandatory code in force from **1 July 2026**; mandatory instrument planned for **1 January 2032 at the earliest**. Goal-based and technology-neutral; applies to cargo ships; a human master remains responsible and must retain the ability to intervene; Remote Operation Centres require flag-state certification. | **Direct and very favourable.** Your L0–L4 framework, your human-authority model, and your never-displace-the-Master thesis map straight onto the Code's core principle. This was adopted four months ago — referencing it correctly is a strong, current signal |
| **IACS UR E26** (cyber resilience of ships) / **UR E27** (cyber resilience of on-board systems and equipment) | Revised versions apply to new ships **contracted for construction on or after 1 July 2024**. Original January 2024 versions withdrawn | Defines the cyber posture any production realisation must meet. Your `docs/architecture.md` §8 security table should cite E26/E27 explicitly rather than describing a generic posture |
| **EU AI Act** | Digital Omnibus reached provisional political agreement (May 2026), deferring high-risk obligations: Annex III standalone to **2 Dec 2027**, Annex I embedded-in-regulated-product to **2 Aug 2028**. Not yet formally adopted or published in the Official Journal at the time of the cited sources. Article 50 transparency obligations remain on the original **2 Aug 2026** date | A production version deployed in the EU would likely land in the Annex I embedded category. The deferral is a planning window, not a removal |
| **ISO 19848 / ISO 19847** | Published | Data model and shipboard data server standards — adopt now, see §4.4 |
| Class software and integration requirements for programmable systems | Applies to shipboard computer-based systems | Verify the exact IACS UR references and current editions with the relevant class society before citing specific numbers in any external deliverable |

**One honesty boundary to preserve.** The project correctly states no affiliation with any operator, class society or vendor, and uses only synthetic data. Keep that in every artifact, exactly as it reads today. Referencing a standard is legitimate; implying conformity assessment, class review or endorsement would not be.

---

## 6. What not to do

Stated plainly, because the temptation in each case is real:

- **Do not add more feature pages.** There are already 21 routes. Breadth has passed the point of diminishing returns; every additional page dilutes the ones that carry the argument.
- **Do not add a 3D digital twin or a map basemap.** `assumptions.md` items 18–19 already give the correct, defensible reasoning for their absence. That reasoning reads as engineering judgement. Reversing it would read as decoration.
- **Do not wire a live LLM into the Copilot for its own sake.** The deterministic, state-grounded copilot is *more* persuasive in a safety conversation than a chatty one. If you add a generative layer, add it as an explicitly bounded Tier 3 with an enforced module boundary and a documented failure mode — the boundary is the interesting story, not the chat.
- **Do not build a backend that re-serves the same simulation.** A service that proxies what the frontend already computed is theatre, and a technical reviewer will spot it in minutes. Build a backend only when it does something the browser cannot: durable audit, real identity, multi-vessel aggregation, model serving.

---

## 7. Phased plan

| Phase | Work | Effort | Outcome |
|---|---|---|---|
| **0 — Unblock** | Push V2/V3. Make the repository public and enable Pages (verify the deployment actually serves). Fix the hardcoded safety check. Regenerate the traceability matrix against current code. Add Playwright to CI. Correct the CI step label. | 4–6 hours | The work you have already done becomes visible to anyone. **Highest return per hour in the entire plan.** |
| **1 — Production-grade core** | Monorepo extraction. `core-domain` / `safety-engine` / `decision-engine` / `simulator` packages. `dependency-cruiser` boundary enforcement in CI. Property-based safety tests. Hash-chained audit (IndexedDB). Decision record hashes. Requirement-tagged tests generating the traceability matrix. | 2–3 weeks part-time | The demonstrator becomes production-quality software. Independence becomes structural |
| **2 — Real data and identity** | ISO 19848-aligned data model via the Vista SDK. Fastify + Postgres/TimescaleDB backend. OIDC auth. Server-enforced authority gating. Durable server-side audit with chain verification endpoint. Deploy to a free or low-cost tier (verify current free allowances before committing) | 3–4 weeks part-time | A genuine Option B platform slice, live and demonstrable |
| **3 — Assurance depth** | Edge/shore split with store-and-forward. ODD promoted to a controlled specification, generating `oddFunctions.ts`. GSN safety case. MLflow model registry with a real (small) trained model replacing one rule-based analytic. | 4–6 weeks part-time | The artifact a class or assurance audience would recognise |
| **4 — Optional** | Tier 3 generative layer with enforced boundary and documented failure modes. | 1–2 weeks | The "safe generative AI in a safety context" story, evidenced rather than asserted |

---

## 8. If the objective is career leverage rather than a product

Worth stating explicitly, because it changes the ordering.

The demonstrator already does the rare and difficult thing: it reasons about safety, envelopes, graceful degradation and human authority, and it is honest about what it is. Most AI portfolio projects do none of that. The marginal value of another feature is close to zero; the marginal value of *visible rigour* is high.

On that basis the ordering is: **Phase 0, then Phase 1, then the safety case from Phase 3** — and the backend can wait indefinitely. A hiring manager for a Digital Transformation or Enterprise Applications role will not run `npm install`. They will open a URL, skim the docs, and form a judgement in about four minutes.

Today that URL returns 404.

---

## Sources

- [IMO MSC 111: New MASS Code adopted — DNV](https://www.dnv.com/news/2026/imo-mcs-111-new-mass-code-adopted/)
- [IMO adopts first global Code for autonomous ships — IMO](https://www.imo.org/en/mediacentre/pressbriefings/pages/imo-adopts-mass-code.aspx)
- [Addressing cyber resilience of ships: UR E26 and E27 — IACS](https://iacs.org.uk/news/iacs-ur-e26-and-e27-press-release)
- [EU AI Act Omnibus Agreement — Postponed High-Risk Deadlines — Gibson Dunn](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/)
- [ISO 19848 data standard — DNV Vista](https://docs.vista.dnv.com/docs/standards/iso-19848/)
- [DNV Vista SDK (ISO 19847 / ISO 19848 / VIS)](https://github.com/dnv-opensource/vista-sdk)
- [ISO 19848:2018 — ISO](https://www.iso.org/standard/66406.html)
