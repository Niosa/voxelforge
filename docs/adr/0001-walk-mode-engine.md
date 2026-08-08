# ADR-1: Walk-Mode Engine Owner

- Status: Proposed
- Date: 2026-08-07

## Context

Walk mode currently spans three overlapping systems:

1. **noa-engine** (npm, pinned via git-dep `overrides` workaround; needed CJS/Rollup namespace-import compat fixes)
2. **Custom voxel pipeline** — `src/globe/voxels/` (VoxelChunk, VoxelMesher, VoxelRenderer, VoxelWorkerSync) feeding Cesium plus a 3D Tiles bake worker
3. **LuantiMapgen** (`src/planet/terrain/`) — Luanti-inspired mapgen feeding terrain sampling

Overlapping ownership has already produced integration bugs (camera flight conflicts, voxel grid alignment, block placement physics) and complicates every walk-mode change.

## Options

- **A. Custom pipeline owns walk mode.** Full control, no dependency workarounds, designed for the Cesium globe bridge. Cost: we own all engine bugs.
- **B. noa-engine owns walk mode.** Battle-tested voxel mechanics. Cost: dependency is fragile (override workaround), not globe-aware, iPad performance unknown.
- **C. Hybrid (status quo).** Rejected implicitly — it is the source of the current integration pain.

## Decision criteria

- Old-iPad performance (see `.kilo/plans/1784756346448-old-ipad-crash-fixes.md`)
- Build reliability (no overrides / CJS shims)
- Globe-anchor integration complexity (`src/walk/GeoAnchor.ts`)
- Test coverage we can realistically maintain

## Decision

_Pending — decide before the Phase 1 refactors begin._
