# Plan: Fix Older iPad Random Reloads/Crashes

## Goal
Stop Safari tab reloads/crashes on the older iPad (crash signature: reload ~5–10s after page load = memory kill during startup burst) without regressing desktop or newer devices.

## Root Causes (confirmed in code)
1. **Startup memory burst**: all 3 border toggles default ON (`uiStore.ts:40-42`) → ~4,570 ground-polyline entities created in tight loops once async datasets land (`borderOverlay.ts`) — lands right around the 5–10s mark.
2. **Retina GPU tile pressure**: `maximumScreenSpaceError = 2.0` (`CesiumViewer.ts:1151`) → on Retina iPad, hundreds of 512² GPU textures stream in. No `tileCacheSize` cap.
3. **Unbounded caches** (progressive growth → later reloads):
   - `biomeTexture.canvasCache` (`biomeTexture.ts:31`) — key includes zoom level + tile bounds; every camera position in fantasy mode adds a permanent ~256KB canvas.
   - `ProceduralFantasyImageryProvider.tileCache` (`CesiumViewer.ts:33`) — per-tile canvases forever.
   - `pinGraphics.pinCache`, `townStructures` `facadeCache`/`materialCache` — keyed on arbitrary colors/seeds.
4. **PNG re-encode churn**: `getBiomeTextureDataUrl` calls `canvas.toDataURL` on every entity re-sync (`entitySync.ts:450,519`); mountains do 5 tiers each.
5. **No frustum culling**: `frustumCullingEnabled` flag exists (`uiStore.ts:44`) but no culler runs — every entity renders always.
6. Main-thread CPU spikes: 128×128 per-pixel simplex noise per biome texture, synchronously at startup.

## Fixes (ordered)

### 1. Bound all canvas/texture caches with LRU
- New `src/utils/lruCache.ts` (tiny get/set/evict Map wrapper).
- Apply: `biomeTexture.canvasCache` → cap ~60; fantasy `tileCache` → cap ~200; `pinCache` → cap ~150; `facadeCache`/`materialCache` → cap ~100.

### 2. Cache encoded dataURLs
- In `biomeTexture.ts`, keep an LRU of dataURL strings keyed identically to the canvas key; only call `toDataURL` on miss. Eliminates repeated PNG encoding on every re-sync.

### 3. Adaptive "Performance Mode"
- New `src/state/performanceMode.ts` (or extend `uiStore`): `performanceMode: boolean`, auto-detected ON when iOS/iPadOS UA **or** `deviceMemory <= 4` **or** `hardwareConcurrency <= 4`; manual override toggle in `HamburgerMenu`/`TopBar`, persisted via guarded localStorage.
- When ON:
  - `maximumScreenSpaceError` → 6; `globe.tileCacheSize` → ~50; `viewer.resolutionScale` → 0.75.
  - Skip city borders entirely; country borders only (state borders optional off).
  - Skip town-structure generation (`entitySync.ts` `showBuildings` gate).
  - Biome textures at 64×64 (or flat `ColorMaterialProperty` fallback).
  - `WorkerPool` size → 2.
  - Disable fog/skyAtmosphere.

### 4. Smooth the startup burst
- On low-power: default `showCityBorders = false` (drops 2,156 entities); load country borders only.
- Chunk border entity creation into batches of ~250 with `setTimeout(0)`/`requestIdleCallback` yields between batches (`borderOverlay.ts` three loops).
- Defer border loading until ~1s after first render completes.

### 5. Re-add camera-based entity culling
- In `entitySync.ts`, throttle (~250ms) a camera listener that hides managed entities whose stored `bbox` is outside the current view or beyond a distance threshold; respect `frustumCullingEnabled`.

### 6. Background hygiene (cheap)
- On `visibilitychange` hidden > 30s: clear ephemeral caches (tileCache, canvasCache) to cut jetsam odds on resume. WebGL context-loss handling already exists.

## Files Affected
- New: `src/utils/lruCache.ts`, `src/state/performanceMode.ts`
- Edit: `src/geo/biomeTexture.ts`, `src/globe/CesiumViewer.ts`, `src/globe/borderOverlay.ts`, `src/globe/entitySync.ts`, `src/globe/pinGraphics.ts`, `src/globe/townStructures.ts`, `src/workers/WorkerPool.ts`, `src/state/uiStore.ts`, `src/ui/layout/TopBar.tsx` (or `HamburgerMenu.tsx`)

## Validation
1. `npm run build` clean.
2. Desktop regression: all worlds load; selection/editing intact; borders/fills visually unchanged with Performance Mode OFF.
3. Chrome DevTools (iPad emulation + 4× CPU throttle): heap stable over 3 min of pan/zoom; cache sizes stay bounded (log counts).
4. Real iPad via preview/ngrok: no reload within 5+ min of idle + pan/zoom; draw/edit works.
5. Manual Performance Mode toggle on desktop: verify graceful visual degradation.

## Risks / Notes
- Slightly blurrier imagery on low-power mode (SSE 6, resolutionScale 0.75) — acceptable tradeoff.
- Borders appear progressively while chunked loading — acceptable (secondary visual).
- Auto-detect false positives on newer iPads → manual override is persisted and wins.
- Keep every degradation behind the Performance Mode flag so desktop/new devices are unaffected.

## Open Questions
- None blocking. (iPad model/iOS version unknown; auto-detection + manual toggle covers it.)
