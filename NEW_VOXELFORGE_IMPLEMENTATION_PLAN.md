# Voxelforge: Unified Planet Implementation Plan

## 1. Product definition

Voxelforge is a single-player creative world-building game in which every save represents one coherent, editable planet. Cesium renders and edits the planet at cartographic scale. noa-engine renders and simulates the same planet at human and block scale. Neither renderer owns authoritative world data.

The player must be able to:

- Create continents, islands, mountain ranges, biomes, rivers, roads, settlements, regions, and landmarks from the globe.
- Descend anywhere and encounter voxel terrain derived from those globe features.
- Explore, harvest, build, destroy, craft, and interact in first person.
- Return to the globe and see meaningful walk-mode changes, including large structures and altered terrain.
- Save, close, reopen, export, and import the planet without losing correspondence between modes.
- Play comfortably with mouse and keyboard, controller, or mobile touch controls.

### Core product rule

Every mutation is a planetary mutation. “Globe mode” and “walk mode” are editing and gameplay interfaces at different scales, not separate worlds.

### Initial release boundaries

The first playable release should prioritize a compelling creative loop over simulation breadth. It should include deterministic terrain, globe-to-walk synchronization, walk-to-globe construction summaries, responsive building, basic collection/crafting, a small set of creatures or ambient life, and strong save reliability. Multiplayer, server authority, infinite NPC economies, and photorealistic Earth replication remain outside the first release.

---

## 2. Current repository assessment

The `dev` branch already contains useful foundations:

- React 18, Vite, strict TypeScript, Tailwind, Zustand, and Immer.
- A persistent Cesium globe with drawing, entities, imagery, terrain, themes, search, selection, and editing.
- Command-based globe history for some entity changes.
- A preliminary noa `WalkScene` with generated chunks and sparse dirty-chunk persistence.
- A `GeoAnchor` coordinate bridge.
- IndexedDB world persistence and world import/export.

The current implementation is not yet a unified planet:

- Walk chunks are stored relative to a temporary local anchor rather than stable planet cells.
- noa terrain is generated from local sine waves instead of globe-authored terrain data.
- noa edits do not produce Cesium-visible structure or terrain representations.
- The code contains two first-person approaches: a Cesium first-person builder and the noa walk mode.
- `WalkOverlay` appears in more than one render path, risking duplicate lifecycle state.
- The current walk mode lacks complete block targeting, placement, breaking, inventory, interaction, audio, and gameplay progression.
- Several noa integration boundaries use `any`, weakening correctness in the most state-sensitive layer.
- Documentation, branding, and checklist status do not consistently match the implementation.

These issues should be corrected before expanding content.

---

## 3. Target architecture

### 3.1 Major layers

1. **Canonical planet domain**
   - Owns geography, procedural parameters, player voxel overrides, structures, simulation state, revisions, and save metadata.
   - Contains no Cesium or noa objects.

2. **Planet spatial index**
   - Converts longitude/latitude/altitude to stable hierarchical planet-cell identifiers.
   - Finds features intersecting cells and tracks dirty regions.

3. **Terrain compiler**
   - Converts canonical cartographic features into deterministic elevation, biome, material, hydrology, and structure data.
   - Produces both low-detail globe products and high-detail voxel chunks.

4. **Cesium adapter**
   - Renders globe-scale projections of canonical data.
   - Converts globe editing gestures into domain commands.

5. **noa adapter**
   - Streams compiled voxel chunks around the player.
   - Converts block and gameplay interactions into domain commands.

6. **Persistence and migration**
   - Stores canonical source data, sparse overrides, summaries, and cache metadata.
   - Never treats generated chunk caches as irreplaceable source data.

7. **Application shell**
   - Owns mode transitions, menus, input mapping, save status, accessibility, error recovery, and device profiles.

### 3.2 Data authority

Authoritative source data:

- Planet seed and generator version.
- Geographic feature geometry and parameters.
- Explicit voxel additions, removals, and replacements.
- Player-built structure records and their source voxel revisions.
- Inventories, player state, creatures, and simulation state.
- Command journal or revision metadata required for safe recovery.

Regenerable derived data:

- Generated voxel terrain with no player edits.
- Cesium terrain meshes, vector tiles, structure simplifications, thumbnails, and spatial indexes.
- Cached biome lookup grids, height fields, and chunk meshes.

Generated products must be versioned and invalidatable. Save integrity must never depend on retaining a stale cache.

---

## 4. Canonical planet data model

Create a versioned domain schema in `src/planet/` and make it the single source of truth.

### 4.1 Suggested top-level schema

```ts
interface PlanetSave {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  seed: string;
  generatorVersion: string;
  radiusM: number;
  seaLevelM: number;
  settings: PlanetSettings;
  features: Record<FeatureId, PlanetFeature>;
  structures: Record<StructureId, PlanetStructure>;
  voxelOverrides: VoxelOverrideStore;
  players: Record<PlayerId, PlayerState>;
  simulation: SimulationState;
  revisions: RevisionState;
}
```

### 4.2 Planet features

Use GeoJSON-compatible geometry plus strongly typed parameters:

- Landmass: base elevation, crust profile, coastline roughness, erosion seed.
- Mountain range: ridge path or polygon, peak elevation, width, ruggedness, snow line.
- Biome: polygon, priority, surface palette, vegetation, climate parameters.
- River/lake/ocean: geometry, width/depth, flow direction, water material.
- Road/path: centerline, width, surface, hierarchy.
- Settlement/city: footprint, style, density, procedural seed, protected plots.
- Region/border: political or organizational metadata without necessarily modifying terrain.
- Landmark: authored or generated point/footprint with display and gameplay metadata.

Every terrain-affecting feature needs:

- Stable ID.
- Geometry.
- Vertical profile or elevation rule.
- Blend/falloff rule.
- Priority and composition behavior.
- Revision number.
- Bounding cells for invalidation.

### 4.3 Globally stable voxel addressing

Replace temporary anchor-relative persistence with stable planet addressing.

Recommended approach:

- Partition the sphere using a cube-sphere quadtree or another seam-aware hierarchical cell scheme.
- Identify a surface cell by face, level, X, and Y.
- Address vertical voxel chunks using a signed elevation band.
- Within an active walk session, create a local tangent frame for noa coordinates.
- Convert local noa positions to planet-space coordinates at the adapter boundary.

Example conceptual key:

```text
planet/{face}/{level}/{cellX}/{cellY}/{verticalChunk}
```

The exact scheme must satisfy:

- Stable IDs regardless of descent anchor.
- Neighbor lookup across face boundaries.
- No longitude discontinuity at ±180 degrees.
- Safe behavior near poles.
- Deterministic conversion in both directions.
- Sufficient precision for one-meter blocks.
- A documented maximum practical walk radius per local tangent session.

Use 32³ blocks internally initially because noa already expects that scale, but keep chunk size configurable in one module.

### 4.4 Sparse voxel overrides

Do not persist complete generated chunks. Persist only deviations from the compiled base terrain:

- `set`: generated block replaced by another block.
- `remove`: generated block replaced by air.
- `add`: air replaced by a block.
- Optional metadata: owner, timestamp, command ID, structure ID.

Compact overrides per chunk using palette encoding, bit-packed local coordinates, and run-length or sorted delta encoding when saving. Keep an ergonomic in-memory representation behind a repository interface.

### 4.5 Structures

A structure is more than an arbitrary collection of blocks. Maintain derived structure records for globe display and gameplay queries:

- Planet-space bounds and footprint.
- Maximum/minimum elevation.
- Dominant material palette.
- Simplified mesh or proxy representation.
- Source chunk IDs and source revision.
- Optional player-provided name, icon, category, and visibility.

Automatic connected-component analysis can identify large player constructions. Players should also be able to select an area and “Create Landmark,” which yields better metadata and a stable globe representation.

### 4.6 Revisions and dirty regions

Every terrain-affecting edit increments a planet revision and marks intersecting cells dirty.

Track independently:

- Source feature revision.
- Compiled terrain revision.
- Voxel override revision.
- Globe summary revision.
- Simulation revision.

This permits incremental rebuilds and prevents unnecessary global regeneration.

---

## 5. Bidirectional synchronization

### 5.1 Globe to walk mode

When a globe feature changes:

1. Validate and normalize its geometry.
2. Execute a domain command.
3. Calculate affected planet cells, including blend margins.
4. Increment source revisions and invalidate derived products.
5. Refresh Cesium immediately using low-cost previews.
6. Recompile affected height/biome products in a worker.
7. If affected noa chunks are loaded, schedule safe live updates.
8. Persist the source edit before considering the operation committed.

For unloaded regions, chunks regenerate when next requested.

For loaded walk regions, regeneration must respect player safety:

- Never replace blocks directly inside the player or active entities.
- Display a brief “World updating” indicator.
- Rebuild chunks outside the nearest safety radius first.
- Queue nearby destructive remeshing until the player moves or confirms.
- Preserve explicit voxel overrides by default.

### 5.2 Walk to globe mode

When blocks change:

1. Apply the action immediately to noa for responsiveness.
2. Record the corresponding canonical voxel override command.
3. Mark the stable planet chunk and its globe summary dirty.
4. Update structure connectivity asynchronously.
5. Build or update a Cesium proxy.
6. Save through the write-behind persistence queue.

Cesium representation should vary by scale:

- Very far: optional map marker or nothing below a significance threshold.
- Planetary distance: footprint, color patch, height-aware icon, or clustered landmark.
- Regional distance: extruded footprint or simplified mesh.
- Close globe view: higher-detail decimated mesh or instanced blocks where practical.

Large excavation must also affect globe terrain. Small holes should remain walk-only until the camera is close enough or their bounds exceed a significance threshold.

### 5.3 Edit composition rules

Define predictable results when procedural terrain changes beneath player edits:

- Player-added blocks remain fixed in planet coordinates.
- Player-removed blocks remain removed unless the player explicitly resets the area.
- Terrain generated around overrides is recomputed.
- If a globe edit would engulf a structure, preview the conflict and offer:
  - Preserve structure and carve terrain around it.
  - Move structure vertically with the new surface.
  - Overwrite conflicting blocks.
  - Cancel the globe edit.
- Named/protected structures default to preservation.
- Unnamed incidental edits may follow a configurable world rule.

### 5.4 Command system

Unify all mutations under domain commands rather than Cesium-specific history classes.

Commands should include:

- Add/update/remove planet feature.
- Sculpt elevation.
- Paint biome/material.
- Set/remove voxel block batch.
- Place/remove structure.
- Change world parameters.
- Inventory and gameplay transactions when atomicity matters.

Commands produce:

- State mutation.
- Affected spatial bounds.
- Dirty product types.
- Undo payload.
- Persistence journal entry.

Undo/redo remains mode-aware in presentation but operates on the same planet history.

---

## 6. Terrain compilation pipeline

### 6.1 Deterministic sampling API

Implement a pure API that can be called by workers, tests, Cesium, and noa:

```ts
sampleSurface(planet, lon, lat): SurfaceSample
sampleColumn(planet, position, minAltM, maxAltM): BlockColumn
compileVoxelChunk(planetSnapshot, chunkId): CompiledChunk
```

`SurfaceSample` should return:

- Ground elevation.
- Ocean/lake/river depth.
- Primary and blended biome weights.
- Surface and subsurface material profile.
- Temperature, moisture, snow coverage, and vegetation likelihood.
- Intersecting road, city, or authored-feature metadata.

### 6.2 Terrain composition order

A deterministic initial order:

1. Planetary base noise and tectonic macro-shape.
2. Authored land/ocean masks.
3. Mountain ranges, plateaus, valleys, and crater modifiers.
4. Erosion-inspired detail and slope stabilization.
5. Hydrology and water surfaces.
6. Climate and biome assignment.
7. Surface/subsurface material layers.
8. Roads, settlement grading, authored landmarks, and generated structures.
9. Vegetation and decorative features.
10. Explicit voxel overrides.

Each stage should be independently testable and versioned.

### 6.3 Globe rendering products

Cesium should render the same sampled surface through multiple products:

- Dynamic imagery tiles for biome color, snow, roads, borders, and cartographic styling.
- Terrain height tiles or custom meshes for major elevation.
- Vector entities for editable feature outlines and labels.
- 3D structure proxies for cities and player builds.

Use rapid temporary previews while dragging or painting. Commit high-detail recomputation after input settles.

### 6.4 Worker architecture

Move compilation off the main thread:

- Dedicated terrain worker pool.
- Transfer compact typed-array inputs and outputs.
- Prioritize chunks nearest the player or camera.
- Cancel obsolete jobs using revision tokens.
- Limit concurrency based on `navigator.hardwareConcurrency`, memory profile, and device class.
- Fall back to one worker on low-memory mobile devices.

---

## 7. Globe mode: creative cartography

### 7.1 Interaction model

Globe mode should feel like a blend of Google Earth, a terrain painter, and a creative map editor.

Primary tools:

- Select and inspect.
- Draw landmass or region.
- Sculpt raise/lower/smooth/flatten.
- Draw mountain ridge.
- Paint biome and surface material.
- Draw river, lake, road, wall, or route.
- Place settlement, landmark, or procedural stamp.
- Erase/reset derived terrain.
- Measure distance, area, and elevation.

Keep mutually exclusive tool modes and clearly show the active mode. Escape cancels the current gesture. Touch tools must not conflict with pinch, orbit, or tilt.

### 7.2 Non-destructive editing

Treat most globe authoring as editable feature layers rather than permanently baking pixels or heights:

- Mountain ridges retain editable paths and parameters.
- Biome paint retains geometry, strength, and priority.
- Roads retain centerlines and widths.
- Landmasses retain coastline masks and elevation profiles.

This supports responsive revision, undo, and regeneration.

### 7.3 Immediate feedback

- Show brush radius and falloff on the globe.
- Preview affected area and estimated regeneration cost.
- Update low-resolution terrain within one animation frame where possible.
- Display background compilation unobtrusively.
- Prevent save/export while an authoritative command is only partially committed.

### 7.4 Cartography layers

Provide user-toggleable layers:

- Terrain/biome color.
- Political regions and borders.
- Roads and routes.
- Settlements and points of interest.
- Player constructions.
- Hydrology.
- Climate/elevation overlays.
- Labels and grid/cell debugging.

Separate decorative map styling from physical terrain data. A parchment theme must not change walk-mode materials unless the player edits the actual biome or surface palette.

### 7.5 Descent experience

- A persistent “Descend here” action appears for a selected location.
- Show a surface preview, biome name, elevation, local time/weather, and known landmarks.
- Stream initial walk chunks before fading away from Cesium.
- Spawn on a validated safe surface.
- Return to the last walk position when appropriate.
- Preserve camera context so ascending returns to the corresponding globe location.

---

## 8. Walk mode: fun gameplay foundation

### 8.1 First playable loop

The minimum enjoyable loop is:

1. Descend into a visually distinct biome.
2. Explore responsive terrain with clear landmarks.
3. Gather a small set of resources.
4. Build or modify terrain with satisfying feedback.
5. Discover a point of interest or ambient creature.
6. Create or name a landmark.
7. Ascend and see the result on the globe.
8. Edit the surrounding region on the globe and revisit it.

This loop is the primary vertical-slice acceptance test.

### 8.2 Movement and camera

- Stable walking, sprinting, jumping, swimming, crouching, and step-up behavior.
- Optional creative flight.
- Configurable field of view, sensitivity, inversion, head bob, and camera shake.
- Coyote time and jump buffering for forgiving controls.
- Robust collision when chunks load or regenerate.
- Never spawn or resume inside a solid block.

### 8.3 Block interaction

- Center-screen raycast with clear block outline.
- Hold-to-break with progress, particles, sound, and tool effectiveness.
- Place preview with collision validation.
- Fast repeated placement without duplicate commands.
- Reach distance appropriate to device and mode.
- Creative instant break and unlimited inventory option.
- Survival-oriented durability and resource costs only when that ruleset is selected.

### 8.4 Inventory and crafting

Initial scope:

- Nine-slot hotbar.
- Stackable inventory grid.
- Drag/drop on desktop and tap-based selection on mobile.
- A compact recipe book rather than memorized shapes.
- Basic categories: terrain, wood, stone, decorative, lighting, utility.
- Creative catalog with search and favorites.

Avoid building a massive crafting tree before movement, building, and synchronization are excellent.

### 8.5 Content for the first playable release

- 20–30 visually distinct blocks using a texture atlas.
- At least five coherent biomes: temperate, desert, snowy/icy, volcanic, and coastal/ocean.
- Trees or analogous vegetation with biome variants.
- Water and simple swimming.
- A day/night cycle synchronized to planet longitude and world time.
- Weather states driven by biome/climate parameters.
- Ambient audio and positional building/mining sounds.
- A few ambient or passive creatures with lightweight behavior.
- Procedural points of interest such as ruins, caves, groves, or mineral formations.

### 8.6 Player motivation

Support both free creativity and gentle goals:

- Creative mode: immediate full catalog, flight, no damage.
- Explorer mode: gathering and lightweight crafting with optional health/hazards.
- Planet journal: discovered biomes, landmarks, settlements, and notable constructions.
- Milestones tied to meaningful actions, not repetitive grinding.
- Named landmarks appear automatically in globe mode.

Default new worlds to a welcoming hybrid configuration, with a clear choice between Creative and Explorer rules.

---

## 9. Cross-platform input and UX

### 9.1 Unified action map

Never hardcode gameplay behavior directly to keys or touch events. Define actions:

- Move, look, jump, sprint, crouch, interact.
- Primary/secondary block action.
- Select hotbar slot.
- Inventory, pause, map/globe, ascend.
- Globe orbit, pan, zoom, select, tool confirm/cancel.

Bindings feed an action state consumed by either mode.

### 9.2 Desktop controls

- Mouse/keyboard defaults familiar to voxel-game players.
- Pointer lock with a clear entry affordance and Escape behavior.
- Full rebinding and sensitivity control.
- Controller support using the Gamepad API with glyph switching.
- Avoid browser-shortcut collisions.

### 9.3 Mobile controls

- Left virtual stick for movement.
- Right-side drag region for camera look.
- Context-sensitive primary action button.
- Dedicated jump and optional crouch/flight controls.
- Hotbar reachable by either thumb.
- Long-press or mode toggle to prevent accidental breaking.
- Adjustable control scale, opacity, spacing, handedness, and safe-area positioning.
- Haptic feedback when supported and enabled.
- Touch targets of at least 44 CSS pixels.

Mobile globe editing should use explicit navigation and editing states. One-finger gestures edit only after a tool is deliberately activated; two-finger navigation remains available.

### 9.4 Responsive UI

- Desktop: panels and keyboard shortcuts.
- Tablet: collapsible side sheets.
- Phone portrait: bottom sheets and compact toolbar.
- Phone landscape: minimal HUD optimized for walk mode.
- Respect safe-area insets, dynamic browser chrome, and orientation changes.
- Prevent the soft keyboard from obscuring named fields or search results.

### 9.5 Accessibility

- Keyboard-accessible menus and globe tool controls where technically possible.
- Labels and roles on controls.
- Remappable input and hold/toggle options.
- Reduced motion, camera shake, head bob, and flashing settings.
- UI scaling and high-contrast selection outlines.
- Color is never the only indicator of biome, tool state, or danger.
- Subtitles/captions for meaningful audio cues.

---

## 10. Performance and optimization

### 10.1 Performance targets

Define measurable device tiers rather than “runs well.”

| Tier | Target | Walk render | Globe render | Initial walk entry |
|---|---|---:|---:|---:|
| Desktop recommended | Modern 6-core CPU, discrete GPU | 60 FPS | 60 FPS | under 3 s warm / 6 s cold |
| Desktop minimum | Integrated GPU, 8 GB RAM | 30 FPS | 30 FPS | under 8 s |
| Mobile recommended | Recent iPhone/Android flagship | 45–60 FPS | 45–60 FPS | under 6 s |
| Mobile minimum | Midrange device, 4 GB class | stable 30 FPS | stable 30 FPS | under 10 s |

Include p95 frame time, memory, chunk latency, save latency, and input latency in profiling.

### 10.2 Device profiles

Auto-detect a conservative starting profile, then allow overrides:

- Render distance.
- Cesium screen-space error.
- Terrain worker count.
- Shadow and lighting quality.
- Water and transparency quality.
- Vegetation density.
- Structure-proxy detail.
- Particle count.
- Texture resolution and anisotropy.

Apply changes without requiring a restart when feasible.

### 10.3 noa optimization

- Use a single texture atlas and batch-friendly block materials.
- Avoid creating unique Babylon/noa materials per block instance.
- Stream chunks by priority: collision ring, visible ring, background ring.
- Cache compiled base chunks separately from sparse overrides.
- Mesh and compile in workers where noa integration allows.
- Pool particles and transient entities.
- Use fixed-step simulation with render interpolation.
- Cap simulation radius separately from render distance.
- Aggressively sleep distant creatures and machines.
- Limit transparent blocks and overdraw on mobile.

### 10.4 Cesium optimization

- Keep a single viewer lifecycle.
- Use request-render mode whenever continuous animation is unnecessary.
- Diff changed features rather than reloading all entities.
- Cluster or hide labels based on distance.
- Use imagery/terrain tile caching and cancellation.
- Render construction summaries by level of detail.
- Avoid large React state changes on camera movement.
- Keep pointer-move previews throttled to animation frames.

### 10.5 Memory and storage budgets

Establish budgets early:

- Bound in-memory chunk count with an LRU policy.
- Bound decoded texture memory by device profile.
- Keep worker snapshots compact and immutable.
- Periodically compact voxel override journals.
- Track per-world storage and warn before browser quota pressure.
- Offer “clear regenerable cache” separately from deleting world data.
- Request persistent browser storage where supported after clear user intent.

### 10.6 Progressive loading

- Load the application shell before heavy engines when possible.
- Lazy-load noa only when entering walk mode.
- Lazy-load advanced globe editing panels.
- Show useful progress stages rather than an indeterminate black screen.
- Permit cancellation of descent while generation is still queued.

---

## 11. Persistence, reliability, and portability

### 11.1 Save strategy

- IndexedDB is the primary local store.
- Write authoritative commands through a serialized queue.
- Debounce bulk snapshots but journal important edits immediately.
- Show `Saving`, `Saved`, and `Save failed` truthfully.
- Flush pending operations on mode transitions, export, visibility change, and graceful shutdown where browsers permit.
- Keep at least one known-good snapshot and a recoverable command tail.

### 11.2 Save container

Use a versioned exported container rather than one enormous plain JSON object once voxel data grows. A `.voxelforge` archive can contain:

- `manifest.json`.
- Canonical feature data.
- Compressed voxel override segments.
- Player and simulation state.
- Optional thumbnails.
- Optional regenerable caches, excluded by default.

Include checksums and a clear generator/schema version.

### 11.3 Migration

- Write pure sequential migrations from schema N to N+1.
- Never mutate the only copy of an old save before validation.
- Support importing the existing Terraforge-style world format.
- Migrate existing `walkAnchor` chunks cautiously; label ambiguous legacy chunks as attached to the saved anchor.
- Preserve unknown optional fields when practical.

### 11.4 Failure recovery

- If derived data is corrupt, discard and regenerate it.
- If a journal is partially written, recover through checksummed entries.
- If quota is exhausted, pause new mutations that cannot be made durable and clearly explain recovery options.
- Never silently claim a save succeeded.
- Add a diagnostics export containing logs and metadata but no unnecessary user content.

---

## 12. Testing and quality strategy

### 12.1 Unit tests

High-priority deterministic suites:

- Planet-cell addressing and neighbor traversal.
- Coordinate round trips at equator, antimeridian, face seams, and poles.
- Feature intersection and dirty-cell calculation.
- Terrain sampling determinism.
- Biome blend and elevation composition.
- Voxel override application and compaction.
- Command execute/undo/redo.
- Save migrations and checksum validation.
- Structure footprint and simplification generation.

### 12.2 Integration tests

- Draw snowy mountain range → compile → inspect expected voxel materials/elevations.
- Build tower in noa adapter → persist → generate Cesium proxy → reload.
- Edit terrain beneath a protected structure and verify conflict policy.
- Enter from two different anchors and resolve the same global block.
- Cross antimeridian and cube-face boundaries without duplicated or missing chunks.
- Save during queued compilation and restore consistent authoritative state.
- Switch worlds without leaking Cesium/noa objects or input handlers.

### 12.3 End-to-end tests

Automate critical browser flows:

- Create world → draw landmass → add icy mountains → descend → build → ascend → save → reload.
- Import/export round trip.
- Mouse/keyboard building flow.
- Touch-emulated globe editing and walk controls.
- Low-storage and worker-failure recovery.
- PWA install/offline launch when implemented.

Do not rely on brittle pixel-perfect Cesium screenshots. Assert domain state and use targeted visual smoke checks.

### 12.4 Performance tests

- Fixed camera benchmark scenes.
- Chunk-generation throughput benchmark.
- Worst-case override-heavy chunk benchmark.
- Large feature-count globe benchmark.
- Long-session memory-leak test with repeated descend/ascend cycles.
- Mobile thermal-throttling session of at least 20 minutes.

### 12.5 Manual playtest rubric

Every milestone should be tested for:

- Can a new player understand the next action without documentation?
- Does every click/tap produce immediate feedback?
- Can the player recover from mistakes?
- Does the same place remain recognizable between scales?
- Is building satisfying for ten uninterrupted minutes?
- Are mode transitions exciting rather than disruptive?
- Does performance remain stable after repeated edits and travel?

---

## 13. Phased implementation roadmap

Each phase ends with a shippable checkpoint and explicit exit criteria. Do not begin broad content work until Phase 3 proves bidirectional planet synchronization.

### Phase 0 — Stabilize and establish baselines

**Goal:** Make the current repository trustworthy enough to refactor.

Tasks:

- Create a reproducible local build and test baseline.
- Measure current desktop and mobile-emulated performance.
- Remove the duplicate `WalkOverlay` render path.
- Choose noa as the only gameplay first-person engine.
- Remove or quarantine Cesium block-building code while retaining useful close-camera navigation separately.
- Centralize mode state into one state machine: `globe`, `descending`, `walk`, `ascending`, `error`.
- Add typed wrappers for the noa APIs currently represented as `any`.
- Audit world autosave duplication and ensure only one persistence coordinator owns scheduling.
- Align README, handover, project name, checklist, and demo documentation.
- Add CI for typecheck, build, and unit tests.

Exit criteria:

- One Cesium viewer and at most one noa instance exist.
- Fifty repeated mode transitions do not leak canvases or input listeners.
- Build and typecheck pass.
- Existing globe authoring remains functional.

### Phase 1 — Canonical planet core

**Goal:** Introduce the engine-independent authoritative model.

Tasks:

- Implement `src/planet/domain`, `commands`, `spatial`, `persistence`, and `selectors`.
- Define schema version 2 and migration from current worlds.
- Implement stable planet-cell addressing and local tangent frames.
- Implement coordinate round-trip and seam tests.
- Implement revision and dirty-region tracking.
- Adapt existing entities into typed planet features.
- Replace direct globe store mutation with domain commands.
- Add engine-neutral selectors for Cesium and noa.

Exit criteria:

- Existing globe worlds load into the new schema.
- A geographic point maps to the same stable voxel address from different descent anchors.
- All authoritative edits use commands and survive reload.

### Phase 2 — Deterministic globe-to-voxel terrain

**Goal:** Make authored globe geography produce recognizable walk terrain.

Tasks:

- Implement pure surface sampling.
- Compile elevation, oceans, basic hydrology, and material strata.
- Add five initial biome definitions.
- Implement mountain-range and landmass modifiers.
- Add worker-based chunk compilation and revision cancellation.
- Stream compiled global chunks into noa.
- Apply sparse player overrides last.
- Add safe spawning and visible loading progress.
- Add a debug overlay showing planet cell, chunk ID, biome, and revisions.

Exit criteria:

- An icy mountain authored on the globe becomes an icy voxel mountain in walk mode.
- Coastlines and sea level align within a documented tolerance.
- Results are deterministic across reloads and devices.
- Warm nearby chunks meet the target latency for the recommended desktop tier.

### Phase 3 — Voxel-to-globe synchronization

**Goal:** Complete the defining bidirectional loop.

Tasks:

- Store set/remove/add overrides using global chunk IDs.
- Implement reliable block command batching and write-behind saving.
- Generate structure bounds, footprints, palettes, and simplified proxies.
- Render significant structures and excavation summaries in Cesium.
- Add “Create/Name Landmark” in walk mode.
- Implement structure preservation and terrain-edit conflict policies.
- Invalidate and rebuild only affected summaries.
- Verify save/export/import behavior.

Exit criteria:

- A giant tower built in walk mode is visible at appropriate globe zoom levels.
- The exact tower returns after save/reload and descent from a different nearby anchor.
- Globe terrain edits correctly regenerate around saved voxel overrides.
- The complete two-way vertical slice passes automated and manual tests.

### Phase 4 — Excellent walk controls and building

**Goal:** Make movement and construction intrinsically enjoyable.

Tasks:

- Implement the unified input action map.
- Finish pointer lock, raycast targeting, placement preview, breaking, particles, and audio.
- Add tuned movement, sprint, crouch, swim, creative flight, and collision recovery.
- Add hotbar, inventory, creative catalog, block search, and favorites.
- Add controller support.
- Implement full mobile control customization.
- Add undo for recent creative block batches where feasible.
- Conduct latency and feel-focused playtests.

Exit criteria:

- Desktop and mobile players can move, select, place, and break without instructions after a short onboarding prompt.
- No common placement or movement action waits on persistence or terrain workers.
- Mobile minimum tier sustains the defined frame-rate target in the benchmark scene.

### Phase 5 — Excellent globe creativity tools

**Goal:** Make planetary creation fast, expressive, and safe.

Tasks:

- Consolidate globe tools around non-destructive typed features.
- Add mountain, biome, river, road, sculpt, smooth, and flatten tools.
- Implement brush previews, falloff, snapping, and touch gestures.
- Add layer management and visibility controls.
- Provide clear conflict previews for areas with player voxel edits.
- Add terrain presets and procedural stamps without hiding underlying parameters.
- Improve inspector hierarchy, naming, and bulk editing.

Exit criteria:

- A player can create a coherent island with mountains, rivers, roads, biome regions, and a settlement in under ten minutes.
- All physical edits produce correct walk-mode results.
- Undo/redo works across the full globe editing toolset.

### Phase 6 — Gameplay content and motivation

**Goal:** Turn the synchronized sandbox into a game people want to keep playing.

Tasks:

- Add resource drops and lightweight recipes.
- Add trees, vegetation, caves, ores, ruins, and several procedural landmarks.
- Add ambient/passive creatures with bounded simulation.
- Add day/night, weather, and biome ambience.
- Add Explorer rules while preserving Creative as a first-class mode.
- Add planet journal, discoveries, named landmarks, and milestones.
- Add death/recovery only if Explorer playtests benefit from it.

Exit criteria:

- The first 30 minutes contain exploration, discovery, building, and a meaningful return-to-globe payoff.
- Content is different across biomes without damaging performance budgets.
- Creative players can disable survival friction.

### Phase 7 — Mobile, PWA, and optimization pass

**Goal:** Make supported PCs and phones reliable release targets.

Tasks:

- Add device-tier defaults and graphics settings.
- Profile and optimize Cesium, noa, workers, memory, and storage.
- Implement responsive layouts and orientation handling.
- Add PWA manifest, service worker, offline shell, and asset caching.
- Test persistent storage behavior and quota recovery.
- Reduce initial bundle using mode-based lazy loading.
- Run extended real-device tests across iOS Safari and Android Chrome.

Exit criteria:

- Performance targets are met on defined reference devices.
- Core single-player play works after initial load without network access, excluding explicitly online imagery/search features.
- No critical UI is obscured by safe areas, browser chrome, or touch controls.

### Phase 8 — Reliability, onboarding, and playable alpha

**Goal:** Produce a distributable alpha with a coherent beginning and robust saves.

Tasks:

- Add world-creation flow with seed, size/radius profile, theme, and ruleset.
- Add contextual onboarding for globe creation, descent, building, and ascent.
- Add autosave recovery, backup snapshots, diagnostics export, and migration testing.
- Add accessibility settings and complete input rebinding.
- Run structured external playtests.
- Fix severity-one and severity-two issues.
- Prepare example worlds that demonstrate synchronization.

Exit criteria:

- A fresh player completes the full loop without developer assistance.
- No known save-loss issue remains.
- At least one hour of play survives repeated transitions, saving, reload, and export/import.
- The alpha has clear known limitations and device requirements.

---

## 14. Suggested code organization

```text
src/
  planet/
    domain/
      PlanetSave.ts
      PlanetFeature.ts
      PlanetStructure.ts
      VoxelOverride.ts
    commands/
    spatial/
      PlanetCellId.ts
      CubeSphere.ts
      LocalTangentFrame.ts
    terrain/
      SurfaceSampler.ts
      TerrainCompiler.ts
      BiomeRegistry.ts
      modifiers/
    structures/
      StructureAnalyzer.ts
      GlobeProxyBuilder.ts
    persistence/
      PlanetRepository.ts
      IndexedDbPlanetRepository.ts
      migrations/
    workers/
    selectors/
  adapters/
    cesium/
    noa/
  gameplay/
    player/
    inventory/
    crafting/
    simulation/
  input/
  ui/
```

Existing `globe`, `walk`, `drawing`, `state`, and `entities` code should migrate incrementally. Avoid a destructive rewrite that leaves the application unusable for weeks.

---

## 15. Engineering practices

- Strict TypeScript; isolate unavoidable third-party gaps in small adapter declarations.
- Pure domain functions wherever possible.
- One authoritative persistence coordinator.
- No renderer objects in Zustand planet data.
- No generated cache treated as source data.
- Feature flags for incomplete replacements during migration.
- Small vertical pull requests with tests and demo steps.
- Update the checklist and architecture decision records after each milestone.
- Profile before and after optimization work.
- Record generator changes because they can alter every untouched chunk.

Create architecture decision records for at least:

- Planet cell scheme.
- Terrain compilation and generator versioning.
- Sparse override format.
- Conflict policy between procedural terrain and player structures.
- Structure proxy representation.
- Persistence/archive format.
- Worker and cancellation strategy.

---

## 16. Prioritized first backlog

The first implementation cycle should be narrow and foundational:

1. Remove duplicate walk lifecycle ownership.
2. Retire Cesium block-building as a gameplay path.
3. Add the unified mode state machine.
4. Add typed noa adapter boundaries.
5. Define and test stable planet cell IDs.
6. Define schema v2 and migrate existing features.
7. Implement pure elevation and biome sampling.
8. Compile one global voxel chunk from that sampler.
9. Descend into that chunk through noa.
10. Save one globally addressed block override.
11. Render one Cesium proxy derived from that override.
12. Reload and verify both representations.

This “one mountain, one tower, one save” proof should precede inventory breadth, creatures, advanced city generation, or visual polish. It validates the defining technical promise of Voxelforge.

---

## 17. Playable-state definition of done

Voxelforge reaches its first genuinely playable state when all of the following are true:

- A player can create, name, save, export, import, and reopen a planet.
- Globe tools can author land, elevation, biome, water, roads, and landmarks.
- Those features deterministically generate corresponding walk-mode terrain.
- Walk mode provides polished movement, block interaction, hotbar, inventory, creative building, and lightweight exploration goals.
- Significant voxel construction and terrain destruction appear in globe mode.
- Edits survive mode transitions and reloads without coordinate drift or loss.
- Conflicts between globe regeneration and player structures are predictable and recoverable.
- Desktop mouse/keyboard and controller controls are comfortable.
- Mobile touch controls and layouts are usable on supported phones.
- Performance and memory stay within defined budgets on reference devices.
- Save failures, quota problems, and corrupt derived caches have visible recovery paths.
- A new player can complete the create → descend → explore/build → ascend loop without developer help.

The project should be judged primarily on the emotional payoff of that loop: the planet edited from orbit must feel unmistakably like the same place explored on foot, and what the player does on foot must feel consequential at planetary scale.
