# Terraforge Project Plan

Terraforge is a browser PWA where players build custom continents, regions, cities, and islands on a Google Earth–like 3D globe.

## Phases
- **Phase 0**: Bootstrap — Vite + React + TS, Cesium viewer singleton, Zustand store, dark UI chrome, GeoJSON schema.
- **Phase 1**: Globe shell — Camera controls, inertia, min/max zoom, touch tilt, camera persistence.
- **Phase 2**: Entities & rendering — Polygon & Point rendering, labels, click selection, inspector editing, deletion.
- **Phase 3**: Drawing tools — Polygon draw tool, vertex edit tool, city/point placement tool, command stack undo/redo.
- **Phase 4**: Hierarchy & layers — Parent-child entity hierarchy, auto-parenting via Turf.js, layers panel.
- **Phase 5**: Search, persistence & images — MiniSearch, IndexedDB autosave, import/export `.terraforge.json`, image attachments.
- **Phase 6**: Polish & PWA — Label LOD, onboarding tour, PWA installation, Vitest & Playwright testing.
- **Phase 7**: Fun & share — World stats, badges, read-only share link, visual theme packs.
