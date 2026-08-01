# Terraforge checklist

## Phase 0 — Bootstrap
- [x] Vite React-TS project created
- [x] Tailwind, Cesium plugin, Zustand, Turf, path alias `@/` configured
- [x] Folder structure + stub modules in place
- [x] `npm run dev` launches without errors
- [x] README with scripts

## Phase 1 — Globe shell
- [x] Singleton Cesium viewer fullscreen
- [x] No ion token required; stylized ellipsoid globe
- [x] Mouse + touch orbit/zoom/tilt
- [x] UI chrome skeleton (top bar, tool rail, inspector placeholder)
- [x] Safe-area / mobile layout shell

## Phase 2 — Entities + render
- [x] TerraEntity / World types
- [x] worldStore + sample demo entities
- [x] Polygon + point rendering with labels
- [x] Click to select + inspector fields (name, type, color, description)
- [x] Delete selected

## Phase 3 — Drawing
- [x] DrawPolygonTool (tap vertices, close, cancel)
- [x] PlacePointTool
- [x] Command-stack undo/redo
- [x] Turf centroid/area helpers
- [ ] Works on iOS Safari touch

## Phase 4 — Hierarchy + layers
- [ ] parentId + manual parent picker
- [ ] Optional auto-parent via point-in-polygon
- [ ] Layers panel (filter by type, labels toggle)
- [ ] Color/opacity presets

## Phase 5 — Search + persistence + images
- [x] OpenStreetMap Nominatim Real Earth place search + fly-to
- [x] Google Earth 3D pin billboards (Teardrop, Beacon, Banner, Pushpin) & vertical 3D tethers
- [x] High-res imagery layers (Satellite, OpenTopoMap, CartoDB) & 3D Terrain elevation toggle
- [x] IndexedDB autosave + world library
- [x] Export/import `.terraforge.json`
- [ ] Image attach (compress + IDB blobs)

## Phase 6 — Polish + PWA
- [ ] Label LOD / perf budget
- [ ] Onboarding tour
- [ ] PWA installable
- [ ] Vitest geo + command tests
- [ ] Playwright smoke: draw → reload

## Phase 7 — Fun + share
- [ ] Stats + badges
- [ ] Read-only share link
- [x] High-detail fantasy cartography & Google Earth photorealistic satellite land textures (hillshading, surface normals, 3D procedural city building layouts, stepped 3D contour mountain chains, Google Photorealistic 3D Tiles, real-time dynamic procedural satellite imagery painting, topography & climate parameters, smooth 5-tiered sloped mountain contours, and World Theme selection for Medieval vs Modern Sci-Fi 3D cities/satellite textures)
