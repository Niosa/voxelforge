# Performance Work — Cross-Agent Context

> **Purpose:** persistent context about the low-memory/iPad performance effort so any
> agent picking up this repo understands what was done, why, where the tuning knobs
> live, and what must not be broken. Read this together with `HANDOVER.md`
> (architecture) and `CHECKLIST.md` (feature tasks).
> Last updated: 2026-08-05 (runtime smoothness pass; build/tests validated, device re-check pending).

---

## 1. The Problem (solved)

- **Device:** iPad 9th gen (2021) — A13 Bionic, **3 GB RAM**, 2160×1620 Retina, iPadOS 26.
- **Symptom:** Safari tab reloaded ~5–10 s after page load. This is a **jetsam memory
  kill**, not a JS error: the startup burst (entities + tiles + textures) exceeded the
  tab's memory budget (on 3 GB devices Safari typically kills tabs around ~1–1.5 GB).
- **Status:** fixed and confirmed stable on the physical device ("it works", 2026-07-23).

### Root causes that were addressed
1. Startup entity burst: all 3 border toggles defaulted ON → ~4,570 ground-polyline
   entities created in tight loops as async border datasets landed (~5–10 s mark).
2. Retina GPU tile pressure: `maximumScreenSpaceError = 2.0`, no `tileCacheSize` cap.
3. Unbounded caches: biome canvases (keyed per zoom+bounds!), fantasy tile canvases,
   pin dataURLs, facade/material dataURLs.
4. PNG re-encode churn: `canvas.toDataURL` on every entity re-sync; 5× per mountain.
5. No frustum culling: `frustumCullingEnabled` flag existed but no culler ran.
6. Main-thread CPU spikes: 128×128 per-pixel simplex noise per texture at startup.

---

## 2. What Was Implemented (fix → files → constants)

| # | Fix | Files | Key constants / API |
|---|-----|-------|---------------------|
| 1 | Bounded LRU caches | `src/utils/lruCache.ts`, applied in `biomeTexture.ts`, `CesiumViewer.ts`, `pinGraphics.ts`, `townStructures.ts` | biome canvas **60**, dataURL **60**, fantasy tiles **200**, pins **150**, facade/material **100** |
| 2 | Encoded dataURL cache | `src/geo/biomeTexture.ts` | `buildCacheKey()`, `dataUrlCache`, `clearBiomeTextureCaches()` |
| 3 | Adaptive Performance Mode | `src/state/performanceMode.ts`, `src/state/uiStore.ts`, `src/ui/layout/HamburgerMenu.tsx`, `src/globe/CesiumViewer.ts` | see §3 |
| 4 | Startup burst smoothing | `src/globe/borderOverlay.ts` | `BORDER_BATCH_SIZE = 250`, `yieldToMainThread()` (`setTimeout(0)`), `initialLoadDeferred` (~1.2 s) |
| 5 | Frustum culling | `src/globe/entitySync.ts` | `ensureFrustumCuller()` / `applyFrustumCulling()` on `camera.moveEnd` + after every sync; 5° margin; antimeridian-safe |
| 6 | Background hygiene | `src/globe/CesiumViewer.ts` | `attachBackgroundCacheHygiene()`: `visibilitychange` hidden > **30 s** → `clearEphemeralGlobeCaches()` + `clearBiomeTextureCaches()` |

---

## 3. Performance Mode — How It Works

**Detection** (`src/state/performanceMode.ts`): ON when iOS/iPadOS UA
(`/iPad|iPhone|iPod/` or `MacIntel` + `maxTouchPoints > 1`), or `deviceMemory <= 4`,
or `hardwareConcurrency <= 4`.
- On the iPad 9, detection rides the **UA path**: Safari doesn't report `deviceMemory`,
  and the A13 exposes 6 cores (> 4), so the hardware checks alone would miss it.
- Manual override persisted in localStorage key `terraforge_performance_mode_v1`;
  **the override always wins** over auto-detection (covers false positives on newer iPads).
- **Both API naming conventions exist and are referenced — keep both:**
  `isPerformanceModeActive` / `setPerformanceModeOverride` **and**
  `getInitialPerformanceMode` / `persistPerformanceMode`.

**State** (`uiStore.ts`): `performanceMode` boolean + `setPerformanceMode` (persists
override). `showCityBorders` defaults OFF when low-power at store creation.

**Toggle UI** (`HamburgerMenu.tsx`, "⚡ Mobile Performance & Culling" section): calls
`setPerformanceMode` → `applyPerformanceModeSettings()` → full re-sync
(`resetEntitySyncState()` + `syncWorldBordersData` + `syncEntitiesToCesium`).

**Degradations when ON** (all behind the flag — desktop/new devices unaffected):

| Knob | Normal | Perf Mode | Where |
|---|---|---|---|
| `globe.maximumScreenSpaceError` | 2.0 | **4.0** | `CesiumViewer.applyPerformanceModeSettings()` |
| `globe.tileCacheSize` | 100 | 50 | same |
| `viewer.resolutionScale` | 1.0 | 0.75 | same |
| fog / skyAtmosphere | on | off | same |
| Borders | country+state+city | **country only** | `borderOverlay.ts` (`stateShow`/`cityShow` gated) |
| Town structures (fantasy) | on | off | `entitySync.ts` `showBuildings` gate |
| Biome texture size | 256 px | **128 px** | `entitySync.ts` `textureResolution`; fantasy provider `resolution` arg |
| WorkerPool size | 2–8 | 2 | `src/workers/WorkerPool.ts` |

---

## 4. Targets & Tuning Rationale (iPad 9 = A13 + 3 GB)

The device's constraint is **RAM, not GPU/CPU**. Every cut above targets memory;
two knobs were deliberately **softened** after on-device validation because the
A13 can afford more quality than the original plan assumed:

- **SSE 4.0 (not 6.0):** tile demand scales ~quadratically with SSE, so 2→4 is ~4×
  fewer tiles (2→6 would be ~9×). With `tileCacheSize = 50` already capping the
  texture memory (~13 MB vs ~26 MB), SSE 4 keeps Retina satellite imagery visibly
  sharper at no real risk.
- **128 px biome textures (not 64):** 4× fewer pixels than 256 (LRU worst case
  ~3.8 MB vs ~15 MB) but don't turn to mush when editing zoomed-in fills.
  64 px was 16× fewer and looked bad on Retina.

**Perf-mode worst-case bounded memory:** ~4 MB biome canvases (60 × 64 KB) +
~3 MB dataURLs + ~13 MB globe tiles + ~13 MB fantasy tile cache + ~2,800 fewer
border entities than full mode. Comfortably under the jetsam zone.

**If tab reloads ever return on the device, re-tighten in this order:**
1. `maximumScreenSpaceError` back to `6.0` (`applyPerformanceModeSettings` — the single biggest lever, one line).
2. Biome textures back to `64` (`entitySync.ts` `textureResolution` + fantasy provider `resolution` arg).
3. `tileCacheSize` 50 → 30.

---

## 5. Gotchas — Do Not Break These

1. **`resolution` must be passed by every biome-texture call site** or it silently
   renders 256 px in perf mode: `entitySync.ts` (2 sites: mountain tiers + polygon
   fill) and the `ProceduralFantasyImageryProvider.requestImage` call in
   `CesiumViewer.ts`. `rebuildFantasySatelliteTexture` intentionally stays 256 px
   (one-time 2048×1024 master texture).
2. **`ManagedRecord.perfMode` is part of entitySync change detection** — it's what
   makes the runtime Performance Mode toggle rebuild entities (new texture res,
   buildings removed/added). Don't remove it from the comparison or the record.
3. **Never reintroduce plain `Map` for these caches.** The whole point is the hard
   cap. If a new cache is added, use `LruCache` with a deliberate budget.
4. **`syncWorldBordersData` is async, batched, and guarded by `isSyncing`.** Don't
   call it expecting synchronous completion; visibility toggles are applied at the
   top of the function before the guard on purpose.
5. **The frustum culler only hides `managed` (entitySync) entities**, not
   borderOverlay polylines. Click selection still works on hidden entities via the
   geographic containment fallback in `GlobeView.tsx` — keep that fallback intact.
6. **React Strict Mode double-invocation:** `GlobeView` must not guard its mount
   effect and must not destroy the viewer on cleanup (see the long comments in
   `GlobeView.tsx` / `createTerraforgeViewer`). Several historical bugs came from this.
7. **Cesium position updates must be wrapped in `ConstantPositionProperty`**
   (see HANDOVER.md rule 2).
8. **Concurrent agents:** this workspace has had two agents editing simultaneously.
   After any merge/overwrite, check for duplicate declarations (this bit us in
   `uiStore.ts` and `HamburgerMenu.tsx`) and run the build before continuing.
9. **No test suite exists.** Validation = `npm run build` (tsc -b && vite build)
   must stay clean, plus manual device checks for memory work.

---

## 6. Related Recently-Completed Work (same tree, separate task)

Selection picking/stacking overhaul (completed before the perf work):
- `src/geo/geometryArea.ts` — shoelace ring area (real area, not bbox).
- `GlobeView.rankCandidates` — points rank before polygons; polygons by smallest
  area; direct picks + click coords passed via `RankContext`.
- `entitySync.ts` — ground-clamped fills stacked by area rank (`zIndex`) so visuals
  match pick ranking.

---

## 7. Validation Status

- [x] `npm run build` clean after every change.
- [x] Physical iPad 9 (iPadOS 26): no reloads after fix; Performance Mode auto-ON.
- [x] Desktop regression: perf mode OFF leaves visuals/behaviors unchanged.
- [ ] Chrome DevTools heap profiling over 3 min pan/zoom (recommended if memory work resumes).
- [ ] Re-validate softened knobs (SSE 4, 128 px) on device over a longer session.

---

## 8. Runtime Smoothness Pass (2026-08-05)

- `WalkScene` now runs NPC, mob, and traffic logic at a bounded 13 Hz normally
  and about 7 Hz in Performance Mode; player physics, input, and camera bobbing
  remain on NOA's normal tick.
- `PlanetTerrainSampler` precomputes polygon bounds and point footprints, avoiding
  full polygon math, temporary arrays, and sorting for every generated column.
- Legacy voxel edits are indexed by chunk once instead of rescanned for every
  `worldDataNeeded` request.
- Performance Mode renders at most four generated voxel columns / 5,000 boxes on
  the globe, and asynchronous Cesium primitives share one render-readiness pump.
- Mobile joystick movement updates its transform directly without React renders;
  touch look remains immediate to avoid adding a frame of camera latency.
- Selecting a globe entity no longer tears down and rebuilds fantasy imagery.
- `WalkScene` is dynamically imported during descent. The initial application
  bundle fell from about **1,862 kB to 577 kB** uncompressed; the 1,284 kB walk
  engine chunk loads only when walk mode is first entered.
