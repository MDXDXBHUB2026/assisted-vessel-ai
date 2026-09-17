// The simulation's fixed baseline start time. Lives in core-domain (not the simulator) because a
// simulator fixture (data/voyagePlan.ts) needs it by name without depending on the simulator
// package itself — that dependency direction is exactly the cycle this constant's placement
// breaks. See docs/assumptions.md.
export const SIM_START_ISO = '2026-03-11T02:00:00.000Z'
