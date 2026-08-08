# Photorealistic 3D Buildings & City Textures

Terraforge currently renders city entities as uniform grids of identically-sized boxes with a repeating checkerboard facade. When zoomed in, the procedural tile imagery is a simple, regular street grid. This plan upgrades both systems to produce varied, Google-Earth-quality realism.

---

## User Review Required

> [!IMPORTANT]
> Two fundamental design decisions need your sign-off before execution begins:
> 1. **Building archetype data source** — Do you want building style/height determined purely by entity `tags` and `properties` (no extra UI), or would you like a new Inspector field (e.g. "City District Type" dropdown: Downtown, Midrise, Residential, Industrial)?
> 2. **Tile texture caching strategy** — The new city tile renderer is more expensive per tile. Should tiles be memoized by `(entityId, x, y, level)` in a `Map<string, Promise<ImageBitmap>>`, or is a simple LRU-cache of the last N canvases sufficient?

---

## Open Questions

> [!NOTE]
> - Should medieval/fantasy buildings share the same archetype system (just with different palette swaps), or stay on the current independent path?
> - Are parks / green spaces inside city polygons desired, or should the whole polygon render as dense urban?

---

## Proposed Changes

### A — City Tile Renderer (`src/globe/CesiumViewer.ts`)

The `ProceduralFantasyImageryProvider.requestImage` city branch needs a full rewrite. Currently it renders a fixed 32px repeating grid at all zoom levels.

#### Planned rendering logic (zoom-level aware):

| Level | What renders |
|---|---|
| 0–10 | Solid city color with subtle noise grain |
| 11–13 | Major arterial road grid (wider streets, city blocks) |
| 14–15 | Sub-block roads, distinct block shapes, park patches |
| 16–17 | Individual rooftops with varied colors, HVAC details, shadows |
| 18+ | Alley-level detail, sidewalks, trees lining streets |

**Key improvements per level:**
- **Arterial roads**: use a *seeded irregular* grid (not fixed 32px) — widths 6–18 px simulating highways, boulevards, and alleys depending on zoom.
- **Block interiors**: noise-selected from 4 archetypes per cell: *high-density rooftop cluster*, *midrise terrace*, *park / plaza green*, *industrial flat-roof*.
- **Rooftop detail (level 16+)**: per-building rectangle with a color drawn from a palette of ~8 realistic materials (tar gravel grey, white EPDM, terracotta, green sedum, blue glass atrium).
- **Shadows**: cast south-east at a 30° angle, length proportional to zoom (simulating sun angle).
- **Seeding**: all randomness keyed to `entity.id + tileX + tileY` so tiles are stable across re-renders.

#### [MODIFY] [CesiumViewer.ts](file:///d:/Documents/Development/mapgamething/src/globe/CesiumViewer.ts)
- Extract current city rendering into a standalone `drawModernCityTile(ctx, tileParams, level, seed)` helper function.
- Implement the zoom-level dispatch table described above.
- Add `drawCityBlock(ctx, bx, by, bw, bh, archetype, seed)` helper that renders a single city block cell.
- Add `drawRooftopDetail(ctx, rx, ry, rw, rh, palette, seed)` helper for level 16+ individual building rooftops.
- Memoize by `entity.id + x + y + level`.

---

### B — Facade Texture Generator (`src/globe/townStructures.ts`)

Current facades are flat uniform grids. Need variety within the same city.

#### [MODIFY] [townStructures.ts](file:///d:/Documents/Development/mapgamething/src/globe/townStructures.ts)

**New facade archetype functions** (each returns a `string` data URL cached by key):

| Function | Description |
|---|---|
| `getCurtainWallFacade(seed)` | Full-height blue/green glass curtain wall with reflective horizontal spandrel bands |
| `getConcreteCoreFacade(seed)` | Brutalist exposed concrete with small punched rectangular windows in rows |
| `getSetbackTowerFacade(seed)` | Art-deco style with gold detailing, stepped crown |
| `getResidentialFacade(seed)` | Brick or stucco, small balcony outlines, varied window spacing |
| `getIndustrialFacade(seed)` | Corrugated grey metal panels, large loading-dock-style openings |

Each facade texture will:
- Use **2+ gradient passes** (base wall color + reflective glaze) instead of flat fills.
- Include **horizontal spandrel bands** (slightly darker strips between floors).
- Add **night-glow variation** — ~15% of windows emit warm `#fef9c3` yellow (occupied) vs. dark blue (empty).
- Use a `seed` integer to deterministically vary window density and lit ratios.

**Building size/shape variation:**
- Replace the uniform `gridLimit` box array with a staggered layout:
  - Randomly rotate building boxes by ±5–15° (using Cesium's `hpr` on `Transforms.headingPitchRollToFixedFrame`).
  - Vary footprint aspect ratio: some buildings 20×60 (thin slabs), some 45×45 (square towers), some 80×25 (low-rise plates).
  - Add podium bases: a wider, shorter box below the tower.

**New building types beyond simple boxes:**

| Shape | Cesium primitive | Usage |
|---|---|---|
| Stepped setback tower | 3–4 stacked `BoxGraphics` of decreasing size | Art-deco / midrise |
| Cylindrical tower | `CylinderGraphics` | Signature landmark |
| L-shaped building | 2 overlapping `BoxGraphics` | Corner lots |
| Sloped roof residential | `Box` + `CylinderGraphics` cone | Townhouses |

**Terrain height resolution** remains via existing `resolveTerrainHeightsForEntities` — no changes needed there.

---

### C — 3D Building Layout (`src/globe/entitySync.ts` + `townStructures.ts`)

Currently all cities generate the same ring layout. Need district-based spatial variety.

#### [MODIFY] [townStructures.ts](file:///d:/Documents/Development/mapgamething/src/globe/townStructures.ts)

Introduce a `CityDistrict` system. For `modern` theme, divide the city into radial zones:

```
Zone 0 (center):          Mega-skyscraper cluster (height 300–600m)
Zone 1 (0–0.0008° ring):  High-rise office towers (150–300m, varied facades)
Zone 2 (0.0008–0.0018°):  Midrise commercial (60–150m, stepped towers)
Zone 3 (0.0018–0.003°):   Low-rise residential + parks (10–50m)
Zone 4 (≥0.003°):         Suburban / industrial fringe (5–20m, flat roofs)
```

Each zone uses a different mix of facade archetypes and building footprint sizes.

#### [MODIFY] [entitySync.ts](file:///d:/Documents/Development/mapgamething/src/globe/entitySync.ts)

- Read entity `properties.districtType` if present (future Inspector support) and pass to `createTownStructureEntities`.
- Add building count scaling: currently hardcoded to `gridLimit = 2`, make it proportional to `entity.properties.population` (if set) or entity polygon area.

---

### D — Biome Texture City Shader (`src/geo/biomeTexture.ts`)

The `generateCityUrbanShader` (used for polygon regions tagged as cities) needs the same overhaul as the tile renderer.

#### [MODIFY] [biomeTexture.ts](file:///d:/Documents/Development/mapgamething/src/geo/biomeTexture.ts)

- Replace the fixed 16-cell grid with a **seeded variable-pitch grid** (cell width 14–22 px based on noise).
- Add 4 block archetypes (dense, midrise, park, industrial) randomly distributed via `noise.noise2D(cellX, cellY)`.
- Add realistic **street markings**: dashed centre-line (`#f5f510`), pedestrian crossings (white stripes every N cells).
- Add **park interiors**: organic blob fills using a Simplex noise threshold (not rectangular patches).
- Add a subtle **ambient occlusion** pass: darken pixels within 2px of any building edge.

---

## Verification Plan

### Automated Tests
```bash
npx tsc -b
```
Zero TypeScript errors required before merging.

### Manual Verification
1. Load **🚀 Template Sci-Fi World** → Metropolis Core polygon → zoom from level 8 to 18 and verify tile detail increases progressively.
2. Load **Apex Plaza Tower** point entity → toggle **🏢 3D Buildings ON** → verify varied facades, podium bases, and cylindrical towers are visible.
3. Toggle **🎨 Fill OFF** → verify the underlying tile texture still shows crisp rooftops without relying on entity overlay.
4. Load **Middle-earth** → verify medieval buildings are unaffected by modern changes.
5. Run `npm run build` and confirm no bundler warnings from canvas operations.
