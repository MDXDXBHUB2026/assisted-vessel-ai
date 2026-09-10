# Assisted Vessel Intelligence

**Human-Centred Decision Intelligence for Vessel & Shore Operations**

An independent technology demonstrator exploring how digitalisation, analytics, optimisation, deterministic safety logic and generative-AI concepts could support container-vessel and shore operations — while keeping human operational authority firmly in the loop.

> This is a standalone concept prototype. It uses entirely synthetic operational data, is not connected to any real vessel, and is not intended for operational use. It does not represent, and is not affiliated with, any real shipping company, classification society, shipbuilder, technology vendor, or vessel operator.

## What this is

A browser-based, single-page application demonstrating the conceptual decision chain:

```
SENSE → UNDERSTAND → PREDICT → RECOMMEND → SAFETY VALIDATE → EXPLAIN
      → HUMAN DECISION → CONTROLLED ACTION → MONITOR OUTCOME → AUDIT
```

It includes a Bridge Operations mission-control canvas, a Chief-Engineer-style Engineering Operations workspace with streaming telemetry, an interactive vessel-system Digital Twin, a canvas-rendered real-time Navigation Operating Picture, a Shore Assisted Operations Centre, an L0–L4 assistance-level framework, a deterministic Safety/ODD engine, a Connected-POC service-adapter boundary, a ten-phase Demo Voyage sequencer, and a full engineering documentation set under [`docs/`](docs/).

## Quick start

```bash
npm install
npm run dev
```

Then open the printed local URL and click **ENTER BRIDGE OPERATIONS**, or **START DEMO VOYAGE** for a guided end-to-end walkthrough.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build the static production site into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run test` | Run the unit test suite (Vitest) |
| `npm run test:e2e` | Run the Playwright end-to-end acceptance-journey suite (builds/serves first via `npm run preview`) |
| `npm run lint` | Run oxlint |

## Documentation

- [Product Requirements](docs/product-requirements.md)
- [System Requirements](docs/system-requirements.md)
- [Use Cases](docs/use-cases.md)
- [Architecture](docs/architecture.md)
- [Concept of Operations](docs/conops.md)
- [Assumptions](docs/assumptions.md)
- [Requirements Traceability](docs/requirements-traceability.md)

## Deploying to GitHub Pages

This repository includes a workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) that builds and deploys to GitHub Pages automatically on every push to `main`. It derives the correct Vite base path from the repository name — no configuration needed. To enable it on a new repository:

1. Push this project to a new GitHub repository.
2. In the repository settings, go to **Pages** and set the source to **GitHub Actions**.
3. Push to `main` (or run the workflow manually from the **Actions** tab) — the site will be published to `https://<your-username>.github.io/<repo-name>/`.

To build locally with a specific base path (e.g. to test the production build under a subpath):

```bash
VITE_BASE_PATH=/my-repo-name/ npm run build
npm run preview
```

## Disclaimer

This independent technology demonstrator uses entirely synthetic operational data and illustrative engineering logic. It is not connected to a vessel, does not provide navigational or engineering advice, and is not intended for operational use.
