# Voxelforge agent handover

Last updated: 2026-08-06

This is the operational handover for the next coding agent. Read this file, then
`AGENT_RULES.md`, `CHECKLIST.md`, and the files named below before changing code.
`HANDOVER.md` is an older introduction with a completed next-steps list.

## Product intent

Voxelforge combines two views of one persistent authored world:

- Globe mode uses CesiumJS for drawing continents, regions, settlements,
  landmarks, walk-site pins, relief, and generated voxel previews.
- Walk mode uses noa-engine and Babylon.js for first-person voxel gameplay.
- A globe location must map deterministically to the same walk coordinates and
  retain manual voxel edits, NPC state, and mobs.
- Generated terrain should remain visually consistent between modes. Globe
  previews are currently an optimized representation, not a second world.

The user wants Minecraft-like controls and block visuals, Luanti-inspired
procedural systems, persistent Elder Scrolls-like citizens, mobile/controller
support, and good performance on iPad-class hardware.

## Mandatory project rules

- TypeScript is strict. Avoid `any`; narrow `unknown` where typings are incomplete.
- Zustand world state is authoritative. Cesium and noa are views of that state.
- Preserve the singleton Cesium viewer lifecycle.
- Geographic edits go through history commands so undo/redo remains valid.
- Preserve unrelated local changes; the worktree is frequently dirty.
- Use `apply_patch` for hand edits.
- Run `npm.cmd test -- --run` and `npm.cmd run build` before handoff.
- Update `CHECKLIST.md` and, for user-facing milestones, `docs/DEMO.md`.

## Local development

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd test -- --run
npm.cmd run build
```

If `vite` is not recognized, run `npm.cmd install` in the repository root. The
application normally runs at `http://localhost:5173`.

## Architecture map

### World and persistence

- `src/state/worldStore.ts`: authoritative world, entities, voxel chunks, NPCs,
  mobs, walk sites, and persistence integration.
- `src/entities/types.ts`: persistent world/entity/NPC/mob contracts.
- `src/state/history/commands.ts`: undoable entity mutations.
- `src/storage/`: IndexedDB persistence and serialization.

### Globe mode

- `src/globe/CesiumViewer.ts`: singleton viewer, input, imagery, terrain, sizing,
  and lifecycle.
- `src/globe/entitySync.ts`: diffs Zustand entities into Cesium objects.
- `src/globe/walkVoxelGlobeOverlay.ts`: generated/saved walk chunks on the globe,
  including sides, slab batching, coverage, and base masking.
- `src/globe/proceduralRelief.ts`: authored relief representation.
- `src/drawing/DrawController.ts`: polygon/freehand/pin interaction.

### Coordinate bridge

- `src/planet/spatial/PlanetGrid.ts`: stable lon/lat-to-planet grid and local
  frames. Do not introduce a second coordinate conversion path.
- `src/walk/WalkEntryPin.ts`: persistent, editable return sites.

### Terrain and settlements

- `src/planet/terrain/PlanetTerrainSampler.ts`: canonical deterministic surface,
  biome, cave, water, decoration, city, and emergent-hamlet compiler.
- `src/planet/terrain/LuantiMapgen.ts`: Luanti-inspired mapgen helpers.
- `src/city/CityLayout.ts`: deterministic zoning, roads, parcels, and structures.
- Terrain is seed-and-coordinate deterministic. Manual blocks are sparse
  overrides. Algorithm changes can alter untouched terrain but must preserve
  saved overrides.

### Walk mode

- `src/walk/WalkOverlay.tsx`: React ownership, HUD, conversations, lifecycle,
  save-on-exit, touch/controller bridge.
- `src/walk/WalkScene.ts`: noa initialization, registry, chunks, player input,
  interaction, audio, lighting, liquids, and simulation ticks.
- `src/walk/blockRegistry.ts`: block IDs, textures, solidity, and fluids.
- `src/walk/WalkNodeSimulation.ts`: bounded flowing-liquid updates.
- `src/walk/PersistentWalkNpcManager.ts`: NPC meshes, routines, movement,
  obstacle detours, grounding, targeting, conversations, and snapshots.
- `src/walk/PersistentWalkMobManager.ts`: persistent basic mobs.
- `src/walk/WalkTrafficManager.ts`: lightweight settlement vehicles.
- `src/audio/soundEngine.ts`: pooled samples and procedural fallbacks. Assets are
  under `resources/sfx`.

## Current implemented state

- Walk mode spawns from globe coordinates and persists sparse block changes.
- Generated chunks appear on the globe with top and side geometry; base imagery
  is masked beneath represented chunks.
- Terrain supports authored biome/topography plus deterministic plains, hills,
  mountains, snow caps, lakes, tunnels, caverns, foliage, and emergent hamlets.
- Cities have zoning, roads, buildings, public features, doors, NPCs, schedules,
  conversations, obstacle detours, and limited traffic.
- Keyboard, mouse, touch, hotbar wheel, controller, sprint, jump, view bobbing,
  swimming, creative flight, doors, torches, and material SFX are present.
- Controller `Y` opens the creative inventory, D-pad/left stick navigates it,
  `A` assigns the focused block to the active hotbar slot, and `B` closes it.
- Door open/closed geometry, collision IDs, and their dedicated sound samples are
  synchronized. Walk lighting includes a soft hemispheric fill to keep voxel and
  NPC shadow faces readable.
- Flowers use an opaque multipart voxel mesh to avoid alpha-plane artifacts.
- Creative inventory is available from the HUD or `I` and lists every placeable
  registered block. City materials and roofs vary deterministically by parcel/
  district, while diagonal road reservations suppress intersecting park trees.
- Wildlife includes pigs, cows, sheep, chickens, deer, rabbits, horses, foxes,
  and goats, with biome-aware spawning and surface-snapped kinematic movement.

## Performance status and recent fix

Reported symptom: serious stutter while grounded in cities/towns, while creative
flight over the same area is comparatively smooth.

The latest pass targets a repeatable main-thread spike in
`PersistentWalkNpcManager`:

- Crowd separation previously compared every citizen with every other citizen
  every 75 ms: up to 1,600 ECS position reads for 40 loaded NPCs.
- It now snapshots positions once and uses a 2-block spatial grid, limiting
  separation work to nearby cells.
- NPC grounding probes now start staggered and run every 700 ms instead of
  synchronizing every citizen every 350 ms.
- NOA player auto-step is disabled because its repeated collision sweep caused
  extra grounded cost around dense city geometry; one-block traversal uses jump.
- Gamepad look is sampled for actions on ticks but interpolated per render frame.
- Crossed-plane vegetation was replaced with opaque voxel blades to eliminate
  black alpha cards and camera-relative-looking thin-instance artifacts.
- Walk scenes defer noa origin rebasing to 32,768 blocks; the planet local frame
  already bounds coordinates, and the old 25-block threshold desynchronized
  custom block instances from terrain during flight.

Do not assume this exhausts the issue. Compare walking, standing, and flying in
a dense city. If hitches remain, profile main-thread long tasks before reducing
features. Likely next hotspots are synchronous `worldDataNeeded` city chunk
compilation, object-mesh draw calls, and initial HTMLAudio sample decoding.
Preserve NPC density unless profiling supports distance-based simulation levels.

Recommended next optimization design:

1. Add debug-only timing counters around chunk compilation and simulation managers.
2. Memoize or incrementally compile dense city columns and yield when noa permits.
3. Add NPC simulation LOD: animate nearby citizens and simulate distant schedules
   without meshes.
4. Instance repeated object meshes/materials rather than cloning unique resources.
5. Prewarm the small footstep sample set after the first user gesture.

## Known risks and unfinished areas

- Globe voxel representation can become expensive with many visible chunks;
  batching exists, but distance/LOD tiers need more work.
- Emergent hamlets generate environmental structures but are not yet persistent
  settlement entities with generated citizens and families.
- Procedural walk terrain and globe terrain are conceptually unified but do not
  share literal mesh geometry at every zoom level.
- Mobile Safari needs continued stress testing for memory, touch, audio, and
  WebGL context recovery.
- Generated city complexity can still make first-time chunk entry expensive.
- Luanti is a native C++ engine. Port algorithms selectively; a direct renderer
  port would require a separately designed WASM boundary and license review.

## Regression checklist

1. Enter over ocean, forest, mountain, and an authored city; biome/location match.
2. Walk, sprint, jump, swim, fly, place/break blocks, open/close doors, and verify
   each door's visual, collision, and sound agree.
3. Talk to an NPC; pointer lock releases and movement resumes after closing.
4. Block an NPC route and confirm detouring without jitter or ground sinking.
5. Return to the globe and verify the pin, voxel sides, and masked imagery while
   zooming.
6. Re-enter the same site and verify block edits and NPC state persist.

## Validation baseline

The current baseline is 24 test files and 97 tests passing with a successful
production build. Re-run both validation commands after every change.
