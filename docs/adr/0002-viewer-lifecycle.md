# ADR-2: Cesium Viewer Lifecycle

- Status: Proposed
- Date: 2026-08-07

## Context

`src/globe/CesiumViewer.ts` (~48KB) runs on module-level mutable singletons (`viewer`, `currentImageryStyle`, `isFantasyWorld`, ...). Imagery-provider installation has multiple call sites, which produced race conditions currently documented inline as "Bug 1 fix" / "Bug 4 fix" comments.

## Decision (proposed)

- One explicit viewer state machine owns lifecycle: `uninitialized → initializing → ready → switching-world → destroyed`.
- Imagery-provider installation gets exactly one owner: the `GlobeView` sync effect. All other modules emit intents, never mutate imagery directly.
- Store reads happen at state-transition boundaries only — never at an unpredictable moment mid-render.

## Consequences

- `setFantasyWorldFlag` / `setGlobeImageryStyle` / `updateFantasyImageryEntities` collapse into the state machine's transition API.
- Race-fix comments are replaced by states that make the races impossible.
