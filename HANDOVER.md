# Voxelforge — Project Overview & Developer Handover Guide

> **Voxelforge** is a fantasy world-builder where you draw continents and cities on a 3D globe (CesiumJS), then descend into any location for first-person voxel construction (noa-engine). Every block placed in walk mode is georeferenced and reflected back on the globe in real time.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | React 18 + Vite |
| **Language** | TypeScript (Strict Mode) |
| **Globe renderer** | CesiumJS (`cesium`) |
| **Voxel engine** | noa-engine (`noa-engine`) |
| **State** | Zustand + immer |
| **Styling** | TailwindCSS |

---

## 📺 Two-Mode Architecture

```
┌───────────────────────┐   descend (click globe location)
│  GLOBE MODE (Cesium)     │  ───────────────────────────────────────┬────────────────────────────────────────┬──>
│  Draw continents,        │                                        │     WALK MODE (noa)      │
│  cities, landmarks.      │  WalkAnchor { lon, lat }               │  First-person voxel     │
│  Fantasy-only imagery.   │  GeoAnchor coordinate bridge           │  world. Place/break     │
└───────────────────────┘   VoxelChunkMap persisted to World     │  blocks. Changes geo-   │
        ^─────────────────────────────────────────────────────────────────────────────┴
                ascend ("Return to Globe" button)                  referenced & reflected on globe
```

## 📍 Coordinate System

- `GeoAnchor.ts` bridges Cesium lon/lat (°) ↔ noa integer block offsets (metres).
- `WalkAnchor { lon, lat, altM }` is stored in `World.walkAnchor`.
- noa axes: **+X = east, +Y = up, +Z = north**.
- Valid within ~50 km of anchor (flat-earth approximation).

## 📦 Voxel Persistence

- `World.voxelChunks: VoxelChunkMap` — sparse map of `"cx,cy,cz"` → `VoxelBlock[]`.
- On `WalkScene.dispose()`, dirty chunks are returned and merged into `worldStore`.
- IndexedDB autosave (existing terraforge persistence) picks them up automatically.

## ⚠️ Key Rules (inherited from terraforge)

1. Cesium `Box`/`Cylinder` don't support `HeightReference.CLAMP_TO_GROUND` — use `resolveTerrainHeightsForEntities`.
2. Always wrap updated `entity.position` in `ConstantPositionProperty`.
3. Custom `ImageryProvider` must expose a `get rectangle()` getter.
4. Typecheck: `npx tsc -b`.

## 🚀 Quick Start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
```

## 🚧 Walk Mode — Next Steps

- [ ] "Descend" button wired into TopBar / right-click context menu on globe
- [ ] Block hotbar UI (select which block to place)
- [ ] Globe tile renderer shows placed blocks as colored dots at correct lon/lat
- [ ] Biome-aware terrain generation (sample ProceduralFantasyImageryProvider at anchor)
- [ ] noa pointer-lock UX (crosshair HUD, ESC to release)
- [ ] Block break/place raycast from camera
