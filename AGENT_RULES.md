```markdown

## Terraforge — Standing Rules for IDE AI Agents

You are implementing **Terraforge**, a browser PWA where players build custom continents, regions, cities, and islands on a Google Earth–like 3D globe.

Canonical plan: `/PROJECT_PLAN.md`  
Phase tracking: `/CHECKLIST.md`  
Data model: `/docs/DATA_MODEL.md`

## Mission

Ship a sleek, performant, kid-friendly world-building globe. Drawing polygons must feel as easy as Google Earth's polygon tool. Mobile touch is first-class.

## Hard rules

1. **TypeScript strict.** No `any` unless justified in a one-line comment. Prefer `unknown` + narrowing.
2. **Single source of truth:** entity data lives in Zustand (`src/state/worldStore.ts`). The Cesium globe is a **view** that diffs from the store — never the reverse.
3. **Cesium viewer lifecycle:** create the `Viewer` **once**. React must not destroy/recreate it on parent re-renders. Use a module singleton or ref held outside render churn (`src/globe/CesiumViewer.ts`).
4. **Mutations only via commands** (`src/state/history/commands.ts`) so undo/redo always works.
5. **All geography is GeoJSON** (Polygon | MultiPolygon | Point). Use Turf.js for area, centroid, simplify, boolean checks.
6. **No Google Maps / Google Earth / Mapbox paid tiles** in v1. Stylized globe only (solid ellipsoid + optional free/public-domain textures with license noted in `/docs/ASSETS.md`).
7. **Cesium ion token is optional.** App must run with `Ion.defaultAccessToken` unset and **no ion imagery**. Use `EllipsoidTerrainProvider` + solid/color globe or local imagery.
8. **Mobile-first:** hit targets ≥ 44px; draw mode must not fight pinch-pan (explicit tool modes: `select` | `pan` | `drawPolygon` | `editVertices` | `placePoint`).
9. **One feature per change set.** Do not skip phases. Do not add multiplayer, AI lore, or real Earth tiles before Phase 6.
10. **After each phase:** update `CHECKLIST.md` checkboxes; append 3–5 bullet demo steps to `docs/DEMO.md`.
11. **Tests:** Vitest for `src/geo/*` and command undo; no flaky Cesium screenshot tests in v1.
12. **Imports:** use `@/` path alias → `src/`.
13. **Accessibility:** toolbar buttons have `aria-label`; Esc cancels draw; `/` focuses search (when search exists).
14. **Performance:** never `dataSources.removeAll()` + full reload on each keystroke. Diff add/update/remove entities by `id`.
15. **Images (later phases):** resize/compress before IDB; revoke object URLs on unmount.

## Stack (do not substitute without noting in CHECKLIST)

- Vite + React 18 + TypeScript
- CesiumJS via `vite-plugin-cesium` (or `vite-plugin-cesium-build` if needed)
- Zustand + Immer
- Turf.js
- Tailwind CSS
- idb (Phase 5+)
- MiniSearch (Phase 5+)
- Framer Motion (UI polish)
- vitest + Playwright (e2e later)

## Coding patterns

### Cesium + React
```ts
// ✅ Good: effect runs once; cleanup destroys viewer only on unmount
useEffect(() => {
  const viewer = createTerraforgeViewer(containerRef.current!);
  setViewer(viewer);
  return () => destroyTerraforgeViewer();
}, []);
```


### Store → Globe sync

```ts
// worldStore.subscribe → entitySync.applyDiff(prev, next)
```


### Commands

```ts
history.execute(new AddEntityCommand(entity));
history.undo();
history.redo();
```


## Definition of done (every task)

- [ ] Types compile (`tsc --noEmit`)
- [ ] `npm run dev` shows no red console errors for the happy path
- [ ] Mobile mental check: “can a kid do this with one thumb?”
- [ ] CHECKLIST.md updated
- [ ] No secrets committed (`.env` gitignored)


## Out of scope until backlog

Real-time multiplayer, Cesium ion photorealistic tiles, native App Store apps, server authoritative worlds, AI generation.

```
