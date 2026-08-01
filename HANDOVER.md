# Terraforge — Project Overview & Developer Handover Guide

> **Terraforge** is a modern, high-performance 3D world-building application built with **React**, **TypeScript**, **Zustand**, and **CesiumJS**. It enables users to draw custom continents, regions, cities, and landmarks on an interactive 3D globe with realistic procedural satellite imagery, procedural biomes, and 3D architectural models.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | React 18 + Vite |
| **Language** | TypeScript (Strict Mode) |
| **3D Engine** | CesiumJS (`cesium`) |
| **State Management** | Zustand (with `immer` middleware) |
| **Styling** | TailwindCSS + Vanilla CSS utilities |

---

## 📁 Repository Structure & Key Files

```
mapgamething/
├── src/
│   ├── entities/
│   │   ├── types.ts           # Core Entity, World, Geometry, and Biome TypeScript definitions
│   │   ├── factory.ts         # Entity creation helpers & default property initializers
│   │   └── samples.ts         # Preset world generators (Earth, Middle-earth, Demo, Template Sci-Fi)
│   ├── geo/
│   │   ├── biomeTexture.ts    # Procedural HTML Canvas texture shaders for biomes & city urban grids
│   │   └── centroid.ts        # Polygon & geometry centroid calculators
│   ├── globe/
│   │   ├── CesiumViewer.ts    # Main Cesium setup, imagery layers, ProceduralFantasyImageryProvider
│   │   ├── entitySync.ts      # Reactive synchronizer mapping Zustand entities into Cesium entities
│   │   ├── townStructures.ts  # Procedural 3D structures (skyscrapers, glass facades, cottages, walls)
│   │   └── pinGraphics.ts     # Procedural SVG pin icons for map landmarks
│   ├── state/
│   │   ├── worldStore.ts      # Main world state, entity dictionary CRUD, preset loader
│   │   └── uiStore.ts         # Active tool, inspector panel state, fantasy 3D buildings toggle
│   └── ui/
│       ├── layout/
│       │   ├── TopBar.tsx             # Header controls (theme, imagery, 3D terrain, preset selector)
│       │   ├── InspectorPanel.tsx     # Right sidebar inspector for editing selected entity properties
│       │   ├── GlobeView.tsx          # Canvas container mounting CesiumViewer
│       │   └── WorldManagerModal.tsx  # World save/export/import modal
│       └── tutorial/
│           └── TutorialModal.tsx      # User onboarding modal
├── HANDOVER.md                # Handover documentation (this file)
├── CHECKLIST.md               # Quick development checklist & active tasks
└── AGENT_RULES.md             # Codebase conventions & rules for AI assistants
```

---

## 💡 Core Subsystems & Technical Architecture

### 1. Dual Mode System (Real Earth vs. Fantasy World)
* **Real Earth Mode**: Leverages standard geographic tiling providers (Esri Satellite, OpenStreetMap, Topo maps) and real-world 3D OSM / Google Photorealistic 3D tilesets.
* **Fantasy Mode**: Renders user-drawn worlds (or presets like Middle-earth or Template Sci-Fi) on an ellipsoid. Real-world satellite imagery is suppressed.

### 2. Multi-Tiered Procedural Imagery (`ProceduralFantasyImageryProvider`)
* Located in `src/globe/CesiumViewer.ts`.
* Implements a custom Cesium `ImageryProvider` using `WebMercatorTilingScheme`.
* Dynamically generates 256x256 pixel canvas tiles on demand as the user pans and zooms, adhering to 4 Level of Detail (LoD) tiers:
  * **Tier 1 (Levels 0–10 - Orbital)**: Clean solid district base fills without visual noise or moiré.
  * **Tier 2 (Levels 11–13 - Regional)**: Major arterial dark asphalt highways (6px), cobble avenues, and district green parks.
  * **Tier 3 (Levels 14–16 - Neighborhood)**: Full secondary street networks, block subdivisions, building footprints, and 3D cast drop shadows.
  * **Tier 4 (Levels 17+ - Street / Rooftop)**: Google Earth photorealistic rooftops (heliports with 'H' markings, HVAC cooling units, skylight atriums), yellow dashed lane centerlines, pedestrian crosswalks, sidewalk curbs, and roadside tree canopy dots.

### 3. Dynamic 3D Architectural Models (`src/globe/townStructures.ts`)
* Automatically generates 3D buildings, glass high-rises, megastructures, timber cottages, city defensive walls, and trees for `Point` entities of type `city` or `town`.
* Features procedurally generated window facade textures using `ImageMaterialProperty`.
* Contains special layouts for iconic fantasy cities (e.g., Minas Tirith tiers, Barad-dûr spire, White Tower of Ecthelion).

### 4. Dynamic Terrain Height Resolution (`resolveTerrainHeightsForEntities`)
* Located in `src/globe/entitySync.ts`.
* Uses `sampleTerrainMostDetailed` to query elevation at entity coordinates and dynamically shifts 3D buildings/structures to sit flush on top of terrain meshes.

---

## ⚠️ Essential Implementation Rules for Developers & AI Agents

1. **Cesium `BoxGraphics` and `CylinderGraphics` Altitude Behavior**:
   * Cesium `Box` and `Cylinder` shapes **do not support** `HeightReference.CLAMP_TO_GROUND`.
   * Initial position height must be set relative to shape center (e.g., `height / 2`), and elevation must be resolved via `resolveTerrainHeightsForEntities`.

2. **Cesium Entity Position Mutability**:
   * When updating `entity.position` after creation, **always wrap the updated `Cartesian3` in a `ConstantPositionProperty`**:
     ```typescript
     ent.position = new ConstantPositionProperty(Cartesian3.fromDegrees(lon, lat, height)) as any;
     ```
   * Assigning a raw `Cartesian3` directly to `ent.position` replaces the property object and crashes Cesium's internal render loop (`ent.position.getValue is not a function`).

3. **Custom Cesium `ImageryProvider` Requirements**:
   * Custom `ImageryProvider` implementations must expose a `rectangle` getter (`get rectangle() { return this.tilingScheme.rectangle; }`). Omitting `rectangle` causes Cesium's `ImageryLayer._createTileImagerySkeletons` to throw `DeveloperError: Expected rectangle to be typeof object, actual typeof was undefined`.

4. **TypeScript Verification**:
   * Always verify code changes with strict type compilation:
     ```bash
     npx tsc -b
     ```

---

## 🚀 Quick Command Reference

```bash
# Install dependencies
npm install

# Start local development server (Vite on http://localhost:5173)
npm run dev

# Strict TypeScript typecheck
npx tsc -b

# Build for production
npm run build
```
