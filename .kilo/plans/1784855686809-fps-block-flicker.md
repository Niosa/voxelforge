# Fix: First-Person Block Flickering Below Ground

## Problem
In first-person mode, placed voxel blocks flicker and appear to jump below ground repeatedly.

## Root Cause Analysis

### Primary Issue: Terrain Height Race Condition in `updatePreview()`
**File**: `src/drawing/FirstPersonBuilder.ts`

The `updatePreview()` function (line 186) calls `globe.getHeight(carto)` directly **without caching**, while `entitySync.ts` uses `getSafeTerrainElevation()` which properly caches terrain heights. Cesium's `getHeight()` can:
- Return `undefined` or imprecise values when terrain tiles haven't finished loading
- Return different values on successive calls during terrain streaming
- Cause the preview entity position to jump erratically

**Evidence**: 
- `entitySync.ts:399` uses `getSafeTerrainElevation()` for voxel block rendering
- `FirstPersonBuilder.ts:186` uses raw `globe.getHeight()` without caching
- Both use different altitude offsets (+0.03 vs +0.02) which compounds the issue

### Secondary Issue: Interval-Based Preview Updates
**File**: `src/ui/layout/AppShell.tsx` (line 52-54)

The preview updates every 30ms via `setInterval`. When terrain is still loading:
1. `updatePreview()` samples terrain → gets height `h1` (or undefined)
2. Block placed at `h1 + altitude`
3. On next update, terrain loads, `getHeight()` returns `h2` (different)
4. Entity sync renders block at `h2 + altitude`
5. Block appears to jump/flicker between positions

### Tertiary Issue: Terrain Height Not Ready on Block Placement
When `placeCurrentStructure()` is called immediately after preview shows:
- The terrain height sampled for the preview may differ from when sync renders
- `entitySync.ts:458-459` uses `getSafeTerrainElevation()` which falls back to cached or 0

## Solution

### 1. Add Terrain Height Caching to FirstPersonBuilder
Mirror the caching approach from `entitySync.ts`:

```typescript
// In FirstPersonBuilder.ts, add at module level
const voxelTerrainCache = new Map<string, number>();

private getCachedTerrainHeight(lon: number, lat: number, viewer: Viewer): number {
  const key = `${lon.toFixed(6)}_${lat.toFixed(6)}`;
  const globe = viewer.scene.globe;
  const carto = Cartographic.fromDegrees(lon, lat);
  const rawH = globe.getHeight(carto);
  
  if (typeof rawH === 'number' && !isNaN(rawH)) {
    voxelTerrainCache.set(key, rawH);
    return rawH;
  }
  
  const cached = voxelTerrainCache.get(key);
  return typeof cached === 'number' ? cached : 0;
}
```

### 2. Reuse Cached Terrain Height in Place Mode
In `FirstPersonController.ts`, add a similar cache (`cachedTerrainHeight` already exists at line 423) and share it with `FirstPersonBuilder`, or have the builder maintain its own cache.

### 3. Synchronize Altitude Offsets
Both preview (line 188) and entity sync (line 459) should use identical altitude calculations:
- Current preview: `+ blockHeight / 2 + 0.02`
- Entity sync: `+ blockH / 2 + 0.03`
- Make them consistent (0.03 recommended for Z-fighting prevention)

### 4. Clear Cache on Camera Move
When the player moves significantly, invalidate the terrain cache to prevent showing stale heights for distant locations.

## Files to Modify
1. `src/drawing/FirstPersonBuilder.ts` - Add terrain height caching
2. `src/globe/FirstPersonController.ts` - Potentially share terrain cache
3. `src/globe/entitySync.ts` - Ensure consistent altitude offset with builder

## Validation
1. Enter first-person mode
2. Place blocks on varied terrain
3. Verify no flickering during placement
4. Verify blocks stay at consistent height when placing repeatedly